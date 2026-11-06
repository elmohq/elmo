# Technical access

Contents: crawler matrix · robots.txt patterns · firewall and CDN blocks · JavaScript rendering ·
indexing · snippet controls · where each engine gets its pages · reading the audit script ·
llms.txt and schema · product data and shopping · AI agents using the site · moving domains

An engine can only cite pages it can fetch, and for most engines only pages that a search index
already holds. Access problems are binary and often invisible, so check them before content work.

## Crawler matrix

Crawlers fall into three groups that do different jobs. Blocking a training crawler doesn't
remove a site from AI answers. Blocking a search crawler does.

| User agent | Operator | Purpose | Blocking it costs |
| --- | --- | --- | --- |
| `OAI-SearchBot` | OpenAI | Indexes pages for ChatGPT search | Citations in ChatGPT search answers |
| `ChatGPT-User` | OpenAI | Live fetch when a user's request needs a page; robots.txt may not apply | Live, user-triggered reads |
| `GPTBot` | OpenAI | Training data | Use in future OpenAI model training only |
| `Claude-SearchBot` | Anthropic | Indexes pages to improve Claude's search results | Visibility in Claude's search answers |
| `Claude-User` | Anthropic | Live fetch for a Claude user's request | Live, user-triggered reads |
| `ClaudeBot` | Anthropic | Training data | Use in future Claude training only |
| `PerplexityBot` | Perplexity | Indexes pages for Perplexity answers; Perplexity says it isn't used to train foundation models | Citations in Perplexity |
| `Perplexity-User` | Perplexity | Live fetch for a user's request; generally ignores robots.txt | Live, user-triggered reads |
| `Googlebot` | Google | Google Search, *including* AI Overviews and AI Mode | All of Google Search and its AI features |
| `Google-Extended` | Google | Product token, not a separate crawler. Controls Gemini training **and grounding in the Gemini app and Vertex AI** | Gemini training, and possibly Gemini app answers. AI Overviews are unaffected |
| `Bingbot` | Microsoft | Bing index, which powers Copilot and feeds others | Bing, Copilot, and engines that use Bing results |
| `Applebot` / `Applebot-Extended` | Apple | Applebot crawls for Siri and Spotlight. Applebot-Extended doesn't crawl: it only controls whether Applebot's data trains Apple's foundation models | Apple search features / Apple training only; blocking Applebot-Extended doesn't remove pages from Apple search |
| `Meta-ExternalAgent` | Meta | Crawling for Meta AI products and training | Meta AI |
| `Amazonbot` | Amazon | Amazon services, including Alexa and Rufus answers | Amazon AI surfaces |
| `DuckAssistBot` | DuckDuckGo | Fetches for DuckAssist answers | DuckDuckGo AI answers |
| `MistralAI-User` | Mistral | Live fetch for Le Chat users | Le Chat answers |
| `CCBot` | Common Crawl | Open crawl used by many model trainers | Inclusion in third-party training sets |
| `Bytespider` | ByteDance | Training and ByteDance products | ByteDance AI surfaces |

Names and behavior change. Check each vendor's crawler page before writing strict rules. The older
`anthropic-ai` and `Claude-Web` agents are retired, so rules for them do nothing.

## robots.txt patterns

robots.txt groups match by user agent, and the most specific group wins. A bot named in its own
group ignores the `*` group entirely, so `Allow: /` under `*` does not rescue a bot disallowed by
name. Within a group, the longest matching path wins, and `Allow` wins ties.

**Maximum AI visibility** (the right default for most businesses):

```
User-agent: *
Allow: /
Disallow: /admin/
Disallow: /cart/

Sitemap: https://www.example.com/sitemap.xml
```

**Stay in AI answers, opt out of training:**

```
User-agent: GPTBot
User-agent: ClaudeBot
User-agent: CCBot
User-agent: Google-Extended
User-agent: Applebot-Extended
Disallow: /

User-agent: *
Allow: /

Sitemap: https://www.example.com/sitemap.xml
```

