// Headless screenshot of Storybook stories for visual review.
// Usage: node .storybook/shot.mjs <story-id> <out.png> [width] [height]
import { chromium } from "playwright";

const [, , id, out, w = "1440", h = "900"] = process.argv;
if (!id || !out) {
	console.error("usage: node shot.mjs <story-id> <out.png> [w] [h]");
	process.exit(1);
}

// Uses Playwright's managed Chromium by default (run `npx playwright install
// chromium` once). Set CHROME_PATH to point at an already-installed browser.
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) }, deviceScaleFactor: 2 });
const url = `http://localhost:6006/iframe.html?id=${id}&viewMode=story`;
await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
// Give recharts/responsive containers a beat to lay out.
await page.waitForTimeout(1200);
await page.screenshot({ path: out, fullPage: process.env.FULLPAGE !== "0" });
await browser.close();
console.log("wrote", out);
