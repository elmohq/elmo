import { describe, expect, it } from "vitest";
import { parseAppUrl } from "./app-url.js";

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