Blocking `Google-Extended` can also cost Gemini app grounding. Say so to the user before
recommending it. OpenAI says robots.txt changes for `OAI-SearchBot` take effect in about 24 hours.

Common failures: a leftover `Disallow: /` under `*` from staging; a CMS or security plugin adding
AI-bot blocks; a CDN-managed robots.txt that prepends rules you didn't write; robots.txt returning
5xx (Google treats that as "don't crawl").

## Firewall and CDN blocks

robots.txt can allow a bot while the CDN or firewall returns 403 or a challenge page to it. Check:

- Cloudflare: **AI Crawl Control**, "Block AI bots", Bot Fight Mode, and managed robots.txt.
  Cloudflare has blocked AI crawlers by default on new zones since mid-2025.
- Other WAFs (Akamai, Fastly, AWS WAF, Vercel firewall, Sucuri, Wordfence): bot-management rules
  and rate limits that catch crawlers.
- Logs: a real AI crawler getting 403s, or never appearing at all, is the confirmation. Verify
  crawler IPs against the vendor's published ranges.

## JavaScript rendering

Googlebot renders JavaScript. Most AI crawlers, including OpenAI's, Anthropic's, and Perplexity's,
fetch raw HTML and don't execute it. If the main content, product facts, or pricing only appear
after client-side rendering, those crawlers see an empty shell.

Fix: server-side render or statically generate key pages; put essential facts in the HTML rather
than behind tabs that load on click, accordions that fetch on open, or images of text. Check by
fetching the raw HTML (`curl -s URL`) and searching it for a sentence from the page.

## Indexing

- **Google:** Search Console URL Inspection, the sitemap report, and the generative AI performance
  report for which pages appear in AI features. Fix `noindex` mistakes, wrong canonicals, and soft
  404s.
- **Bing:** verify the site in Bing Webmaster Tools, submit sitemaps, and use IndexNow to push
  changes. Bing feeds Copilot and is one of ChatGPT's search sources. Its AI Performance report
  shows Copilot citations and grounding queries.
- **Sitemaps:** keep accurate `lastmod` values for pages that really changed. `changefreq` and
  `priority` are ignored.
- Spot-check that key pages are in each index by searching for an exact sentence from them.

## Snippet controls

- Google: `nosnippet`, `max-snippet`, and `data-nosnippet` limit what AI Overviews and AI Mode can
  show from a page, the same way they limit normal snippets. A stray `nosnippet` silently removes a
  page from AI features. Search Console's **Search generative AI** control opts a whole site out of
  AI Overviews and AI Mode (worldwide since 31 Aug 2026), and only those: Google says it isn't a
  ranking signal for ordinary web results. To appear in those features at all, a page
  must be indexed, eligible for a snippet, and on a site that hasn't been excluded there.
- Bing: per Bing's guidance, `NOCACHE` limits Copilot to the URL, title, and snippet, and
  `NOARCHIVE` keeps the page out of Copilot answers.
- Check both the `<meta name="robots">` tag and the `X-Robots-Tag` header.

## Where each engine gets its pages

Use this to explain per-engine gaps found in step 4, then confirm with the brand's own cited-source
data. Don't rely on global citation-share statistics, which shift with every product update.

| Engine | Retrieval | What to check |
| --- | --- | --- |
| Google AI Overviews, AI Mode | Google's index and core ranking. AI Mode fans a question out into many sub-searches. Citations increasingly come from pages ranking for sub-queries, not the original query | Googlebot access, indexing, ranking for fan-out queries, snippet controls |
| ChatGPT search | OpenAI's own index (OAI-SearchBot) plus third-party search results (Bing, and reportedly others), plus live fetches | `OAI-SearchBot` allowed, Bing indexing, raw HTML content |
| Copilot | Bing index | Bing Webmaster Tools, IndexNow, `NOCACHE`/`NOARCHIVE` |
| Perplexity | Own index (PerplexityBot) plus live fetches | `PerplexityBot` allowed, raw HTML content |
| Claude | Claude-SearchBot plus a third-party search provider, plus live fetches | `Claude-SearchBot` and `Claude-User` allowed |
| Gemini app | Google Search grounding | Google indexing; `Google-Extended` not blocked |

