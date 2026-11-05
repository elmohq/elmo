#!/usr/bin/env node
/**
 * Fails the build when a sitemap URL has no genuine `<lastmod>`. Boots the
 * built server and reads `/sitemap.xml`, because the dates come from content,
 * data records, and the OpenAPI spec that only meet at request time.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";

const SERVER = fileURLToPath(new URL("../.output/server/index.mjs", import.meta.url));

// Dated from GitHub releases when served, which a build can't reach.
const EXEMPT = new Set(["/changelog"]);

function freePort() {
	return new Promise((resolve, reject) => {
		const probe = createServer().listen(0, () => {
			const { port } = probe.address();
			probe.close(() => resolve(port));
		});
		probe.on("error", reject);
	});
}

async function fetchSitemap(port, deadline) {
	while (Date.now() < deadline) {
		try {
			const response = await fetch(`http://127.0.0.1:${port}/sitemap.xml`);
			if (response.ok) return await response.text();
		} catch {
			// Not listening yet.
		}
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	throw new Error("The built server didn't serve /sitemap.xml within 30 seconds.");
}

if (!existsSync(SERVER)) {
	if (process.env.VERCEL) {
		console.log("check-sitemap: skipped on Vercel, whose preset doesn't emit .output/server; CI runs it.");
		process.exit(0);
	}
	console.error(`check-sitemap: no built server at ${SERVER}. Run the build first.`);
	process.exit(1);
}

const port = await freePort();
const server = spawn(process.execPath, [SERVER], { env: { ...process.env, PORT: String(port) }, stdio: "ignore" });

try {
	const xml = await fetchSitemap(port, Date.now() + 30_000);
	const entries = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(([, block]) => ({
		path: new URL(block.match(/<loc>(.*?)<\/loc>/)?.[1] ?? "").pathname,
		lastmod: block.match(/<lastmod>(.*?)<\/lastmod>/)?.[1],
	}));
	const undated = entries.filter(
		(entry) => !EXEMPT.has(entry.path) && !/^\d{4}-\d{2}-\d{2}$/.test(entry.lastmod ?? ""),
	);
	if (entries.length === 0) throw new Error("The sitemap has no URLs.");
	if (undated.length > 0) {
		console.error(`check-sitemap: ${undated.length} of ${entries.length} sitemap URLs have no YYYY-MM-DD <lastmod>:`);
		for (const entry of undated) console.error(`  ${entry.path}${entry.lastmod ? ` (${entry.lastmod})` : ""}`);
		process.exitCode = 1;
	} else {
		console.log(`check-sitemap: all ${entries.length - EXEMPT.size} dated sitemap URLs have a <lastmod>.`);
	}
} catch (error) {
	console.error(`check-sitemap: ${error.message}`);
	process.exitCode = 1;
} finally {
	server.kill();
}
