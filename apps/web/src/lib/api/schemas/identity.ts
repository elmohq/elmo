import * as z from "zod";

export const apiKeyIdentitySchema = z.object({
	keyType: z.enum(["admin", "organization"]),
	organizationId: z.string().nullable(),
	organizationName: z.string().nullable(),
	scopes: z.array(z.enum(["read", "write"])),
	brandIds: z.array(z.string()).nullable(),
	createdAt: z.iso.datetime({ offset: true }).nullable(),
	expiresAt: z.iso.datetime({ offset: true }).nullable(),
	rateLimit: z
		.object({
			limit: z.int(),
			window: z.enum(["minute", "hour"]),
		})
		.nullable(),
	createdBy: z.string().nullable(),
	lastUsedAt: z.iso.datetime({ offset: true }).nullable(),
});
