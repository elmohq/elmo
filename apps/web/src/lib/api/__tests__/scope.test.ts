import { describe, expect, it } from "vitest";
import type { ApiAuthContext } from "@/lib/auth/api-auth";
import { ApiError } from "../handler";
import { allowedBrandIds, assertBrandAccess, canAccessBrand } from "../scope";

const ADMIN_AUTH: ApiAuthContext = { type: "admin", userId: "admin-user-id", keyId: "admin-key-id" };

function userAuth(brandIds: string[]): ApiAuthContext {
	return { type: "user", userId: "user-id", keyId: "user-key-id", brandIds };
}

describe("canAccessBrand", () => {
	it("always allows admin auth, regardless of brand id", () => {
		expect(canAccessBrand(ADMIN_AUTH, "brand-1")).toBe(true);
		expect(canAccessBrand(ADMIN_AUTH, "some-other-brand")).toBe(true);
	});

	it("allows a user auth when the brand is in brandIds", () => {
		const auth = userAuth(["brand-1", "brand-2"]);
		expect(canAccessBrand(auth, "brand-1")).toBe(true);
		expect(canAccessBrand(auth, "brand-2")).toBe(true);
	});

	it("denies a user auth when the brand is not in brandIds", () => {
		const auth = userAuth(["brand-1", "brand-2"]);
		expect(canAccessBrand(auth, "brand-3")).toBe(false);
	});

	it("denies a user auth with empty brandIds", () => {
		const auth = userAuth([]);
		expect(canAccessBrand(auth, "brand-1")).toBe(false);
	});
});

describe("assertBrandAccess", () => {
	it("does not throw for admin auth", () => {
		expect(() => assertBrandAccess(ADMIN_AUTH, "brand-1")).not.toThrow();
	});

	it("does not throw for a user auth in scope", () => {
		const auth = userAuth(["brand-1"]);
		expect(() => assertBrandAccess(auth, "brand-1")).not.toThrow();
	});

	it("throws an ApiError shaped like a 404 when out of scope", () => {
		const auth = userAuth(["brand-1"]);
		try {
			assertBrandAccess(auth, "brand-2");
			expect.unreachable("assertBrandAccess should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(ApiError);
			const apiError = err as ApiError;
			expect(apiError.status).toBe(404);
			expect(apiError.error).toBe("Not Found");
			expect(apiError.message).toBe("Brand not found");
		}
	});

	it("throws the same 404 shape when brandIds is empty", () => {
		const auth = userAuth([]);
		try {
			assertBrandAccess(auth, "brand-1");
			expect.unreachable("assertBrandAccess should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(ApiError);
			const apiError = err as ApiError;
			expect(apiError.status).toBe(404);
			expect(apiError.error).toBe("Not Found");
			expect(apiError.message).toBe("Brand not found");
		}
	});

	it("uses a custom resourceName in the message when provided", () => {
		const auth = userAuth(["brand-1"]);
		try {
			assertBrandAccess(auth, "brand-2", "Prompt");
			expect.unreachable("assertBrandAccess should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(ApiError);
			const apiError = err as ApiError;
			expect(apiError.status).toBe(404);
			expect(apiError.error).toBe("Not Found");
			expect(apiError.message).toBe("Prompt not found");
		}
	});
});

describe("allowedBrandIds", () => {
	it("returns null (unrestricted) for admin auth", () => {
		expect(allowedBrandIds(ADMIN_AUTH)).toBeNull();
	});

	it("returns the brandIds array for a user auth", () => {
		const auth = userAuth(["brand-1", "brand-2"]);
		expect(allowedBrandIds(auth)).toEqual(["brand-1", "brand-2"]);
	});

	it("returns an empty array (not null) for a user auth with no brands", () => {
		const auth = userAuth([]);
		expect(allowedBrandIds(auth)).toEqual([]);
	});
});
