import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { appendFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const BLOG_DIRECTORY = "packages/docs/content/blog";
const MIN_WORDS = 1_000;
const MAX_WORDS = 3_000;
const MIN_REFRESH_WORDS = 350;
const MAX_REFRESH_WORDS = 4_500;
const MIN_CHANGED_WORDS = 40;
const MAX_TITLE_LENGTH = 80;
const MAX_META_TITLE_LENGTH = 60;
const MAX_DESCRIPTION_LENGTH = 170;

const SOCIAL_DOMAINS = new Set([
	"bsky.app",
	"facebook.com",
	"instagram.com",
	"linkedin.com",
	"news.ycombinator.com",
	"reddit.com",
	"tiktok.com",
	"twitter.com",
	"x.com",
]);

const TITLE_STOP_WORDS = new Set([
	"a",
	"an",
	"and",
	"are",
	"for",
	"from",
	"how",
	"in",
	"is",
	"of",
	"on",
	"the",
	"to",
	"what",
	"why",
	"with",
]);

function parseArguments(argv) {
	const options = {
		expectedDate: new Date().toISOString().slice(0, 10),
		requirePost: false,
		prBody: ".agents/blog-pr-body.md",
		summary: process.env.GITHUB_STEP_SUMMARY,
	};

	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		const value = argv[index + 1];
		if (argument === "--date" && value) {
			options.expectedDate = value;
			index += 1;
		} else if (argument === "--pr-body" && value) {
			options.prBody = value;
			index += 1;
		} else if (argument === "--summary" && value) {
			options.summary = value;
			index += 1;
		} else if (argument === "--require-post") {
			options.requirePost = true;
		} else {
			throw new Error(`Unknown or incomplete argument: ${argument}`);
		}
	}

	if (!/^\d{4}-\d{2}-\d{2}$/.test(options.expectedDate)) {
		throw new Error("--date must use YYYY-MM-DD");
	}
	return options;
}

function unquote(value) {
	const trimmed = value.trim();
	if (
		(trimmed.startsWith('"') && trimmed.endsWith('"')) ||
		(trimmed.startsWith("'") && trimmed.endsWith("'"))
	) {
		return trimmed.slice(1, -1);
	}
	return trimmed;
}

function scalar(frontmatter, key) {
	const match = frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
	return match ? unquote(match[1]) : "";
}

function arrayValues(frontmatter, key) {
	const block = frontmatter.match(new RegExp(`^${key}:\\s*\\n((?:[ \\t]+-\\s*[^\\n]+\\n?)+)`, "m"))?.[1] ?? "";
	return [...block.matchAll(/^[ \t]+-\s*(.+)$/gm)].map((match) => unquote(match[1]));
}

export function parseFrontmatter(content) {
	const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
	if (!match) throw new Error("The draft must start with a complete YAML frontmatter block");

	return {
		raw: match[1],
		body: match[2],
		title: scalar(match[1], "title"),
		description: scalar(match[1], "description"),
		date: scalar(match[1], "date"),
		updated: scalar(match[1], "updated"),
		author: scalar(match[1], "author"),
		metaTitle: scalar(match[1], "metaTitle"),
		tags: arrayValues(match[1], "tags"),
		faqCount: (match[1].match(/^[ \t]+-\s+question:\s*.+$/gm) ?? []).length,
	};
}

