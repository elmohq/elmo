import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readEvalContext, readFilesWithin } from "./plan";

describe("reading context for a plan", () => {
	it("reads files in the selected tree but not ones symlinked from outside it", async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), "elmo-plan-"));
		const content = path.join(root, "content");
		await fs.mkdir(path.join(content, "nested"), { recursive: true });
		await fs.writeFile(path.join(content, "page.md"), "# Our pricing");
		const secret = path.join(root, "secret.md");
		await fs.writeFile(secret, "API_KEY=do-not-send");
		await fs.symlink(secret, path.join(content, "linked.md"));
		await fs.symlink(root, path.join(content, "nested", "escape"));

		const parts = await readFilesWithin([content], 100_000);

		expect(parts.join("\n")).toContain("Our pricing");
		expect(parts.join("\n")).not.toContain("do-not-send");
	});

	it("won't follow an eval artifact that's a symlink to a private file", async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), "elmo-eval-"));
		const evalDir = path.join(root, "eval");
		await fs.mkdir(evalDir);
		const secret = path.join(root, "secret.txt");
		await fs.writeFile(secret, "API_KEY=do-not-send");
		await fs.symlink(secret, path.join(evalDir, "summary.md"));
		await fs.symlink(secret, path.join(evalDir, "run.json"));

		expect(await readEvalContext(evalDir)).toBe("");
	});

	it("reads a real eval summary", async () => {
		const evalDir = await fs.mkdtemp(path.join(os.tmpdir(), "elmo-eval-"));
		await fs.writeFile(path.join(evalDir, "summary.md"), "# Elmo eval");

		expect(await readEvalContext(evalDir)).toBe("# Elmo eval");
	});
});
