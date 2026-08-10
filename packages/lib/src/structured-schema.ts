import { createHash } from "node:crypto";
import { z } from "zod";

/** Stable identity for the output contract attached to a paid structured call. */
export function structuredSchemaFingerprint(schema: z.ZodType): string {
	return createHash("sha256")
		.update(JSON.stringify(z.toJSONSchema(schema)))
		.digest("hex");
}
