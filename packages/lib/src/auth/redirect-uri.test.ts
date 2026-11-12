import { describe, expect, it } from "vitest";
import { isLoopbackRedirectUri } from "./redirect-uri";

describe("isLoopbackRedirectUri", () => {
	it("accepts loopback URIs", () => {
		expect(isLoopbackRedirectUri("http://localhost:3118/callback")).toBe(true);
		expect(isLoopbackRedirectUri("http://localhost/callback")).toBe(true);
		expect(isLoopbackRedirectUri("http://LOCALHOST:8080/cb")).toBe(true);
		expect(isLoopbackRedirectUri("https://localhost/cb")).toBe(true);
		expect(isLoopbackRedirectUri("http://app.localhost:3000/cb")).toBe(true);
		expect(isLoopbackRedirectUri("http://127.0.0.1:1455/cb")).toBe(true);
		expect(isLoopbackRedirectUri("http://127.1.2.3/cb")).toBe(true);
		expect(isLoopbackRedirectUri("http://[::1]:8080/cb")).toBe(true);
		expect(isLoopbackRedirectUri("http://[::1]/cb")).toBe(true);
	});

	it("rejects non-loopback URIs", () => {
		expect(isLoopbackRedirectUri("https://www.example.com/cb")).toBe(false);
		expect(isLoopbackRedirectUri("http://localhost.example.com/cb")).toBe(false);
		expect(isLoopbackRedirectUri("http://127.0.0.1.nip.io/cb")).toBe(false);
		expect(isLoopbackRedirectUri("http://localhost@evil.com/cb")).toBe(false);
		expect(isLoopbackRedirectUri("http://example.com/cb?redirect=http://localhost")).toBe(false);
		expect(isLoopbackRedirectUri("http://10.0.0.5/cb")).toBe(false);
		expect(isLoopbackRedirectUri("http://192.168.1.10/cb")).toBe(false);
		expect(isLoopbackRedirectUri("http://0.0.0.0/cb")).toBe(false);
	});

	it("returns false for anything that is not a usable URL", () => {
		expect(isLoopbackRedirectUri("")).toBe(false);
		expect(isLoopbackRedirectUri("not a url")).toBe(false);
		expect(isLoopbackRedirectUri("/callback")).toBe(false);
		expect(isLoopbackRedirectUri("com.example.app:/callback")).toBe(false);
	});
});
