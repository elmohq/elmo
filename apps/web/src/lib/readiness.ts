// Uptime monitors give up after a few seconds; answer before they do so a
// slow database reads as "unavailable" rather than as an unreachable app.
const DEFAULT_TIMEOUT_MS = 5_000;

export async function readinessResponse(pingDatabase: () => Promise<unknown>, timeoutMs = DEFAULT_TIMEOUT_MS) {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new Error(`database ping timed out after ${timeoutMs}ms`)), timeoutMs);
	});

	try {
		await Promise.race([pingDatabase(), timeout]);
		return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
	} catch (error) {
		console.error("[health] database check failed:", error);
		return Response.json({ status: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
	} finally {
		clearTimeout(timer);
	}
}
