#!/usr/bin/env node

/**
 * Build the Discord webhook payload announcing a release.
 *
 * Discord's markdown covers most of what the release notes carry, so the
 * message reads close to the GitHub release. The two differences it has to
 * paper over are the 2000-character `content` limit and bare URLs, which
 * GitHub shortens and Discord does not.
 *
 * Usage:
 *   REPO=elmohq/elmo node scripts/discord-release-payload.mjs 0.2.1 release-notes.md
 *
 * Missing or empty notes degrade to a link-only announcement rather than
 * failing the release.
 */

import { readFileSync } from "node:fs";

/** Discord rejects a message whose `content` exceeds this many characters. */
const CONTENT_LIMIT = 2000;

/**
 * SUPPRESS_EMBEDS. Without it every link in the notes unfurls into a media
 * embed underneath the message.
 */
const SUPPRESS_EMBEDS = 1 << 2;

/** The announcement header already says this. */
const NOTES_HEADING = /^##\s+What's Changed$/;

/** The generator's trailing compare link, which the footer takes over. */
const FULL_CHANGELOG = /^\*\*Full Changelog\*\*:\s*(\S+)$/;

const version = process.argv[2];
const notesFile = process.argv[3];
const repo = process.env.REPO;

if (!version || !repo) {
  console.error(
    "usage: REPO=owner/name discord-release-payload.mjs <version> [notes-file]",
  );
  process.exit(1);
}

const releaseUrl = `https://github.com/${repo}/releases/tag/v${version}`;
const header = `🚀 **Elmo v${version}** is out!`;

/**
 * Cut to `max` characters without splitting a surrogate pair — release notes
 * carry emoji, and half of one is invalid UTF-8 in the payload. Counts UTF-16
 * units where Discord counts code points, which can only under-fill the budget.
 */
function truncate(text, max) {
  if (text.length <= max) return text;
  const cut = max - 1;
  const splitsPair = /[\uD800-\uDBFF]/.test(text[cut - 1]);
  return `${text.slice(0, splitsPair ? cut - 1 : cut)}…`;
}

/**
 * GitHub renders a bare pull request URL as `#123` and Discord does not, which
 * leaves every bullet trailing 40 characters of noise. Webhook messages honour
 * `[text](url)`, so shorten them the same way — but only for this repository,
 * since `#123` in an Elmo announcement reads as an Elmo pull request.
 */
function maskPullLinks(line) {
  return line.replace(
    /https:\/\/github\.com\/([^/\s]+\/[^/\s]+)\/pull\/(\d+)/g,
    (url, slug, number) => (slug === repo ? `[#${number}](${url})` : url),
  );
}

function parseNotes(text) {
  const bullets = [];
  let compareUrl = null;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || NOTES_HEADING.test(line)) continue;
    const changelog = line.match(FULL_CHANGELOG);
    // Notes are contributor-written, so the footer only lends its label to a
    // link back into this repository; anything else stays visible in the body.
    if (changelog?.[1].startsWith(`https://github.com/${repo}/`)) {
      compareUrl = changelog[1];
      continue;
    }
    bullets.push(maskPullLinks(line));
  }
  return { bullets, compareUrl };
}

/**
 * Drop whole trailing bullets rather than cutting mid-word, so an oversized
 * release still ends on a complete entry and says how many it left out.
 */
function fitBullets(bullets, max) {
  const all = bullets.join("\n");
  if (all.length <= max) return all;
  for (let kept = bullets.length - 1; kept > 0; kept--) {
    const candidate = [
      ...bullets.slice(0, kept),
      `* …and ${bullets.length - kept} more`,
    ].join("\n");
    if (candidate.length <= max) return candidate;
  }
  return truncate(all, max);
}

function readNotes(file) {
  if (!file) return "";
  try {
    return readFileSync(file, "utf8").trim();
  } catch {
    // A release that published but somehow lost its notes file should still
    // be announced.
    console.error(
      `discord-release-payload: cannot read ${file}; announcing the link only.`,
    );
    return "";
  }
}

const { bullets, compareUrl } = parseNotes(readNotes(notesFile));

// Held out of the truncated body so it survives an oversized release, which is
// exactly when the full list is worth linking to.
const footer = compareUrl
  ? `[Release v${version}](${releaseUrl}) · [Full changelog](${compareUrl})`
  : `[Release v${version}](${releaseUrl})`;

// `header\n\n{body}\n\n{footer}` — the four newlines come out of the budget too.
const budget = CONTENT_LIMIT - header.length - footer.length - 4;
const body = budget > 0 ? fitBullets(bullets, budget) : "";

const content = body
  ? `${header}\n\n${body}\n\n${footer}`
  : `${header}\n${footer}`;

process.stdout.write(
  `${JSON.stringify({
    content,
    flags: SUPPRESS_EMBEDS,
    // A commit message containing @everyone must not ping the server.
    allowed_mentions: { parse: [] },
  })}\n`,
);
