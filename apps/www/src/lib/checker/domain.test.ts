import { describe, expect, it } from "vitest";
import { isPrivateAddress, parseDomainInput } from "./domain";
import { assertPublicUrl } from "./safe-fetch";

describe("parseDomainInput", () => {
	it.each([
		["acme.com", "acme.com", "acme.com"],
		["  https://www.Acme.com/pricing?x=1  ", "acme.com", "www.acme.com"],
		["http://shop.acme.co.uk", "shop.acme.co.uk", "shop.acme.co.uk"],
		["acme.com.", "acme.com", "acme.com"],
		["münchen.de", "xn--mnchen-3ya.de", "xn--mnchen-3ya.de"],
	])("accepts %j as %s", (input, domain, host) => {
		expect(parseDomainInput(input)).toEqual({ ok: true, domain, host });
	});

	it.each([
		"",
		"acme",
		"localhost",
		"intranet.local",
		"printer.lan",
		"app.internal",
		"127.0.0.1",
		"http://10.0.0.5/admin",
		"[::1]",
		"0x7f.1",
		"2130706433",
		"ftp://acme.com",
		"javascript:alert(1)",
		"-acme.com",
		"acme..com",
		"acme.123",
	])("rejects %j", (input) => {
		expect(parseDomainInput(input).ok).toBe(false);
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
		"224.0.0.1",
		"::1",
		"::",
		"fd00::1",
		"fe80::1",
		"::ffff:127.0.0.1",
		"::ffff:7f00:1",
		"64:ff9b::a00:1",
		"not-an-ip",
	])("treats %s as private", (address) => {
		expect(isPrivateAddress(address)).toBe(true);
	});

	it.each(["93.184.216.34", "172.32.0.1", "8.8.8.8", "2606:4700:4700::1111", "::ffff:8.8.8.8"])(
		"treats %s as public",
		(address) => {
			expect(isPrivateAddress(address)).toBe(false);
		},
	);
});

describe("assertPublicUrl", () => {
	const resolvesTo = (addresses: string[]) => async () => addresses;

	it("allows a public site", async () => {
		await expect(assertPublicUrl(new URL("https://acme.com/"), resolvesTo(["93.184.216.34"]))).resolves.toBeUndefined();
	});

	it("blocks a public-looking domain that resolves to a private address", async () => {
		await expect(assertPublicUrl(new URL("https://acme.com/"), resolvesTo(["169.254.169.254"]))).rejects.toThrow();
	});

	it("blocks when any resolved address is private", async () => {
		await expect(assertPublicUrl(new URL("https://acme.com/"), resolvesTo(["8.8.8.8", "10.0.0.1"]))).rejects.toThrow();
	});

	it("blocks non-standard ports, credentials, and other schemes", async () => {
		const resolve = resolvesTo(["93.184.216.34"]);
		await expect(assertPublicUrl(new URL("https://acme.com:8080/"), resolve)).rejects.toThrow();
		await expect(assertPublicUrl(new URL("https://user:pw@acme.com/"), resolve)).rejects.toThrow();
		await expect(assertPublicUrl(new URL("file:///etc/passwd"), resolve)).rejects.toThrow();
	});

	it("blocks hosts that don't resolve", async () => {
		const fails = async () => {
			throw new Error("ENOTFOUND");
		};
		await expect(assertPublicUrl(new URL("https://acme.com/"), fails)).rejects.toThrow();
	});
});
