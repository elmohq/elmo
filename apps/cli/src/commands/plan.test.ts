import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readFilesWithin } from "./plan";

describe("readFilesWithin", () => {
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
});
