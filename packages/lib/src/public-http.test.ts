import type { AgentOptions } from "node:https";
import nodeFetch, { Response } from "node-fetch";
import { describe, expect, it, vi } from "vitest";
import { fetchPublicHttp } from "./public-http";

const privateLookup = ((_: string, options: { all?: boolean }, callback: (...args: unknown[]) => void) => {
	if (options.all) {
		callback(null, [{ address: "10.0.0.8", family: 4 }]);
	} else {
		callback(null, "10.0.0.8", 4);
	}
}) as AgentOptions["lookup"];

describe("public HTTP boundary", () => {
	it.each(["http://127.0.0.1/", "http://169.254.169.254/latest/meta-data/", "http://[::1]/"])(
		"blocks private or metadata IP literal %s",
		async (url) => {
			await expect(fetchPublicHttp(url)).rejects.toThrow(/not allowed|private IP address/i);
		},
	);

	it("blocks a hostname whose socket lookup resolves privately", async () => {
		await expect(fetchPublicHttp("http://brand.example/", {}, { lookup: privateLookup })).rejects.toThrow(
			/not allowed|private IP address/i,
		);
	});

	it("revalidates and blocks every redirect destination", async () => {
		const fetchImplementation = vi.fn(async (input: URL | RequestInfo, init?: unknown) => {
			if (String(input) === "https://public.example/") {
				return new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest" } });
			}
			return nodeFetch(input as URL, init as Parameters<typeof nodeFetch>[1]);
		}) as typeof nodeFetch;

		await expect(fetchPublicHttp("https://public.example/", {}, { fetch: fetchImplementation })).rejects.toThrow(
			/not allowed|private IP address/i,
		);
		expect(fetchImplementation).toHaveBeenCalledTimes(2);
	});

	it.each(["file:///etc/passwd", "https://user:secret@example.com/"])("rejects unsafe URL form %s", async (url) => {
		await expect(fetchPublicHttp(url)).rejects.toThrow(/rejects/);
	});
});