## Reading the audit script

`scripts/check_ai_access.py URL [URL ...]` uses only the Python standard library. Add `--json` for
machine-readable output.

- **robots** — `allowed` or `blocked` for each crawler token, using RFC 9309 matching (most
  specific group, longest path, `*` and `$` wildcards).
- **fetch** — the HTTP status when the page is requested with each crawler's user agent, compared
  with a browser request. A 403 or 429, or a challenge page, for a crawler but not the browser means
  a firewall rule *or* bot verification rejecting a spoofed user agent (Cloudflare and others check
  that "GPTBot" really comes from OpenAI's IPs). Confirm in CDN settings or logs before calling it a
  block.
- **noindex / nosnippet** — from the meta robots tag and the `X-Robots-Tag` header.
- **raw HTML text** — the word count of visible text without running JavaScript. Very low counts
  with a large script payload mean the page probably depends on client-side rendering.

## llms.txt and schema

- **llms.txt:** optional. It's a 2024 community proposal (Jeremy Howard, llmstxt.org), not a
  ratified standard. No consumer answer engine documents reading it, server-log studies show AI
  crawlers almost never request it, and Google says Google Search doesn't use it. It's worth having
  for developer documentation, because coding agents and IDE tools do read it. Don't present it as an AEO lever, and don't spend time on it
  before access and indexing are clean.
- **Schema markup:** keep valid `Organization`, `Product`, `Article`, `BreadcrumbList`, and similar
  markup for rich results and to tie the brand's entity together (`sameAs` links to official
  profiles). Don't promise AI citations from it. Google says no special markup is needed, and live AI
  fetchers read visible content. Any fact that matters must be in visible text, and markup must only
  describe content readers can see on the page (Google's structured data policies), including any
  FAQPage markup you keep. FAQ rich results no
  longer appear in Google Search (since 7 May 2026); existing FAQPage markup is harmless but earns
  nothing there.

## Product data and shopping

Schema skepticism stops at product data. For stores, Google's shopping experiences, including those
in AI Mode, draw on `Product` structured data and Merchant Center feeds, and Google says providing
both maximizes eligibility. Keep price, availability, currency, and variants identical across the
feed, the markup, and the visible page; a mismatch is the most common reason product data gets
ignored or disapproved. Other engines read the visible product page, so the same facts must be in
HTML text. For Google merchant listings, the markup needs at least `name`, `image`, and an `Offer`
with a `price` above zero and a `priceCurrency`.

ChatGPT's product results are chosen by ChatGPT, not bought: OpenAI says they aren't ads (ads are
labeled separately), and the merchant list comes from product metadata supplied by third-party
providers or by merchants through OpenAI's product feed program. Shopify stores are included through
Shopify Catalog. No engine guarantees placement, so promise eligibility, not inclusion, and check each
engine's current merchant documentation before recommending a program.

## AI agents using the site

Agents that browse for a user (booking a demo, comparing plans, checking out) perceive a page through
some mix of screenshots, the raw HTML or DOM, and the accessibility tree. What helps them is what
helps assistive technology:

- Real `<button>`, `<a>`, `<label>`, and form elements instead of clickable `<div>`s and unlabeled
  inputs.
- No overlays, cookie walls, or invisible layers that intercept clicks, and no layout shift that
  moves targets after load.
- Key facts (prices, plans, availability) in text, not only in images or canvas.

Test it: inspect the accessibility tree in browser dev tools, run an automated accessibility audit,
complete the flow by keyboard alone, and, if you can, have a browsing agent attempt the task.

## Moving domains

A rebrand or a new domain resets much of what engines know. Redirect every old URL to its new
equivalent with a permanent server-side redirect (301 or 308), not everything to the homepage.
Update internal links, canonicals, sitemaps, and structured data to the new URLs, use Search
Console's Change of Address tool, and keep the redirects in place for at least a year. Expect search
and AI visibility to fluctuate for weeks while engines recrawl. Then work through the old
description wherever it lives (`off-site.md`, "Consistent positioning").
