#!/usr/bin/env tsx
import { readFile } from "node:fs/promises";
import { loadEnvFile } from "node:process";
import { parseArgs } from "node:util";

const HELP = `Manage audited custom cloud entitlement revisions.

Usage:
  custom-entitlements set --organization-id ID --actor-user-id USER --reason TEXT --input FILE|-
    [--effective-from ISO] [--effective-until ISO] [--expected-revision N --apply]
  custom-entitlements replace --organization-id ID --actor-user-id USER --reason TEXT --revision N --input FILE|-
    [--effective-from ISO] [--effective-until ISO] [--expected-revision N --apply]
  custom-entitlements revoke --organization-id ID --actor-user-id USER --reason TEXT --revision N
    [--expected-revision N --apply]
  custom-entitlements current --organization-id ID [--at ISO]
  custom-entitlements list --organization-id ID

Mutation commands are dry-run by default. Applying requires both --apply and
the --expected-revision printed by a fresh dry run. Use --env-file PATH to load
DATABASE_URL before connecting. No command runs migrations or prints the
database URL or full entitlement payload. The revoke action cancels a future
revision or revokes the currently active revision; expired and already-revoked
revisions are immutable. Set and replace also require the worker's exact
SCRAPE_TARGETS so unavailable contract targets are rejected before apply.`;

const { positionals, values } = parseArgs({
	allowPositionals: true,
	strict: true,
	options: {
		"organization-id": { type: "string" },
		"actor-user-id": { type: "string" },
		reason: { type: "string" },
		input: { type: "string" },
		"effective-from": { type: "string" },
		"effective-until": { type: "string" },
		"expected-revision": { type: "string" },
		revision: { type: "string" },
		at: { type: "string" },
		"env-file": { type: "string" },
		apply: { type: "boolean", default: false },
		help: { type: "boolean", short: "h", default: false },
	},
});

if (values.help) {
	console.log(HELP);
	process.exit(0);
}

if (values["env-file"]) loadEnvFile(values["env-file"]);

function required(value: string | undefined, option: string): string {
	if (!value?.trim()) throw new Error(`Missing required --${option}`);
	return value.trim();
}

function date(value: string | undefined, fallback: Date, option: string): Date {
	if (!value) return fallback;
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) throw new Error(`--${option} must be an ISO date`);
	return parsed;
}

function integer(value: string | undefined, option: string, minimum: number): number {
	const parsed = Number(value);
	if (!value || !Number.isSafeInteger(parsed) || parsed < minimum) {
		throw new Error(`--${option} must be an integer greater than or equal to ${minimum}`);
	}
	return parsed;
}

function mutationArgs(): { organizationId: string; actorUserId: string; reason: string } {
	return {
		organizationId: required(values["organization-id"], "organization-id"),
		actorUserId: required(values["actor-user-id"], "actor-user-id"),
		reason: required(values.reason, "reason"),
	};
}

function contractSummary(revision: {
	revision: number;
	payload: {
		entitlements: {
			brandSlots: number;
			promptSlots: number;
			trackingTargets: { maximumSelected: number; targets: unknown[] };
			claudeTracking: { enabled: boolean; includedPromptSlots: number };
		};
	};
	effectiveFrom: Date;
	effectiveUntil: Date | null;
	revokedAt: Date | null;
}) {
	const contract = revision.payload.entitlements;
	return {
		revision: revision.revision,
		effectiveFrom: revision.effectiveFrom.toISOString(),
		effectiveUntil: revision.effectiveUntil?.toISOString() ?? null,
		revokedAt: revision.revokedAt?.toISOString() ?? null,
		brandSlots: contract.brandSlots,
		promptSlots: contract.promptSlots,
		maximumSelectedTargets: contract.trackingTargets.maximumSelected,
		availableTargets: contract.trackingTargets.targets.length,
		claudeEnabled: contract.claudeTracking.enabled,
		includedClaudePromptSlots: contract.claudeTracking.includedPromptSlots,
	};
}

async function readPayload(path: string): Promise<unknown> {
	let contents: string;
	if (path === "-") {
		process.stdin.setEncoding("utf8");
		contents = "";
		for await (const chunk of process.stdin) contents += chunk;
	} else {
		contents = await readFile(path, "utf8");
	}
	try {
		return JSON.parse(contents);
	} catch {
		throw new Error(`--input ${path === "-" ? "stdin" : "file"} does not contain valid JSON`);
	}
}

