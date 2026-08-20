#!/usr/bin/env node

/**
 * Build the Discord webhook payload announcing a release.
 *
 * Renders the generated release notes into the message body, with the release
 * and compare links as a footer. Discord's markdown covers most of what the
 * notes carry, so the message reads close to the GitHub release; the two
 * differences it has to paper over are the 2000-character `content` limit and
 * bare URLs, which GitHub shortens and Discord does not.
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
 * SUPPRESS_EMBEDS. Without it every link in the notes unfurls into a media
 * embed underneath the message.
 */
const SUPPRESS_EMBEDS = 1 << 2;

/** The header below already says what this heading says. */
const NOTES_HEADING = /^##\s+What's Changed$/;

/** The generator's trailing compare link, which becomes part of the footer. */
const FULL_CHANGELOG = /^\*\*Full Changelog\*\*:\s*(\S+)$/;

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
 * Truncate to at most `max` characters without splitting a surrogate pair —
 * release notes carry emoji, and half of one is invalid UTF-8 in the payload.
 * Counts UTF-16 units where Discord counts code points, which can only
 * under-fill the budget.
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

/**
 * GitHub renders a bare pull request URL as `#123`. Discord prints the whole
 * thing, which leaves every bullet trailing 40 characters of noise, so mask
 * them the same way — webhook messages are one of the contexts where Discord
 * honours `[text](url)`.
 *
 * Scoped to this repository, because `#123` in an Elmo announcement reads as an
 * Elmo pull request. A link anywhere else keeps its URL on show rather than
 * being relabelled as one of ours.
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
    // Every bullet here is contributor-written, so the footer only lends its
    // label to a link back into this repository. Anything else stays in the
    // body with its URL visible.
    if (changelog?.[1].startsWith(`https://github.com/${repo}/`)) {
      compareUrl = changelog[1];
      continue;
    }
    bullets.push(maskPullLinks(line));
  }
  return { bullets, compareUrl };
}

/**
 * Fit the bullets into `max` characters by dropping whole trailing ones, so an
 * oversized release ends on a complete entry with a count of what it left out
 * rather than mid-word. Only a single bullet longer than the whole budget falls
 * back to cutting mid-text.
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
