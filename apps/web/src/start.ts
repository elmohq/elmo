/**
 * TanStack Start global configuration.
 *
 * Registers global middleware that runs on every request/server function.
 */
import { sentryGlobalFunctionMiddleware, sentryGlobalRequestMiddleware } from "@sentry/tanstackstart-react";
import { createStart } from "@tanstack/react-start";
import { deploymentMiddleware, readOnlyMiddleware } from "@/middleware/deployment";
import { authMiddleware } from "@/middleware/auth";

export const startInstance = createStart(() => ({
	requestMiddleware: [sentryGlobalRequestMiddleware, deploymentMiddleware],
	functionMiddleware: [sentryGlobalFunctionMiddleware, authMiddleware, readOnlyMiddleware],
}));
