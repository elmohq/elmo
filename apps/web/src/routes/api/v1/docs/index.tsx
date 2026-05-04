import { createFileRoute } from "@tanstack/react-router";

// Unreachable: deploymentMiddleware (see lib/auth/policies.ts) intercepts
// GET /api/v1/docs and 302-redirects to the public reference before route
// matching runs. The file remains so the generated route tree resolves.
export const Route = createFileRoute("/api/v1/docs/")({
	component: () => null,
});
