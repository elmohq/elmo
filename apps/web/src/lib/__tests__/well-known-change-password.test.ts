import { describe, expect, it } from "vitest";
import { CHANGE_PASSWORD_PATH, handleWellKnownChangePasswordGet } from "../well-known-change-password";

describe("GET /.well-known/change-password", () => {
	it("redirects to the in-app change-existing-password page", () => {
		const response = handleWellKnownChangePasswordGet({
			request: new Request("http://localhost/.well-known/change-password"),
		});

		expect([302, 303, 307]).toContain(response.status);

		const location = response.headers.get("Location");
		expect(location).toBeTruthy();
		const path = new URL(location ?? "", "http://localhost").pathname;
		expect(path).toBe(CHANGE_PASSWORD_PATH);
		expect(path).toBe("/change-password");
		expect(path).not.toBe("/auth/forgot-password");
		expect(path).not.toBe("/auth/reset-password");
		expect(path).not.toBe("/.well-known/change-password");
		expect(response.body).toBeNull();
	});
});