function markdownWordCount(body) {
	return body
		.replaceAll(/```[\s\S]*?```/g, " ")
		.replaceAll(/`[^`]+`/g, " ")
		.replaceAll(/<[^>]+>/g, " ")
		.replaceAll(/\[([^\]]+)\]\([^)]+\)/g, "$1")
		.replaceAll(/[#*_>|~-]/g, " ")
		.split(/\s+/)
		.filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}

function markdownLinks(body) {
	return [...body.matchAll(/\[[^\]]+\]\(([^)\s]+)\)/g)].map((match) => match[1]);
}

function changedWordCount(left, right) {
	const frequencies = new Map();
	for (const [content, direction] of [
		[left, 1],
		[right, -1],
	]) {
		for (const token of content.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
			frequencies.set(token, (frequencies.get(token) ?? 0) + direction);
		}
	}
	return [...frequencies.values()].reduce((total, difference) => total + Math.abs(difference), 0);
}

function domain(value) {
	try {
		return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
	} catch {
		return "";
	}
}

function isSocialDomain(value) {
	const host = domain(value);
	return [...SOCIAL_DOMAINS].some((socialDomain) => host === socialDomain || host.endsWith(`.${socialDomain}`));
}

function titleTokens(value) {
	return new Set(
		value
			.toLowerCase()
			.replaceAll(/[^a-z0-9]+/g, " ")
			.split(/\s+/)
			.filter((token) => token.length > 1 && !TITLE_STOP_WORDS.has(token)),
	);
}

export function titleSimilarity(left, right) {
	const leftTokens = titleTokens(left);
	const rightTokens = titleTokens(right);
	if (!leftTokens.size || !rightTokens.size) return 0;
	const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
	const union = new Set([...leftTokens, ...rightTokens]).size;
	return intersection / union;
}

function hasPlaceholder(content) {
	return /\b(?:TODO|TBD|FIXME|INSERT (?:SOURCE|LINK|STAT|QUOTE)|EXAMPLE\.COM)\b/i.test(content);
}

export function validateDraftContent({
	content,
	filename,
	expectedDate,
	existingTitles = [],
	existingSlugs = [],
	operation = "create",
	originalContent,
}) {
	const errors = [];
	const frontmatter = parseFrontmatter(content);
	const slug = basename(filename, ".mdx");
	const original = operation === "refresh" && originalContent ? parseFrontmatter(originalContent) : undefined;

	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*\.mdx$/.test(basename(filename))) {
		errors.push("The filename must be a lowercase kebab-case .mdx slug");
	}
	if (operation === "create" && existingSlugs.includes(slug)) errors.push(`The slug "${slug}" already exists`);
	if (!["create", "refresh"].includes(operation)) errors.push(`Unknown editorial operation: ${operation}`);
	if (operation === "refresh" && !original) errors.push("A refresh requires the original post from HEAD");

	if (!frontmatter.title) errors.push("Frontmatter requires title");
	if (frontmatter.title.length > MAX_TITLE_LENGTH) {
		errors.push(`The title must be at most ${MAX_TITLE_LENGTH} characters`);
	}
	if (!frontmatter.description) errors.push("Frontmatter requires description");
	if (frontmatter.description.length > MAX_DESCRIPTION_LENGTH) {
		errors.push(`The description must be at most ${MAX_DESCRIPTION_LENGTH} characters`);
	}
	if (operation === "create") {
		if (frontmatter.date !== expectedDate) {
			errors.push(`Frontmatter date must be ${expectedDate}`);
		}
		if (frontmatter.updated) errors.push("A new post may not set updated");
		if (frontmatter.author !== "ai") errors.push('Frontmatter author must be "ai"');
	} else if (original) {
		if (frontmatter.date !== original.date) errors.push("A refresh must preserve the original publication date");
		if (frontmatter.author !== original.author) errors.push("A refresh must preserve the original author");
		if (frontmatter.updated !== expectedDate) {
			errors.push(`Frontmatter updated must be ${expectedDate}`);
		}
		const previousContentDate = original.updated || original.date;
		if (frontmatter.updated && frontmatter.updated <= previousContentDate) {
			errors.push(`Frontmatter updated must be later than the previous content date (${previousContentDate})`);
		}
	}
	if (frontmatter.metaTitle && frontmatter.metaTitle.length > MAX_META_TITLE_LENGTH) {
		errors.push(`metaTitle must be at most ${MAX_META_TITLE_LENGTH} characters`);
	}
	if (frontmatter.tags.length < 2) errors.push("Frontmatter requires at least two tags");
	if (!frontmatter.tags.some((tag) => ["aeo", "geo", "ai-search"].includes(tag.toLowerCase()))) {
		errors.push('At least one tag must be "aeo", "geo", or "ai-search"');
	}
	if (frontmatter.faqCount < 3) errors.push("Frontmatter requires at least three FAQ entries");

	const wordCount = markdownWordCount(frontmatter.body);
	const minimumWords = operation === "refresh" ? MIN_REFRESH_WORDS : MIN_WORDS;
	const maximumWords = operation === "refresh" ? MAX_REFRESH_WORDS : MAX_WORDS;
	if (wordCount < minimumWords || wordCount > maximumWords) {
		errors.push(
			`The body must contain ${minimumWords.toLocaleString()}-${maximumWords.toLocaleString()} words (found ${wordCount})`,
		);
	}

	const h2Count = (frontmatter.body.match(/^##\s+\S.+$/gm) ?? []).length;
	if (h2Count < 3) errors.push("The body requires at least three H2 sections");
	if (!/^(\*\*)?Key takeaways\b/im.test(frontmatter.body)) {
		errors.push('The body requires a "Key takeaways" section');
	}

	const links = markdownLinks(frontmatter.body);
	const externalLinks = [...new Set(links.filter((link) => link.startsWith("https://")))];
	const evidenceLinks = externalLinks.filter((link) => {
		const host = domain(link);
		return host && host !== "elmohq.com" && !host.endsWith(".elmohq.com") && !isSocialDomain(link);
	});
	const evidenceDomains = [...new Set(evidenceLinks.map(domain))];
	if (evidenceDomains.length < 2) {
		errors.push("The body must link to at least two distinct non-social, non-Elmo evidence domains");
	}
	const originalEvidenceLinks = original
		? new Set(
				markdownLinks(original.body).filter((link) => {
					const host = domain(link);
					return (
						link.startsWith("https://") &&
						host &&
						host !== "elmohq.com" &&
						!host.endsWith(".elmohq.com") &&
						!isSocialDomain(link)
					);
				}),
			)
		: new Set();
	const newEvidenceLinks = evidenceLinks.filter((link) => !originalEvidenceLinks.has(link));
	if (operation === "refresh" && newEvidenceLinks.length === 0) {
		errors.push("A refresh must cite at least one new non-social, non-Elmo evidence URL");
	}

	const internalBlogLinks = [...new Set(links.filter((link) => /^\/blog\/[a-z0-9-]+(?:[#?].*)?$/.test(link)))];
	if (internalBlogLinks.length < 2) errors.push("The body must include at least two internal links to existing blog posts");
	for (const link of internalBlogLinks) {
		const linkedSlug = link.match(/^\/blog\/([a-z0-9-]+)/)?.[1];
		if (linkedSlug && !existingSlugs.includes(linkedSlug)) {
			errors.push(`Internal blog link does not resolve to an existing post: ${link}`);
		}
	}

	if (/^(?:import|export)\s/m.test(frontmatter.body) || /<script\b/i.test(frontmatter.body)) {
		errors.push("The generated MDX may not contain imports, exports, or scripts");
	}
	if (hasPlaceholder(content)) errors.push("The draft contains a placeholder");
	if (/^#\s+\S/m.test(frontmatter.body)) errors.push("The body may not repeat the title as an H1");
	const changedWords = original ? changedWordCount(original.body, frontmatter.body) : undefined;
	if (operation === "refresh" && (changedWords ?? 0) < MIN_CHANGED_WORDS) {
		errors.push(`A refresh must make at least ${MIN_CHANGED_WORDS} words of substantive body changes`);
	}

	const similarTitle = existingTitles
		.map((title) => ({ title, similarity: titleSimilarity(frontmatter.title, title) }))
		.sort((left, right) => right.similarity - left.similarity)[0];
	if (similarTitle?.similarity >= 0.65) {
		errors.push(
			`The title overlaps too heavily with "${similarTitle.title}" (${Math.round(similarTitle.similarity * 100)}% token similarity)`,
		);
	}

	if (errors.length) {
		throw new Error(`Draft validation failed:\n- ${errors.join("\n- ")}`);
	}

	return {
		...frontmatter,
		slug,
		wordCount,
		externalLinks,
		evidenceLinks,
		evidenceDomains,
		newEvidenceLinks,
		internalBlogLinks,
		operation,
		changedWords,
	};
}

function gitStatus() {
	const output = execFileSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], {
		encoding: "utf8",
	});
	return output
		.split("\n")
		.filter(Boolean)
		.map((line) => ({ status: line.slice(0, 2), path: line.slice(3) }));
}

async function existingBlogMetadata(excludedPath) {
	const files = (await readdir(BLOG_DIRECTORY)).filter((file) => file.endsWith(".mdx"));
	const titles = [];
	const slugs = [];

	for (const file of files) {
		const path = `${BLOG_DIRECTORY}/${file}`;
		if (path === excludedPath) continue;
		const content = await readFile(path, "utf8");
		const title = scalar(parseFrontmatter(content).raw, "title");
		if (title) titles.push(title);
		slugs.push(basename(file, ".mdx"));
	}

	return { titles, slugs };
}

function headContent(path) {
	return execFileSync("git", ["show", `HEAD:${path}`], { encoding: "utf8" });
}

function writeOutput(key, value) {
	if (!process.env.GITHUB_OUTPUT) return;
	const safeValue = String(value).replaceAll("\n", " ");
	appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${safeValue}\n`);
}

