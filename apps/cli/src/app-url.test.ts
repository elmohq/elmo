import { describe, expect, it } from "vitest";
import { parseAppUrl, setEnvValues } from "./app-url.js";

describe("parseAppUrl", () => {
	it("accepts a full URL and drops the trailing slash", () => {
		expect(parseAppUrl("https://elmo.example.com/")).toEqual({ url: "https://elmo.example.com" });
	});

	it("keeps an explicit port", () => {
		expect(parseAppUrl("http://10.0.0.5:1515")).toEqual({ url: "http://10.0.0.5:1515" });
	});

	it("assumes https when the scheme is left off", () => {
		expect(parseAppUrl(" elmo.example.com ")).toEqual({ url: "https://elmo.example.com" });
	});

	it("rejects a path, since the app cannot be served from one", () => {
		expect(parseAppUrl("https://example.com/elmo")).toHaveProperty("error");
	});

	it("rejects non-web schemes and garbage", () => {
		expect(parseAppUrl("ftp://example.com")).toHaveProperty("error");
		expect(parseAppUrl("http://")).toHaveProperty("error");
	});
});

describe("setEnvValues", () => {
	const rendered = [
		"# Rendered by elmo 0.4.2 on 2026-01-01T00:00:00.000Z",
		"# WARNING: contains secrets. Do not commit.",
		"",
		"DATABASE_URL=postgres://x",
		"APP_URL=http://localhost:1515",
		"# my note",
		"VITE_APP_URL=http://localhost:1515",
		"",
	].join("\n");

	it("replaces existing values and leaves everything else alone", () => {
		const next = setEnvValues(rendered, {
			APP_URL: "https://elmo.example.com",
			VITE_APP_URL: "https://elmo.example.com",
		});
		expect(next).toBe(
			rendered
				.replace("APP_URL=http://localhost:1515", "APP_URL=https://elmo.example.com")
				.replace("VITE_APP_URL=http://localhost:1515", "VITE_APP_URL=https://elmo.example.com"),
		);
	});

	it("does not touch keys that merely end with the same name", () => {
		const next = setEnvValues("VITE_APP_URL=old\n", { APP_URL: "new" });
		expect(next).toBe("VITE_APP_URL=old\nAPP_URL=new\n");
	});

	it("appends keys that are missing", () => {
		expect(setEnvValues("FOO=1", { APP_URL: "https://a.example" })).toBe("FOO=1\nAPP_URL=https://a.example\n");
		expect(setEnvValues("", { APP_URL: "https://a.example" })).toBe("APP_URL=https://a.example\n");
	});
});
