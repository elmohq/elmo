import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(
  new URL("discord-release-payload.mjs", import.meta.url),
);
const REPO = "elmohq/elmo";
const workDir = mkdtempSync(join(tmpdir(), "discord-release-payload-"));

/** Run the script the way the release workflow does, and parse what it posts. */
function announce(version, { notes, notesFile } = {}) {
  let file = notesFile;
  if (notes !== undefined) {
    file = join(workDir, `${version}.md`);
    writeFileSync(file, notes);
  }
  return JSON.parse(
    execFileSync(process.execPath, [SCRIPT, version, ...(file ? [file] : [])], {
      encoding: "utf8",
      env: { ...process.env, REPO },
      stdio: ["ignore", "pipe", "ignore"],
    }),
  );
}

function releaseNotes(bullets, compareUrl) {
  return ["## What's Changed", "", ...bullets, "", compareUrl].join("\n");
}

test("announces what shipped, linking the release and the changelog", () => {
  const payload = announce("1.2.3", {
    notes: releaseNotes(
      [`* Add a thing by @someone in https://github.com/${REPO}/pull/12`],
      `**Full Changelog**: https://github.com/${REPO}/compare/v1.2.2...v1.2.3`,
    ),
  });

  assert.match(payload.content, /Add a thing by @someone/);
  assert.ok(
    payload.content.includes(`[#12](https://github.com/${REPO}/pull/12)`),
    "links the pull request without spelling out its URL",
  );
  assert.ok(
    payload.content.includes(
      `[Release v1.2.3](https://github.com/${REPO}/releases/tag/v1.2.3)`,
    ),
  );
  assert.ok(
    payload.content.includes(
      `[Full changelog](https://github.com/${REPO}/compare/v1.2.2...v1.2.3)`,
    ),
  );
  // Otherwise each of those links unfurls into its own embed.
  assert.equal(payload.flags, 4);
});

test("keeps both links and stays under the limit when the notes overflow", () => {
  const bullets = Array.from(
    { length: 60 },
    (_, i) =>
      `* Change ${i}, described at enough length to blow the budget, by @someone in https://github.com/${REPO}/pull/${i}`,
  );

  const payload = announce("2.0.0", {
    notes: releaseNotes(
      bullets,
      `**Full Changelog**: https://github.com/${REPO}/compare/v1.9.9...v2.0.0`,
    ),
  });

  assert.ok(
    payload.content.length <= 2000,
    `Discord rejects the message at ${payload.content.length} characters`,
  );
  assert.ok(payload.content.includes("[Release v2.0.0]"));
  assert.ok(payload.content.includes("[Full changelog]"));
  assert.match(payload.content, /^\* …and \d+ more$/m);
  assert.equal(
    (payload.content.match(/…/g) ?? []).length,
    1,
    "the marker holds the only ellipsis, so no entry was cut mid-word",
  );
});

test("still announces the release when the notes are unreadable", () => {
  const payload = announce("3.0.0", {
    notesFile: join(workDir, "never-written.md"),
  });

  assert.ok(
    payload.content.includes(
      `[Release v3.0.0](https://github.com/${REPO}/releases/tag/v3.0.0)`,
    ),
  );
});

test("does not let the notes ping the channel or borrow the changelog label", () => {
  const payload = announce("4.0.0", {
    notes: releaseNotes(
      [
        `* @everyone @here read https://github.com/other-org/other/pull/7 by @someone in https://github.com/${REPO}/pull/8`,
      ],
      "**Full Changelog**: https://evil.example/phish",
    ),
  });

  assert.deepEqual(payload.allowed_mentions, { parse: [] });
  assert.ok(
    !payload.content.includes("[Full changelog]"),
    "the changelog label only ever points into this repository",
  );
  assert.ok(
    payload.content.includes("https://github.com/other-org/other/pull/7"),
    "a link to another repository keeps its URL visible",
  );
  assert.ok(!payload.content.includes("[#7]"));
});
