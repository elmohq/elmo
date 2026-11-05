#!/usr/bin/env node

/**
 * Fetches the Ahrefs Domain Rating (DR) for one or more domains.
 *
 * Usage: AHREFS_API_KEY=... node scripts/fetch-domain-rating.mjs <domain> [domain...]
 *
 * Output: one JSON object per line, with an ahrefsDR field. Values under 10 keep
 * one decimal place, since new domains cluster there and 0 vs 3.2 is a real
 * difference for the low-DR threshold.
 */

const targets = process.argv.slice(2);

if (targets.length === 0) {
	console.error("Usage: AHREFS_API_KEY=... node scripts/fetch-domain-rating.mjs <domain> [domain...]");
	process.exit(1);
}

const apiKey = process.env.AHREFS_API_KEY;

if (!apiKey) {
	console.error("Missing AHREFS_API_KEY env var");
	process.exit(1);
}

for (const target of targets) {
	const dr = await fetchDomainRating(target);
	console.log(JSON.stringify({ domain: target, ahrefsDR: dr }));
}

async function fetchDomainRating(target) {
	const url = `https://api.ahrefs.com/v3/public/domain-rating-free?target=${encodeURIComponent(target)}`;

	const res = await fetch(url, {
		headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}` },
	});

	if (!res.ok) {
		const body = await res.text();
		console.error(`API error ${res.status} for ${target}: ${body}`);
		process.exit(1);
	}

	const data = await res.json();
	const dr = data?.domain_rating?.domain_rating;

	if (typeof dr !== "number") {
		console.error(`Unexpected response for ${target}: ${JSON.stringify(data)}`);
		process.exit(1);
	}

	return dr < 10 ? Math.round(dr * 10) / 10 : Math.round(dr);
}
