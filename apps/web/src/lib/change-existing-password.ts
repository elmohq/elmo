import { authClient } from "@workspace/lib/auth/client";

/** Rotate an existing password via better-auth. Requires the current password. */
export async function changeExistingPassword(input: { currentPassword: string; newPassword: string }) {
	return authClient.changePassword({
		currentPassword: input.currentPassword,
		newPassword: input.newPassword,
	});
}