async function appendSummary(path, lines) {
	if (path) await appendFile(path, `${lines.join("\n")}\n`);
}

async function writePrBody(path, draft) {
	const sourceLines = draft.evidenceLinks.map((url) => `- [${domain(url)}](${url})`);
	const isRefresh = draft.operation === "refresh";
	const body = [
		isRefresh ? "## Automated content refresh" : "## Automated editorial draft",
		"",
		`This ${isRefresh ? "refresh" : "draft"} was researched and written by Claude Opus 5. It will not publish until a maintainer reviews and merges this draft PR.`,
		"",
		`- **Article:** ${draft.title}`,
		`- **Operation:** ${isRefresh ? "Refresh existing post" : "Create new post"}`,
		`- **Length:** ${draft.wordCount.toLocaleString()} words`,
		`- **Slug:** \`${draft.slug}\``,
		...(isRefresh
			? [
					`- **Updated:** ${draft.updated}`,
					`- **Body change:** ${draft.changedWords.toLocaleString()} changed word occurrences`,
				]
			: []),
		"",
		"### Evidence sources cited",
		"",
		...sourceLines,
		"",
		"### Review checklist",
		"",
		"- [ ] Claims and source interpretations are accurate",
		isRefresh
			? "- [ ] The new evidence materially improves the article and justifies its updated date"
			: "- [ ] The angle adds useful information beyond the linked sources",
		"- [ ] Search intent and internal links are appropriate",
		"- [ ] Tone matches the rest of the Elmo blog",
		"",
	];
	const absolutePath = resolve(path);
	await mkdir(dirname(absolutePath), { recursive: true });
	await writeFile(absolutePath, body.join("\n"));
}

