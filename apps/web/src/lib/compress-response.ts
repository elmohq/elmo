const COMPRESSIBLE =
	/^(text\/(html|css|plain|javascript|xml|csv)|application\/(json|javascript|xml|x-ndjson)|image\/svg\+xml)\b/;
/** Below this the gzip framing and the CPU cost outweigh what is saved. */
const MIN_BYTES = 1024;

/**
 * Gzips a response for clients that accept it. Self-hosted deployments serve
 * straight from the Node server with nothing in front of it to do this.
 */
export function compressResponse(request: Request, response: Response): Response {
	if (!response.body || response.headers.has("content-encoding")) return response;
	if (!/\bgzip\b/.test(request.headers.get("accept-encoding") ?? "")) return response;
	if (!COMPRESSIBLE.test(response.headers.get("content-type") ?? "")) return response;
	const length = response.headers.get("content-length");
	if (length !== null && Number(length) < MIN_BYTES) return response;

	const headers = new Headers(response.headers);
	headers.set("content-encoding", "gzip");
	headers.append("vary", "Accept-Encoding");
	headers.delete("content-length");
	return new Response(response.body.pipeThrough(new CompressionStream("gzip")), {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}
