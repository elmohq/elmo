// Uptime monitors give up after a few seconds; answer before they do so a
// slow database reads as "unavailable" rather than as an unreachable app.
const DEFAULT_TIMEOUT_MS = 5_000;

// Caching a healthy answer briefly keeps a flood of requests to this public
// route from reaching the database; s-maxage is what Vercel's CDN honors.
// Failures stay uncached so an outage shows up immediately.
const HEALTHY_CACHE_CONTROL = "public, max-age=10, s-maxage=10";

export async function readinessResponse(pingDatabase: () => Promise<unknown>, timeoutMs = DEFAULT_TIMEOUT_MS) {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new Error(`database ping timed out after ${timeoutMs}ms`)), timeoutMs);
	});

	try {
		await Promise.race([pingDatabase(), timeout]);
		return Response.json({ status: "ok" }, { headers: { "Cache-Control": HEALTHY_CACHE_CONTROL } });
	} catch (error) {
		console.error("[health] database check failed:", error);
		return Response.json({ status: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
	} finally {
		clearTimeout(timer);
	}
}