async function main(): Promise<void> {
	const action = positionals[0];
	if (!action || positionals.length !== 1 || !["set", "replace", "revoke", "current", "list"].includes(action)) {
		throw new Error(`Expected exactly one action: set, replace, revoke, current, or list\n\n${HELP}`);
	}

	const operator = await import("../src/cloud/custom-entitlements");
	if (action === "set") {
		const common = mutationArgs();
		const payload = await readPayload(required(values.input, "input"));
		const effectiveFrom = date(values["effective-from"], new Date(), "effective-from");
		const effectiveUntil = values["effective-until"]
			? date(values["effective-until"], new Date(), "effective-until")
			: null;
		if (!values.apply) {
			const preview = await operator.previewEntitlementOverrideAppend({
				...common,
				payload,
				effectiveFrom,
				effectiveUntil,
			});
			console.log(
				JSON.stringify(
					{
						action: "set",
						mode: "dry-run",
						organizationId: common.organizationId,
						expectedRevisionForApply: preview.latestRevision,
						contract: contractSummary(preview.draft),
					},
					null,
					2,
				),
			);
			return;
		}
		const inserted = await operator.appendEntitlementOverride({
			...common,
			payload,
			effectiveFrom,
			effectiveUntil,
			expectedLatestRevision: integer(values["expected-revision"], "expected-revision", 0),
		});
		console.log(
			JSON.stringify(
				{
					action: "set",
					mode: "applied",
					organizationId: common.organizationId,
					actorUserId: common.actorUserId,
					reason: common.reason,
					contract: contractSummary(inserted),
				},
				null,
				2,
			),
		);
		return;
	}

	if (action === "replace") {
		const common = mutationArgs();
		const payload = await readPayload(required(values.input, "input"));
		const predecessorRevision = integer(values.revision, "revision", 1);
		const now = new Date();
		const transitionAt = date(values["effective-from"], now, "effective-from");
		const effectiveUntil = values["effective-until"] ? date(values["effective-until"], now, "effective-until") : null;
		if (!values.apply) {
			const preview = await operator.previewEntitlementOverrideReplacement({
				...common,
				predecessorRevision,
				payload,
				now,
				transitionAt,
				effectiveUntil,
			});
			console.log(
				JSON.stringify(
					{
						action: "replace",
						mode: "dry-run",
						organizationId: common.organizationId,
						endedRevision: preview.target.revision,
						transitionAt: preview.transitionAt.toISOString(),
						expectedRevisionForApply: preview.latestRevision,
						successor: contractSummary(preview.successor),
					},
					null,
					2,
				),
			);
			return;
		}
		const applied = await operator.replaceEntitlementOverride({
			...common,
			predecessorRevision,
			payload,
			now,
			transitionAt,
			effectiveUntil,
			expectedLatestRevision: integer(values["expected-revision"], "expected-revision", 0),
		});
		console.log(
			JSON.stringify(
				{
					action: "replace",
					mode: "applied",
					organizationId: common.organizationId,
					actorUserId: common.actorUserId,
					reason: common.reason,
					endedRevision: applied.endedRevision,
					transitionAt: applied.transitionAt.toISOString(),
					successor: contractSummary(applied.successor),
				},
				null,
				2,
			),
		);
		return;
	}

	if (action === "revoke") {
		const common = mutationArgs();
		const revision = integer(values.revision, "revision", 1);
		const now = new Date();
		if (!values.apply) {
			const preview = await operator.previewEntitlementOverrideRevocation({ ...common, revision, now });
			console.log(
				JSON.stringify(
					{
						action: preview.action,
						mode: "dry-run",
						organizationId: common.organizationId,
						revokedRevision: preview.target.revision,
						restoredPredecessorRevision: preview.restorePredecessor?.revision ?? null,
						auditRevision: preview.audit.revision,
						expectedRevisionForApply: preview.latestRevision,
					},
					null,
					2,
				),
			);
			return;
		}
		const applied = await operator.revokeEntitlementOverride({
			...common,
			revision,
			now,
			expectedLatestRevision: integer(values["expected-revision"], "expected-revision", 0),
		});
		console.log(
			JSON.stringify(
				{
					action: applied.action,
					mode: "applied",
					organizationId: common.organizationId,
					actorUserId: common.actorUserId,
					reason: common.reason,
					revokedRevision: applied.revokedRevision,
					restoredPredecessorRevision: applied.restoredPredecessorRevision,
					auditRevision: applied.auditRevision.revision,
				},
				null,
				2,
			),
		);
		return;
	}

	const organizationId = required(values["organization-id"], "organization-id");
	if (action === "current") {
		const at = date(values.at, new Date(), "at");
		const current = await operator.readCurrentEntitlementOverride(organizationId, at);
		console.log(
			JSON.stringify(
				{
					action: "current",
					organizationId,
					at: at.toISOString(),
					contract: current ? contractSummary(current) : null,
				},
				null,
				2,
			),
		);
		return;
	}

	const revisions = await operator.listEntitlementOverrides(organizationId);
	console.log(
		JSON.stringify(
			{
				action: "list",
				organizationId,
				revisions: revisions.map((revision) => ({
					...contractSummary(revision),
					createdAt: revision.createdAt.toISOString(),
					createdByUserId: revision.createdByUserId,
					reason: revision.reason,
				})),
			},
			null,
			2,
		),
	);
}

main().catch((error: unknown) => {
	const message = error instanceof Error ? error.message : "Unknown operator error";
	const code =
		typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
			? error.code
			: "operator-error";
	console.error(JSON.stringify({ status: "failed", code, message }, null, 2));
	process.exitCode = 1;
});
