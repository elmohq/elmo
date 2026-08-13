#!/usr/bin/env node

/**
 * Build the Discord webhook payload announcing a release.
 *
 * The release workflow used to post the bare release link, so the #releases
 * channel showed a URL and nothing about what actually shipped. This renders
 * the generated release notes into the message body and moves the link to the
 * bottom.
 *
 * Usage:
 *   node scripts/discord-release-payload.mjs <version> [notes-file]
 *   node scripts/discord-release-payload.mjs 0.2.1 release-notes.md > payload.json
 *
 * Reads the repository slug from $REPO (GitHub Actions sets this from
 * `github.repository`), defaulting to elmohq/elmo. Prints the payload as JSON
 * on stdout; missing or empty notes degrade to the link-only announcement
 * rather than failing the release.
 */

import { readFileSync } from "node:fs";

/** Discord rejects a message whose `content` exceeds this many characters. */
const CONTENT_LIMIT = 2000;

/**
 * SUPPRESS_EMBEDS. Without it the trailing release link unfurls into a media
 * embed underneath the notes, which is the duplication the notes replace.
 */
const SUPPRESS_EMBEDS = 1 << 2;

const version = process.argv[2];
const notesFile = process.argv[3];

if (!version) {
	console.error("usage: discord-release-payload.mjs <version> [notes-file]");
	process.exit(1);
}

const repo = process.env.REPO || "elmohq/elmo";
const releaseUrl = `https://github.com/${repo}/releases/tag/v${version}`;
const header = `🚀 **Elmo v${version}** is out!`;

/**
 * Truncate to at most `max` characters, counting the way Discord does, without
 * splitting a surrogate pair — release notes carry emoji, and half of one is
 * invalid UTF-8 in the payload.
 */
function truncate(text, max) {
	if (text.length <= max) return text;
	let out = "";
	for (const char of text) {
		if (out.length + char.length > max - 1) break;
		out += char;
	}
	return `${out}…`;
}

function readNotes(file) {
	if (!file) return "";
	try {
		return readFileSync(file, "utf8").trim();
	} catch {
		// A release that published but somehow lost its notes file should still
		// be announced.
		console.error(`discord-release-payload: cannot read ${file}; announcing the link only.`);
		return "";
	}
}

const notes = readNotes(notesFile);

// `header\n\n{notes}\n\n{link}` — the four newlines come out of the budget too.
const budget = CONTENT_LIMIT - header.length - releaseUrl.length - 4;
const body = budget > 0 ? truncate(notes, budget) : "";

const content = body
	? `${header}\n\n${body}\n\n${releaseUrl}`
	: `${header}\n${releaseUrl}`;

process.stdout.write(
	`${JSON.stringify({
		content,
		flags: SUPPRESS_EMBEDS,
		// A commit message containing @everyone must not ping the server.
		allowed_mentions: { parse: [] },
	})}\n`,
);
