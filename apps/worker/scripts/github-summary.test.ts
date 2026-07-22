import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { escapeGitHubSummaryTableCell } from "./github-summary";

describe("escapeGitHubSummaryTableCell", () => {
	it("keeps a multiline Oxylabs error within its table cell", () => {
		assert.equal(
			escapeGitHubSummaryTableCell('Oxylabs realtime query failed (408): {"message":"Timed out."}\n'),
			'Oxylabs realtime query failed (408): {"message":"Timed out."}',
		);
	});

	it("escapes Markdown table delimiters and HTML in provider output", () => {
		assert.equal(escapeGitHubSummaryTableCell("One | two\n<script>&"), "One &#124; two<br>&lt;script&gt;&amp;");
	});
});
