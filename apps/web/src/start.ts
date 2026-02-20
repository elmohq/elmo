/**
 * TanStack Start global configuration.
 *
 * Registers global middleware that runs on every request/server function.
 */
import { createStart } from "@tanstack/react-start";
import { deploymentMiddleware, readOnlyMiddleware } from "@/middleware/deployment";
import { authMiddleware } from "@/middleware/auth";

export const startInstance = createStart(() => ({
	// Runs on every server request (SSR, server routes, server functions)
	requestMiddleware: [deploymentMiddleware],
	// Runs on every server function invocation
	functionMiddleware: [authMiddleware, readOnlyMiddleware],
}));
