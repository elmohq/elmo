/**
 * Server-side write gates for DB-backed config, in the helpers.ts style.
 *
 * Thin wrappers over the pure evaluators in `@workspace/lib/config/policy`: they
 * resolve the deployment mode and the caller's {@link ConfigActor}, run the
 * evaluator, and throw the deny reason. The security decision lives in the pure
 * layer (tested exhaustively by the contract suites); these just wire it to the
 * request's session, the mode, and the DB.
 *
 * SCOPE-RESOLUTION CONTRACT: callers pass the ALREADY-RESOLVED owning org id.
 * Brand/prompt-scoped writes must be resolved to their org server-side first
 * (brand → `brands.organizationId`; prompt → brand → org); client-supplied ids
 * are only inputs to that resolution, never trusted as scope. That resolution is
 * the caller's job (Round 4b) — these gates take the resolved `orgId`.
 */
import {
	type ConfigActor,
	type ConfigEntity,
	evaluateConfigWrite,
	evaluateEntityWrite,
} from "@workspace/lib/config/policy";
import type { ConfigScope } from "@workspace/lib/config/types";
import { db } from "@workspace/lib/db/db";
import { member } from "@workspace/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { requireAuthSession, isAdmin } from "@/lib/auth/helpers";
import { getDeployment } from "@/lib/config/server";

type AuthSession = Awaited<ReturnType<typeof requireAuthSession>>;

/**
 * Build the write actor for `orgId`: instance-admin from the session, org role
 * from the caller's `member` row in that org (null = not a member of it). Pass
 * `orgId = null` for scopes with no owning org (instance scope / entity writes),
 * which skips the membership query.
 */
export async function getConfigActor(session: AuthSession, orgId: string | null): Promise<ConfigActor> {
	const isInstanceAdmin = isAdmin(session);
	if (!orgId) return { isInstanceAdmin, orgRole: null };

	const [row] = await db
		.select({ role: member.role })
		.from(member)
		.where(and(eq(member.userId, session.user.id), eq(member.organizationId, orgId)))
		.limit(1);

	const orgRole = row ? (row.role === "admin" ? "admin" : "member") : null;
	return { isInstanceAdmin, orgRole };
}

/** Throw unless the caller may write `key` at `scope` for the resolved `orgId`. */
export async function requireConfigWrite(input: {
	key: string;
	scope: ConfigScope;
	orgId: string | null;
}): Promise<void> {
	const session = await requireAuthSession();
	const actor = await getConfigActor(session, input.orgId);
	const decision = evaluateConfigWrite({ mode: getDeployment().mode, key: input.key, scope: input.scope, actor });
	if (!decision.allowed) throw new Error(`Forbidden: ${decision.reason}`);
}

/**
 * Batch form for a multi-key save that reuses an in-hand session: the actor is
 * the same for every key at one (scope, org), so resolve it once (one `member`
 * query) and check each key's per-key policy. Throws on the first denied key.
 */
export async function requireConfigWrites(
	session: AuthSession,
	input: { keys: string[]; scope: ConfigScope; orgId: string | null },
): Promise<void> {
	const actor = await getConfigActor(session, input.orgId);
	const mode = getDeployment().mode;
	for (const key of input.keys) {
		const decision = evaluateConfigWrite({ mode, key, scope: input.scope, actor });
		if (!decision.allowed) throw new Error(`Forbidden: ${decision.reason}`);
	}
}

/** Throw unless the caller may write the given entity table (instance-admin only). */
export async function requireEntityWrite(entity: ConfigEntity): Promise<void> {
	const session = await requireAuthSession();
	const actor: ConfigActor = { isInstanceAdmin: isAdmin(session), orgRole: null };
	const decision = evaluateEntityWrite({ mode: getDeployment().mode, entity, actor });
	if (!decision.allowed) throw new Error(`Forbidden: ${decision.reason}`);
}
