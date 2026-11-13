import { describe, expect, it } from "vitest";
import { withoutNul } from "./handlers";

describe("withoutNul", () => {
	it("strips NUL from an error's message, stack, fields, and cause so pg-boss can store it", () => {
		const cause = new Error("cause \u0000");
		const error = Object.assign(new Error("Failed query\nparams: Title \u0000", { cause }), {
			params: ["run-1", "Title \u0000"],
		});

		const cleaned = withoutNul(error);

		expect(cleaned).toBe(error);
		expect(JSON.stringify({ ...cleaned, message: cleaned.message, stack: cleaned.stack })).not.toContain("\\u0000");
		expect(cleaned.message).toBe("Failed query\nparams: Title ");
		expect(cleaned.params).toEqual(["run-1", "Title "]);
		expect((cleaned.cause as Error).message).toBe("cause ");
	});

	it("handles circular references", () => {
		const error = new Error("loop \u0000") as Error & { self?: unknown };
		error.self = error;
		expect(withoutNul(error).message).toBe("loop ");
	});
});
