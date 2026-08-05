import { CLOUD_API_KEY_CONFIG_ID } from "@workspace/cloud/api-key";
import { z } from "zod";

const organizationIdSchema = z.string().trim().min(1);

export const listWorkspaceApiKeysInputSchema = z.object({ organizationId: organizationIdSchema }).strict();

export const createWorkspaceApiKeyInputSchema = z
	.object({
		organizationId: organizationIdSchema,
		name: z.string().trim().min(1).max(64),
	})
	.strict();

export const revokeWorkspaceApiKeyInputSchema = z
	.object({ organizationId: organizationIdSchema, keyId: z.string().trim().min(1) })
	.strict();

export function workspaceApiKeyCreateBody(input: z.infer<typeof createWorkspaceApiKeyInputSchema>) {
	return {
		configId: CLOUD_API_KEY_CONFIG_ID,
		organizationId: input.organizationId,
		name: input.name,
	};
}
