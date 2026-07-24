# Daily AEO blog agent

The daily workflow reviews signals from the previous seven days, asks Claude Opus 5 to choose between creating one post, substantively refreshing one existing post, or making no change, validates the result, and opens a draft pull request. It never publishes directly.

## Source strategy

Discovery uses sources that do not require separate paid social subscriptions:

| Source | Cost/authentication | Role |
| --- | --- | --- |
| Google News RSS | Free, no key | Recent reporting and company announcements |
| Bluesky public search | Free, no key | Practitioner questions and discussion signals |
| Hacker News via Algolia | Free, no key | Technical discussion and linked projects |
| GitHub Search | Workflow token | New open-source tools and experiments |
| arXiv API | Free, no key | Recent research |
| Oxylabs Google Search | Optional existing credentials | Broader web results plus indexed Reddit, LinkedIn, and X signals |

The workflow does not call Reddit, X, or LinkedIn APIs or scrape those sites directly. Their access terms and pricing change frequently, and social posts are weak factual evidence. When Oxylabs is configured, Google result snippets from those domains help identify questions; Claude still has to verify claims against primary or reputable sources.

Oxylabs is optional. If `OXYLABS_USERNAME` and `OXYLABS_PASSWORD` are absent or an optional source fails, the workflow continues with the free sources. Candidate data exists only on the runner under the ignored `.agents/` directory and is not committed.

## Repository setup

1. Add `ANTHROPIC_API_KEY` as a GitHub Actions secret.
2. Optionally add the existing `OXYLABS_USERNAME` and `OXYLABS_PASSWORD` secrets.
3. In **Settings → Actions → General → Workflow permissions**, allow GitHub Actions to create pull requests.

The workflow uses the repository `GITHUB_TOKEN` and a run-scoped branch to create each draft PR. Existing automated PRs do not block or get reused by later runs. It runs formatting, draft validation, type checking, and the marketing-site build before creating the PR, so review does not depend on a second workflow being triggered by the bot token.

Claude is capped at 14 agent turns and $3 per run; hitting either limit fails safely without opening a PR.

## Marketing skills

The workflow checks out a pinned revision of [`coreyhaines31/marketingskills`](https://github.com/coreyhaines31/marketingskills) and installs only `product-marketing`, `content-strategy`, `ai-seo`, and `copywriting` into the runner's Claude skills directory. The pin makes editorial behavior reviewable and avoids executing a package installer during CI.

The skills provide planning and structural guidance; they are not factual sources. The repository-specific [product marketing brief](./product-marketing.md) and workflow prompt override any conflicting generic advice.

To update the skills, review the upstream changes, update the commit SHA in `daily-blog-draft.yaml`, and run the local tests below.

## New posts and content refreshes

Claude may add one new MDX file, modify one existing MDX file, or make no changes. It cannot do more than one of those in a run. Before choosing, it reviews the complete blog inventory and fully reads posts with potentially overlapping search intent. The workflow prefers a refresh when new evidence directly serves an existing post, reducing duplicate coverage.

A refresh preserves the post’s filename, original `date`, and `author`, then sets `updated` to the run date. The article page displays both the updated and published dates, `BlogPosting` JSON-LD exposes `dateModified`, and the sitemap uses the update as its genuine `lastmod`. RSS publication dates and blog ordering continue to use the original publication date.

Validation rejects a change that:

- changes more than one post or touches anything outside the blog directory;
- duplicates an existing slug or closely overlaps an existing title for a new post;
- lacks required metadata, FAQs, evidence citations, or internal links;
- puts a new post outside the 1,000–3,000-word validation range;
- cites fewer than two distinct non-social evidence domains;
- contains imports, scripts, an H1, or placeholders.

A refresh is also rejected if it changes the original publication metadata, omits today’s `updated` date, adds no new evidence URL, or changes fewer than 40 word occurrences in the body. Legacy posts have a wider 350–4,500 word range so useful corrections are not blocked by their original format; all other quality gates still apply.

External text is explicitly treated as untrusted. Claude cannot run shell commands, and any change outside the one allowed blog file fails the job.

## Local checks

Run discovery with free sources:

```sh
node .github/blog-agent/discover.mjs \
  --lookback-days 7 \
  --output .agents/blog-candidates.json
```

Add Oxylabs credentials to the environment to exercise its Google Search path. Run the deterministic tests with:

```sh
node --test .github/blog-agent/*.test.mjs
```
