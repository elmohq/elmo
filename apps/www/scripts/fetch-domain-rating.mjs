#!/usr/bin/env node

/**
 * Fetches the Ahrefs Domain Rating (DR) for a domain via Ahrefs' free public API.
 *
 * Usage: node scripts/fetch-domain-rating.mjs <domain>
 *
 * Output: JSON with an ahrefsDR field (rounded to an integer).
 *
 * No API key required — the free endpoint is unauthenticated.
 */

const target = process.argv[2];

if (!target) {
	console.error("Usage: node scripts/fetch-domain-rating.mjs <domain>");
	process.exit(1);
}

const url = `https://api.ahrefs.com/v3/public/domain-rating-free?target=${encodeURIComponent(target)}`;

const res = await fetch(url, {
	headers: { Accept: "application/json" },
});

if (!res.ok) {
	const body = await res.text();
	console.error(`API error ${res.status}: ${body}`);
	process.exit(1);
}

const data = await res.json();
const dr = data?.domain_rating?.domain_rating;

if (typeof dr !== "number") {
	console.error(`Unexpected response: ${JSON.stringify(data)}`);
	process.exit(1);
}

console.log(JSON.stringify({ domain: target, ahrefsDR: Math.round(dr) }));
