import { describe, expect, it } from "vitest";
import { compressResponse } from "../compress-response";

const BODY = JSON.stringify({ rows: Array.from({ length: 500 }, (_, i) => ({ id: i, name: "visibility" })) });
const request = (acceptEncoding?: string) =>
	new Request("http://localhost/", { headers: acceptEncoding ? { "accept-encoding": acceptEncoding } : {} });
const json = (body = BODY, headers: Record<string, string> = {}) =>
	new Response(body, { headers: { "content-type": "application/json", ...headers } });

async function gunzip(response: Response): Promise<string> {
	return new Response(response.body?.pipeThrough(new DecompressionStream("gzip"))).text();
}

describe("compressResponse", () => {
	it("gzips a response for a client that accepts gzip, without changing what it says", async () => {
		const compressed = compressResponse(request("gzip, deflate, br"), json());

		expect(compressed.headers.get("content-encoding")).toBe("gzip");
		expect(compressed.headers.get("vary")).toContain("Accept-Encoding");
		expect(compressed.headers.has("content-length")).toBe(false);
		const bytes = await compressed.clone().arrayBuffer();
		expect(bytes.byteLength).toBeLessThan(BODY.length / 2);
		expect(await gunzip(compressed)).toBe(BODY);
	});

	it("keeps the status of the response it compresses", () => {
		const compressed = compressResponse(
			request("gzip"),
			new Response(BODY, { status: 404, headers: { "content-type": "text/html" } }),
		);

		expect(compressed.status).toBe(404);
		expect(compressed.headers.get("content-encoding")).toBe("gzip");
	});

	it.each([
		["the client does not accept gzip", request(), json()],
		["the client only accepts other encodings", request("br"), json()],
		["the body is already encoded", request("gzip"), json(BODY, { "content-encoding": "br" })],
		[
			"the body is already compressed media",
			request("gzip"),
			new Response(BODY, { headers: { "content-type": "image/png" } }),
		],
		[
			"the body is an event stream",
			request("gzip"),
			new Response(BODY, { headers: { "content-type": "text/event-stream" } }),
		],
		["the body is too small to be worth it", request("gzip"), json("{}", { "content-length": "2" })],
		["there is no body", request("gzip"), new Response(null, { status: 204 })],
	])("leaves the response alone when %s", (_case, req, response) => {
		expect(compressResponse(req, response)).toBe(response);
	});
});