async function main() {
	const options = parseArguments(process.argv.slice(2));
	const status = gitStatus();
	const candidateChanges = status.filter(({ path }) => path.startsWith(`${BLOG_DIRECTORY}/`) && path.endsWith(".mdx"));
	const otherChanges = status.filter(({ path }) => !path.startsWith(`${BLOG_DIRECTORY}/`) || !path.endsWith(".mdx"));

	if (otherChanges.length) {
		throw new Error(
			`The blog agent changed files outside the allowed directory:\n${otherChanges
				.map(({ status: code, path }) => `- ${code} ${path}`)
				.join("\n")}`,
		);
	}
	if (candidateChanges.length > 1) {
		throw new Error(`The blog agent created or changed more than one post:\n${candidateChanges.map(({ path }) => `- ${path}`).join("\n")}`);
	}
	if (candidateChanges.length === 0) {
		if (options.requirePost) throw new Error("A blog post was required at this validation stage, but none was found");
		writeOutput("has_post", "false");
		await appendSummary(options.summary, [
			"## Editorial decision",
			"",
			"Claude did not find a sufficiently strong topic, so no blog draft or pull request was created.",
			"",
		]);
		console.log("No blog draft was created");
		return;
	}

	const change = candidateChanges[0];
	const isNewPost = ["??", "A ", "AM"].includes(change.status);
	const isRefresh = [" M", "M ", "MM"].includes(change.status);
	if (!isNewPost && !isRefresh) {
		throw new Error(
			`The agent may only add one post or modify one existing post; found git status "${change.status}" for ${change.path}`,
		);
	}

	const content = await readFile(change.path, "utf8");
	const existing = await existingBlogMetadata(change.path);
	const operation = isRefresh ? "refresh" : "create";
	const originalContent = isRefresh ? headContent(change.path) : undefined;
	const draft = validateDraftContent({
		content,
		filename: change.path,
		expectedDate: options.expectedDate,
		existingTitles: existing.titles,
		existingSlugs: existing.slugs,
		operation,
		originalContent,
	});

	await writePrBody(options.prBody, draft);
	writeOutput("has_post", "true");
	writeOutput("operation", operation);
	writeOutput("draft_path", change.path);
	writeOutput("slug", draft.slug);
	writeOutput("title", draft.title);
	writeOutput("pr_title", isRefresh ? `Refresh: ${draft.title}` : `Draft: ${draft.title}`);
	writeOutput("commit_message", isRefresh ? `refresh ${draft.slug} blog post` : `draft ${draft.slug} blog post`);
	await appendSummary(options.summary, [
		isRefresh ? "## Refresh validation" : "## Draft validation",
		"",
		`Validated **${draft.title}** (${draft.wordCount.toLocaleString()} words, ${draft.evidenceDomains.length} evidence domains, ${draft.internalBlogLinks.length} internal links${isRefresh ? `, ${draft.changedWords.toLocaleString()} changed word occurrences` : ""}).`,
		"",
	]);
	console.log(`Validated ${operation} for ${change.path} (${draft.wordCount} words)`);
}

const entrypoint = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === entrypoint) {
	main().catch((error) => {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	});
}
