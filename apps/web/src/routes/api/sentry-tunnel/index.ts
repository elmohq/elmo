import { createFileRoute } from "@tanstack/react-router";

function getProjectId(pathname: string): string {
	return pathname.replace(/^\/+|\/+$/g, "");
}

function getAllowedTargets(): Set<string> {
	const configuredDsns = [process.env.VITE_SENTRY_DSN, process.env.SENTRY_DSN].filter(Boolean);
	const targets = new Set<string>();

	for (const value of configuredDsns) {
		if (!value) continue;
		try {
			const dsn = new URL(value);
			const projectId = getProjectId(dsn.pathname);
			if (!projectId) continue;
			targets.add(`${dsn.hostname}/${projectId}`);
		} catch {
			// Ignore invalid DSN config entries.
		}
	}

	return targets;
}

export const Route = createFileRoute("/api/sentry-tunnel/")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const allowedTargets = getAllowedTargets();
				if (allowedTargets.size === 0) {
					return new Response("Sentry tunnel is not configured", { status: 503 });
				}

				const envelopeBytes = await request.arrayBuffer();
				const envelope = new TextDecoder().decode(envelopeBytes);
				const firstLine = envelope.split("\n")[0];

				let dsn: URL;
				try {
					const header = JSON.parse(firstLine);
					dsn = new URL(header.dsn);
				} catch {
					return new Response("Invalid envelope header", { status: 400 });
				}

				const projectId = getProjectId(dsn.pathname);
				if (!projectId || !allowedTargets.has(`${dsn.hostname}/${projectId}`)) {
					return new Response("Invalid Sentry project", { status: 403 });
				}

				const upstreamUrl = `https://${dsn.hostname}/api/${projectId}/envelope/`;

				const upstreamResponse = await fetch(upstreamUrl, {
					method: "POST",
					headers: { "Content-Type": "application/x-sentry-envelope" },
					body: envelopeBytes,
				});

				return new Response(upstreamResponse.body, {
					status: upstreamResponse.status,
				});
			},
		},
	},
});
