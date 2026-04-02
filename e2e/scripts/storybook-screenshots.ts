import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

type Args = {
	baseUrl: string;
	outDir: string;
	storyIdBefore: string;
	storyIdAfter: string;
};

function parseArgs(): Args {
	const raw = process.argv.slice(2);
	const get = (name: string, fallback?: string) => {
		const idx = raw.indexOf(name);
		if (idx === -1) return fallback;
		return raw[idx + 1];
	};

	const baseUrl = get("--baseUrl", "http://127.0.0.1:6006")!;
	const outDir = get("--outDir", path.resolve(process.cwd(), "artifacts/screenshots"))!;
	const storyIdBefore = get("--before", "prompt-details-header-meta--before")!;
	const storyIdAfter = get("--after", "prompt-details-header-meta--after")!;

	return { baseUrl, outDir, storyIdBefore, storyIdAfter };
}

async function captureStory(page: any, baseUrl: string, storyId: string, outPath: string) {
	const url = `${baseUrl}/?path=/story/${storyId}`;
	await page.goto(url, { waitUntil: "networkidle" });

	// Storybook renders the story inside an iframe#storybook-preview-iframe
	const frame = page.frameLocator("#storybook-preview-iframe");
	const body = frame.locator("body");
	await body.waitFor({ state: "visible", timeout: 30_000 });

	await body.screenshot({ path: outPath, fullPage: true });
}

async function main() {
	const { baseUrl, outDir, storyIdBefore, storyIdAfter } = parseArgs();
	fs.mkdirSync(outDir, { recursive: true });

	const browser = await chromium.launch();
	const page = await browser.newPage({ viewport: { width: 1100, height: 400 } });

	const beforePath = path.join(outDir, "issue-101-before.png");
	const afterPath = path.join(outDir, "issue-101-after.png");

	await captureStory(page, baseUrl, storyIdBefore, beforePath);
	await captureStory(page, baseUrl, storyIdAfter, afterPath);

	await browser.close();

	// eslint-disable-next-line no-console
	console.log(`Saved:\n- ${beforePath}\n- ${afterPath}`);
}

main().catch((err) => {
	// eslint-disable-next-line no-console
	console.error(err);
	process.exit(1);
});

