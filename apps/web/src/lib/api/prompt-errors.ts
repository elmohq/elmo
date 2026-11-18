import { ApiError } from "@/lib/api/handler";
import { PromptNotFoundError, PromptParentError } from "@/server/prompts-core";

/**
 * The writes re-check under their own lock, so a prompt that a concurrent
 * delete takes between the scope check and the write reads as 404 rather than
 * as a 500.
 */
export function promptWriteError(err: unknown): ApiError | undefined {
	if (err instanceof PromptNotFoundError) return new ApiError(404, "Not Found", err.message);
	if (err instanceof PromptParentError) {
		return new ApiError(400, "Validation Error", err.message, "validation_error");
	}
	return undefined;
}

export async function withPromptWriteErrors<T>(write: () => Promise<T>): Promise<T> {
	try {
		return await write();
	} catch (err) {
		throw promptWriteError(err) ?? err;
	}
}
