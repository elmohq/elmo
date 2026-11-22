import { describe, expect, it } from "vitest";
import { isLoopbackRedirectUri } from "./redirect-uri";

describe("isLoopbackRedirectUri", () => {
	it.each([
		"http://localhost:3118/callback",
		"http://localhost/callback",
		"http://LOCALHOST:8080/cb",
		"https://localhost/cb",
		"http://app.localhost:3000/cb",
		"http://127.0.0.1:1455/cb",
		"http://127.1.2.3/cb",
		"http://[::1]:8080/cb",
		"http://[::1]/cb",
	])("accepts loopback URI %s", (uri) => {
		expect(isLoopbackRedirectUri(uri)).toBe(true);
	});

	it.each([
		"https://www.example.com/cb",
		"http://localhost.example.com/cb",
		"http://127.0.0.1.nip.io/cb",
		"http://localhost@evil.com/cb",
		"http://example.com/cb?redirect=http://localhost",
		"http://10.0.0.5/cb",
		"http://192.168.1.10/cb",
		"http://0.0.0.0/cb",
	])("rejects non-loopback URI %s", (uri) => {
		expect(isLoopbackRedirectUri(uri)).toBe(false);
	});

	it.each(["", "not a url", "/callback", "com.example.app:/callback"])(
		"rejects unusable URI %s without throwing",
		(uri) => {
			expect(() => isLoopbackRedirectUri(uri)).not.toThrow();
			expect(isLoopbackRedirectUri(uri)).toBe(false);
		},
	);
});
