#!/usr/bin/env tsx
/**
 * Generates a bloom filter from a CSV of pay-to-win link marketplace domains.
 * The binary output is served as a static asset so the client can efficiently
 * test domains without shipping the ~1 MB domain list.
 *
 * Usage:
 *   tsx apps/web/scripts/generate-marketplace-bloom.ts [path-to-csv]
 *
 * Default CSV path: ~/code/backlinkeval/sites.csv
 * Output: apps/web/public/data/marketplace-bloom.bin
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { resolve, dirname } from "node:path";

// ---------------------------------------------------------------------------
// FNV-1a 32-bit (unsigned)
// ---------------------------------------------------------------------------
function fnv1a(str: string): number {
	let hash = 0x811c9dc5;
	for (let i = 0; i < str.length; i++) {
		hash ^= str.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return hash >>> 0;
}

// Second hash: FNV-1a with a different offset basis
function fnv1aB(str: string): number {
	let hash = 0x84222325;
	for (let i = 0; i < str.length; i++) {
		hash ^= str.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return hash >>> 0;
}

// ---------------------------------------------------------------------------
// Bloom filter builder
// ---------------------------------------------------------------------------
function buildBloom(
	items: string[],
	falsePositiveRate: number,
): { bits: Uint8Array; numHashes: number; bitArraySize: number } {
	const n = items.length;
	// Optimal bit array size: m = -n * ln(p) / (ln 2)^2
	const bitArraySize = Math.ceil((-n * Math.log(falsePositiveRate)) / (Math.LN2 * Math.LN2));
	// Optimal hash count: k = (m/n) * ln 2
	const numHashes = Math.max(1, Math.round((bitArraySize / n) * Math.LN2));

	const byteSize = Math.ceil(bitArraySize / 8);
	const bits = new Uint8Array(byteSize);

	function setBit(idx: number) {
		const byteIdx = Math.floor(idx / 8);
		const bitIdx = idx % 8;
		bits[byteIdx]! |= 1 << bitIdx;
	}

	for (const item of items) {
		const d = item.toLowerCase();
		const h1 = fnv1a(d);
		const h2 = fnv1aB(d);
		for (let i = 0; i < numHashes; i++) {
			const idx = (h1 + i * h2) >>> 0; // force unsigned
			setBit(idx % bitArraySize);
		}
	}

	return { bits, numHashes, bitArraySize };
}

// ---------------------------------------------------------------------------
// Binary serialization format:
//   [4 bytes] bitArraySize (Uint32, little-endian)
//   [1 byte]  numHashes
//   [N bytes] bit array (Uint8Array)
// ---------------------------------------------------------------------------
function serialize(
	bits: Uint8Array,
	numHashes: number,
	bitArraySize: number,
): Buffer {
	const header = Buffer.alloc(5);
	header.writeUInt32LE(bitArraySize, 0);
	header[4] = numHashes;
	return Buffer.concat([header, Buffer.from(bits)]);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const csvPath = process.argv[2] || resolve(homedir(), "code/backlinkeval/sites.csv");
const outPath = resolve(
	dirname(new URL(import.meta.url).pathname),
	"..",
	"public",
	"data",
	"marketplace-bloom.bin",
);

// Read and parse the CSV (single column, no header skip needed — "domain" is the first line)
const csv = readFileSync(csvPath, "utf-8");
const lines = csv.split("\n").map((l) => l.trim()).filter(Boolean);
// Skip the "domain" header line
const domains = lines[0]?.toLowerCase() === "domain" ? lines.slice(1) : lines;

console.log(`Read ${domains.length.toLocaleString()} domains from ${csvPath}`);

const { bits, numHashes, bitArraySize } = buildBloom(domains, 0.01);

const serialized = serialize(bits, numHashes, bitArraySize);

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, serialized);

const kb = (serialized.length / 1024).toFixed(1);
const bitsKb = (bitArraySize / 8 / 1024).toFixed(1);
console.log(`Bloom filter written to ${outPath}`);
console.log(`  Bit array: ${(bitArraySize / 8 / 1024).toFixed(1)} KB (${bitArraySize.toLocaleString()} bits)`);
console.log(`  File size: ${kb} KB`);
console.log(`  Hashes per lookup: ${numHashes}`);
console.log(`  Target FPR: 1%`);
console.log(`  Domains encoded: ${domains.length.toLocaleString()}`);