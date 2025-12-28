// Convert PostgreSQL CSV dump to NDJSON.gz for Tinybird bulk import
// Run with: npx tsx scripts/convert-csv-for-tinybird.ts
//
// Then import with: tb --cloud datasource append prompt_runs prompt_runs.ndjson.gz

import { createReadStream, createWriteStream } from "node:fs";
import { createInterface } from "node:readline";
import { createGzip } from "node:zlib";
import { db } from "../src/lib/db/db";
import { prompts } from "../src/lib/db/schema";
import { extractTextContent, extractCitations } from "../src/lib/text-extraction";

const CSV_PATH = "./prompt_runs_rows.csv";
const OUTPUT_PATH = "./prompt_runs.ndjson.gz";

console.log("CSV to NDJSON.gz converter for Tinybird bulk import");
console.log(`Input: ${CSV_PATH}`);
console.log(`Output: ${OUTPUT_PATH}`);
console.log("");

// Parse CSV line (handles quoted fields with commas and embedded quotes)
function parseCSVLine(line: string): string[] {
	const result: string[] = [];
	let current = "";
	let inQuotes = false;

	for (let i = 0; i < line.length; i++) {
		const char = line[i];
		if (char === '"') {
			if (inQuotes && line[i + 1] === '"') {
				current += '"';
				i++;
			} else {
				inQuotes = !inQuotes;
			}
		} else if (char === "," && !inQuotes) {
			result.push(current);
			current = "";
		} else {
			current += char;
		}
	}
	result.push(current);
	return result;
}

// Parse PostgreSQL array format: {item1,item2,item3}
function parsePgArray(str: string): string[] {
	if (!str || str === "{}") return [];
	const inner = str.slice(1, -1);
	if (!inner) return [];

	if (!inner.includes('"')) {
		return inner.split(",").filter(Boolean);
	}

	const items: string[] = [];
	let current = "";
	let inQuotes = false;

	for (let i = 0; i < inner.length; i++) {
		const char = inner[i];
		if (char === '"') {
			inQuotes = !inQuotes;
		} else if (char === "," && !inQuotes) {
			items.push(current);
			current = "";
		} else {
			current += char;
		}
	}
	items.push(current);
	return items.filter(Boolean);
}

async function convert() {
	const startTime = Date.now();

	// Load prompt_id -> brand_id lookup
	console.log("Loading prompt_id -> brand_id lookup...");
	const promptsData = await db.select({ id: prompts.id, brandId: prompts.brandId }).from(prompts);
	const brandIdLookup = new Map(promptsData.map((p) => [p.id, p.brandId]));
	console.log(`Loaded ${brandIdLookup.size} prompts\n`);

	// Set up streaming output - write directly to gzip stream
	const gzip = createGzip({ level: 6 });
	const output = createWriteStream(OUTPUT_PATH);
	gzip.pipe(output);

	let headers: string[] = [];
	let lineNumber = 0;
	let processedCount = 0;
	let skippedCount = 0;
	let lastId = "";
	let isFirst = true;

	const fileStream = createReadStream(CSV_PATH);
	const rl = createInterface({ input: fileStream, crlfDelay: Infinity });

	console.log("Processing CSV (streaming to gzip)...");

	for await (const line of rl) {
		lineNumber++;

		if (lineNumber === 1) {
			headers = parseCSVLine(line);
			console.log(`Headers: ${headers.join(", ")}\n`);
			continue;
		}

		const row = parseCSVLine(line);
		const getValue = (name: string) => row[headers.indexOf(name)] || "";

		const id = getValue("id");
		const promptId = getValue("prompt_id");
		const brandId = brandIdLookup.get(promptId);

		if (!brandId) {
			skippedCount++;
			continue;
		}

		const modelGroup = getValue("modelGroup");
		const rawOutputStr = getValue("raw_output");

		let rawOutput: any;
		try {
			rawOutput = JSON.parse(rawOutputStr);
		} catch {
			skippedCount++;
			continue;
		}

		const extractedCitations = extractCitations(rawOutput, modelGroup);
		const citations = extractedCitations.map((c) => ({
			url: c.url,
			domain: c.domain,
			title: c.title || null,
		}));

		const competitorsArray = parsePgArray(getValue("competitors_mentioned"));
		const webQueriesArray = parsePgArray(getValue("web_queries"));

		// Parse and validate date
		const createdAtStr = getValue("created_at");
		const createdAt = new Date(createdAtStr);
		if (isNaN(createdAt.getTime())) {
			console.warn(`\nSkipping row ${id}: invalid date "${createdAtStr}"`);
			skippedCount++;
			continue;
		}

		const event = {
			id,
			prompt_id: promptId,
			brand_id: brandId,
			model_group: modelGroup,
			model: getValue("model"),
			web_search_enabled: getValue("web_search_enabled") === "t" ? 1 : 0,
			brand_mentioned: getValue("brand_mentioned") === "t" ? 1 : 0,
			competitors_mentioned: competitorsArray,
			web_queries: webQueriesArray,
			text_content: extractTextContent(rawOutput, modelGroup),
			raw_output: rawOutputStr,
			citations,
			created_at: createdAt.toISOString(),
			competitor_count: competitorsArray.length,
			has_competitor_mention: competitorsArray.length > 0 ? 1 : 0,
		};

		// Write directly to gzip stream (NDJSON = newline between records)
		const jsonLine = (isFirst ? "" : "\n") + JSON.stringify(event);
		isFirst = false;

		// Handle backpressure
		const canContinue = gzip.write(jsonLine);
		if (!canContinue) {
			await new Promise((resolve) => gzip.once("drain", resolve));
		}

		lastId = id;
		processedCount++;

		if (processedCount % 10000 === 0) {
			const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
			process.stdout.write(`\r${processedCount.toLocaleString()} rows (${elapsed}s)...`);
		}
	}

	// Close the gzip stream
	await new Promise<void>((resolve, reject) => {
		gzip.end(() => {
			output.on("finish", resolve);
			output.on("error", reject);
		});
	});

	const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

	console.log(`\n\n${"=".repeat(60)}`);
	console.log(`Conversion complete!`);
	console.log(`  Rows processed: ${processedCount.toLocaleString()}`);
	console.log(`  Rows skipped: ${skippedCount}`);
	console.log(`  Output file: ${OUTPUT_PATH}`);
	console.log(`  Last ID: ${lastId}`);
	console.log(`  Time: ${totalTime}s`);
	console.log(`${"=".repeat(60)}`);
	console.log(`\nTo import into Tinybird:`);
	console.log(`  tb --cloud datasource append prompt_runs ${OUTPUT_PATH}`);
	console.log(`\nThen run the continuation script:`);
	console.log(`  pnpm tsx --env-file=.env scripts/backfill-tinybird-continue.ts --after "${lastId}"`);
}

convert()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error("\nFailed:", e);
		process.exit(1);
	});
