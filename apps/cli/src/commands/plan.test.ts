import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readEvalContext, readFilesWithin } from "./plan";

describe("reading context for a plan", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	async function checkoutWithPrivateDir() {
		const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "elmo-plan-")));
		const checkout = path.join(root, "checkout");
		const privateDir = path.join(root, "private");
		await fs.mkdir(checkout);
		await fs.mkdir(privateDir);
		await fs.writeFile(path.join(privateDir, "credentials.json"), '{"token":"do-not-send"}');
		vi.spyOn(process, "cwd").mockReturnValue(checkout);
		return { checkout, privateDir };
	}

	it("won't read a selected directory that's a symlink out of the checkout", async () => {
		const { checkout, privateDir } = await checkoutWithPrivateDir();
		await fs.symlink(privateDir, path.join(checkout, "content"));

		expect((await readFilesWithin(["content"], 100_000)).join("\n")).not.toContain("do-not-send");
	});

	it("won't read through a symlinked directory above the selected one", async () => {
		const { checkout, privateDir } = await checkoutWithPrivateDir();
		await fs.symlink(privateDir, path.join(checkout, "docs"));

		expect((await readFilesWithin(["docs/credentials.json"], 100_000)).join("\n")).not.toContain("do-not-send");
	});

	it("won't read a selected file that's swapped for a symlink after it was checked", async () => {
		const { checkout, privateDir } = await checkoutWithPrivateDir();
		const selected = path.join(checkout, "page.md");
		await fs.writeFile(selected, "# Our pricing");
		const lstat = fs.lstat;
		let swapped = false;
		vi.spyOn(fs, "lstat").mockImplementation(async (target) => {
			const result = await lstat(target);
			if (target === selected && !swapped) {
				swapped = true;
				await fs.rm(selected);
				await fs.symlink(path.join(privateDir, "credentials.json"), selected);
			}
			return result;
		});

		expect((await readFilesWithin(["page.md"], 100_000)).join("\n")).not.toContain("do-not-send");
	});

	it("reads a real directory inside the checkout", async () => {
		const { checkout } = await checkoutWithPrivateDir();
		await fs.mkdir(path.join(checkout, "content"));
		await fs.writeFile(path.join(checkout, "content", "page.md"), "# Our pricing");

		expect(await readFilesWithin(["content"], 100_000)).toEqual(["<<< FILE: content/page.md >>>\n# Our pricing"]);
	});

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
