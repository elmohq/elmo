/**
 * The two generic config server functions (plan B3) — the ONLY read/write pair
 * for cascading `configs` rows. Adding a config key is a registry entry + a UI
 * field; no bespoke mutation exists to forget the policy gate on.
 *
 * - `getEffectiveConfigFn` resolves a scope ref to its effective values with
 *   per-key provenance, the rows set at that scope, and (brand/prompt scope)
 *   the effective/excluded target lists with exclusion reasons (B2).
 * - `setConfigValuesFn` validates every entry against the registry, gates each
 *   through the per-key policy (A3), applies the write-time entitlement clamps
 *   (§7/A4/A5), then writes all rows in ONE transaction (upsert on the identity
 *   tuple). An entry whose `value` is null/undefined DELETES its row — i.e.
 *   reverts that key to the inherited value; there is no stored "null".
 *
 * The implementations live in `./config-entries.server` so this module carries
 * no server-only imports outside the handler bodies (keeps them, and their
 * `getRequestHeaders` transitive import, out of the client bundle).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getEffectiveConfigImpl, setConfigValuesImpl } from "./config-entries.server";

const scopeSchema = z.enum(["instance", "organization", "brand", "prompt"]);

export const getEffectiveConfigFn = createServerFn({ method: "GET" })
	.validator(z.object({ scope: scopeSchema, id: z.string().optional() }))
	.handler(({ data }) => getEffectiveConfigImpl(data));

export const setConfigValuesFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			scope: scopeSchema,
			id: z.string().optional(),
			entries: z
				.array(
					z.object({
						key: z.string().min(1),
						selector: z.object({ model: z.string().nullish(), targetId: z.string().nullish() }).optional(),
						value: z.unknown().optional(),
					}),
				)
				.min(1),
		}),
	)
	.handler(({ data }) => setConfigValuesImpl(data));
