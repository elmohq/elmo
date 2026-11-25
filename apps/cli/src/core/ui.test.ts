import { afterEach, describe, expect, it, vi } from "vitest";
import { log, routeLibraryLogsToStderr } from "./ui";

describe("lab command logging", () => {
	const ESC = "\u001b";
	const brand = `Acme${ESC}]52;c;ZXZpbA==\u0007`;
	const isTTY = process.stderr.isTTY;
	const original = { ...console };

	afterEach(() => {
		process.stderr.isTTY = isTTY;
		Object.assign(console, original);
		vi.restoreAllMocks();
	});

	function stderrFor(terminal: boolean, emit: () => void): string {
		process.stderr.isTTY = terminal;
		const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
		const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
		emit();
		expect(stdout).not.toHaveBeenCalled();
		return write.mock.calls.map((call) => String(call[0])).join("");
	}

	it("strips control sequences from library logs shown in a terminal", () => {
		const shown = stderrFor(true, () => {
			routeLibraryLogsToStderr();
			console.log(`brand="${brand}"`);
			console.warn(brand);
			console.error(brand);
		});
		expect(shown).not.toContain(ESC);
		expect(shown).not.toContain("\u0007");
		expect(shown).toContain('brand="Acme]52;c;ZXZpbA=="');
	});

	it("strips control sequences from status messages shown in a terminal", () => {
		const shown = stderrFor(true, () => log.warn(`Skipping ${brand}`));
		expect(shown).toContain("Skipping Acme]52;c;ZXZpbA==");
		expect(shown).not.toContain("\u0007");
		expect(shown).not.toContain(`${ESC}]52`);
	});

	it("leaves redirected stderr byte for byte", () => {
		const shown = stderrFor(false, () => {
			routeLibraryLogsToStderr();
			console.log(brand);
		});
		expect(shown).toBe(`${brand}\n`);
	});
});
