import type { DbConnection } from "@workspace/lib/db/db-connection";
import { prompts } from "@workspace/lib/db/schema";
import { eq } from "drizzle-orm";
import { settleParents } from "@/lib/prompt-variants";

/**
 * Run inside the transaction of anything that changes a prompt's parent, turns
 * a prompt off or on, or removes one, so groups stay one level deep and a
 * tracked prompt stands for each. `removing` is a prompt about to be deleted.
 */
export async function settleVariantParents(conn: DbConnection, brandId: string, removing?: string): Promise<void> {
	const rows = await conn
		.select({ id: prompts.id, parentId: prompts.parentId, enabled: prompts.enabled, createdAt: prompts.createdAt })
		.from(prompts)
		.where(eq(prompts.brandId, brandId));
	for (const [id, parentId] of settleParents(rows, removing)) {
		await conn.update(prompts).set({ parentId }).where(eq(prompts.id, id));
	}
}
