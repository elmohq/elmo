import { describe, expect, it } from "vitest";
import { isPrivateAddress, normalizeSiteUrl, ToolError } from "./site-url";

describe("normalizeSiteUrl", () => {
	it("accepts a bare domain and assumes https", () => {
		expect(normalizeSiteUrl("example.com").toString()).toBe("https://example.com/");
	});

	it("keeps the path so a specific page can be checked", () => {
		expect(normalizeSiteUrl("example.com/blog/post").pathname).toBe("/blog/post");
	});

	it("keeps an explicit http scheme", () => {
		expect(normalizeSiteUrl("http://example.com").protocol).toBe("http:");
	});

	it("trims surrounding whitespace and drops the fragment", () => {
		expect(normalizeSiteUrl("  https://example.com/docs#intro  ").toString()).toBe("https://example.com/docs");
	});

	it.each(["", "   ", "not a domain", "javascript:alert(1)", "file:///etc/passwd", "ftp://example.com"])(
		"rejects %j",
		(input) => {
			expect(() => normalizeSiteUrl(input)).toThrow(ToolError);
		},
	);

	it("rejects URLs carrying credentials", () => {
		expect(() => normalizeSiteUrl("https://user:pass@example.com")).toThrow(ToolError);
	});

	it("rejects IP literals so the tools stay domain-only", () => {
		expect(() => normalizeSiteUrl("127.0.0.1")).toThrow(ToolError);
		expect(() => normalizeSiteUrl("https://169.254.169.254/latest/meta-data")).toThrow(ToolError);
		expect(() => normalizeSiteUrl("http://[::1]/")).toThrow(ToolError);
	});

	it("rejects hostnames that cannot be public", () => {
		expect(() => normalizeSiteUrl("localhost")).toThrow(ToolError);
		expect(() => normalizeSiteUrl("http://localhost:3000")).toThrow(ToolError);
		expect(() => normalizeSiteUrl("printer.local")).toThrow(ToolError);
		expect(() => normalizeSiteUrl("db.internal")).toThrow(ToolError);
		expect(() => normalizeSiteUrl("intranet")).toThrow(ToolError);
	});
});

describe("isPrivateAddress", () => {
	it.each([
		"127.0.0.1",
		"10.1.2.3",
		"172.16.0.1",
		"172.31.255.255",
		"192.168.1.1",
		"169.254.169.254",
		"100.64.0.1",
		"0.0.0.0",
		"::1",
		"::",
		"fd00::1",
		"fe80::1",
		"::ffff:127.0.0.1",
	])("treats %s as private", (address) => {
		expect(isPrivateAddress(address)).toBe(true);
	});

	it.each(["8.8.8.8", "1.1.1.1", "172.32.0.1", "192.169.0.1", "2606:4700:4700::1111"])(
		"treats %s as public",
		(address) => {
			expect(isPrivateAddress(address)).toBe(false);
		},
	);

	it("treats anything unparseable as private", () => {
		expect(isPrivateAddress("")).toBe(true);
		expect(isPrivateAddress("999.1.1.1")).toBe(true);
	});
});
