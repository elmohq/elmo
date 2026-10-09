# Evidence

Last reviewed: 2026-10-09. This file holds the dated facts so `SKILL.md` doesn't have to. Before
quoting a figure to a user, give its source and date. Before relying on anything older than about a
year, check whether it has been superseded.

Credibility: **High** means peer-reviewed or a large, transparent method. **Medium** means a large
vendor or industry dataset, correlational or self-interested. **Low** means a small sample or an
opaque method.

## What has the most support

| Finding | Source | Credibility |
| --- | --- | --- |
| Getting retrieved matters more than rewriting. On current models, most content-rewriting methods produced near-zero or negative changes in citation rank (only 3 of 54 cases were significant positive results), while moving a document to the top of the retrieved list improved its rank by about 2–3 positions | C-SEO Bench, Puerto et al., NeurIPS 2025 Datasets & Benchmarks — <https://arxiv.org/abs/2506.11097> | High |
| Across 45 GEO studies (Nov 2023 – Jul 2026), no technique showed a stable, longitudinal, cross-platform causal effect on discoverability. Topical relevance and position in the context held up | Critical survey, arXiv, Jul 2026 — <https://arxiv.org/abs/2607.14035> | Medium-High |
| Engines cite earned third-party sources far more than Google does. In one consumer-electronics test, ChatGPT's sources were about 92% earned and 0% brand-owned, against roughly 52% earned for Google. Engines also show a big-brand bias | Chen et al., University of Toronto, Sep 2025 — <https://arxiv.org/abs/2509.08919> | Medium-High (preprint) |
| Branded web mentions correlated 0.664 with AI Overview brand visibility, against 0.218 for backlinks, across 75K brands. A later analysis found YouTube mentions correlated about 0.74 across AI Overviews, AI Mode, and ChatGPT | Ahrefs, May 2025 — <https://ahrefs.com/blog/ai-overview-brand-correlation/>; Ahrefs, Dec 2025 — <https://ahrefs.com/blog/ai-brand-visibility-correlations> | Medium (correlational; Ahrefs calls the effects moderate to weak) |
| ChatGPT cites pages whose titles match the prompt, and especially the best-matching fan-out sub-query, more than pages that don't match | Ahrefs, 1.4M ChatGPT prompts, Apr 2026 — <https://ahrefs.com/blog/why-chatgpt-cites-pages/> | Medium-High |
| About 44% of cited sentences in ChatGPT answers came from the first 30% of the page | Kevin Indig, 18K verified citations, 2026 — <https://searchengineland.com/chatgpt-citations-content-study-469483> | Medium |
| Only 38% of AI Overview citations ranked in the top 10 for the same query (down from 76%), attributed partly to query fan-out. For standalone assistants, about 12% of cited URLs rank in Google's top 10 (Perplexity 28.6%) | Ahrefs via SEJ, Mar 2026 — <https://www.searchenginejournal.com/google-ai-overview-citations-from-top-ranking-pages-drop-sharply/568637/>; Ahrefs, Aug 2025 — <https://ahrefs.com/blog/ai-search-overlap/> | Medium-High |
| AI Mode and AI Overviews cited only 13.7% of the same URLs for the same queries, while reaching semantically similar answers 86% of the time | Ahrefs via SEJ, 2025 — <https://www.searchenginejournal.com/google-ai-mode-ai-overviews-cite-different-urls-per-ahrefs-report/563364/> | Medium-High |
| AI-cited pages are on average about 26% fresher than Google organic results, most strongly in ChatGPT. AI Overviews show no freshness preference. LLM rerankers move passages with injected newer dates up sharply in lab tests | Ahrefs, 17M citations, 2025 — <https://ahrefs.com/blog/do-ai-assistants-prefer-to-cite-fresh-content>; Fang et al., Sep 2025 — <https://arxiv.org/abs/2509.11353> | Medium / High (lab) |
| When an AI Overview cited a brand's own "best X" listicle, it left that brand out of its recommendations 69% of the time | Lily Ray, 80 B2B queries, Jun 2026 — <https://searchengineland.com/google-ai-overviews-cite-self-serving-listicles-recommend-competitors-480573> | Medium-Low |

## Volatility and measurement

| Finding | Source | Credibility |
| --- | --- | --- |
| The same brand list came back less than 1 time in 100, and the same list in the same order about 1 in 1,000. Top brands still appeared in 55–77% of runs | SparkToro/Gumshoe, 2,961 runs, Jan 2026 — <https://sparktoro.com/blog/new-research-ais-are-highly-inconsistent-when-recommending-brands-or-products-marketers-should-take-care-when-tracking-ai-visibility/> | Medium |
| AI Overview content changed between consecutive checks 70% of the time, and 45.5% of cited URLs were new on each regeneration, while the meaning stayed stable (0.95 similarity) | Ahrefs, 43K keywords, Nov 2025 — <https://ahrefs.com/blog/ai-overview-change> | Medium-High |
| About 5, 10, and 15 repeats per prompt give exploratory, confirmatory, and rigorous reliability | "Dice Roll Method", ~190K observations, Sep 2026 — <https://arxiv.org/abs/2609.04047> | Medium (preprint) |
| Visibility should be measured as a distribution across runs, prompts, and time, not a snapshot | Schulte et al., Apr 2026 — <https://arxiv.org/abs/2604.07585> | Medium (preprint) |

## Platform documentation

- Google, optimizing for generative AI features in Search (updated 10 Jul 2026): no special files, markup, or Markdown needed, and Google Search doesn't use them; no special schema; no need to chunk content. To be eligible, a page must be indexed, eligible for a snippet, and the site must be included in Search generative AI features in Search Console — <https://developers.google.com/search/docs/fundamentals/ai-optimization-guide>
- Google, generative AI performance report in Search Console (announced Jun 2026, worldwide 31 Aug 2026) — <https://developers.google.com/search/blog/2026/06/gen-ai-performance-reports>
- Google, AI features: AI Overviews and AI Mode traffic is reported in the Performance report under the "Web" search type — <https://developers.google.com/search/docs/appearance/ai-features>
- Google, Product structured data: providing both structured data and a Merchant Center feed maximizes eligibility — <https://developers.google.com/search/docs/appearance/structured-data/product>
- Google, people-first content: changing page dates without substantial changes is a warning sign — <https://developers.google.com/search/docs/fundamentals/creating-helpful-content>
- Google, syndication: cross-domain canonical is a hint; noindex recommended on syndicated copies (Office Hours, Jun 2023) — <https://developers.google.com/search/help/office-hours/2023/june>
- Google, qualifying paid links with rel="sponsored" — <https://developers.google.com/search/docs/crawling-indexing/qualify-outbound-links>
- Google, site moves with URL changes — <https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes>
- FTC Endorsement Guides (material connections must be disclosed) — <https://www.ftc.gov/legal-library/browse/rules/guides-concerning-use-endorsements-testimonials-advertising>
- llms.txt proposal (Jeremy Howard, Sep 2024) — <https://llmstxt.org/>
- Google spam policies apply to AI Overviews and AI Mode, including inauthentic mentions (May 2026) — <https://developers.google.com/search/docs/essentials/spam-policies>
- Google, FAQ rich results no longer shown in Search from 7 May 2026, for all sites; existing FAQPage markup does no harm — <https://developers.google.com/search/docs/appearance/structured-data/faqpage>
- Google, HowTo rich results removed and FAQ restricted (Aug 2023) — <https://developers.google.com/search/blog/2023/08/howto-faq-changes>
- Google-Extended scope (Gemini training and grounding, not Search) — <https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers>
- OpenAI crawlers (OAI-SearchBot, GPTBot, ChatGPT-User) — <https://developers.openai.com/api/docs/bots>
- Anthropic crawlers (ClaudeBot, Claude-SearchBot, Claude-User) — <https://privacy.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler>
- Perplexity crawlers — <https://docs.perplexity.ai/guides/bots>
- Bing Webmaster Tools AI Performance (Feb 2026) — <https://blogs.bing.com/webmaster/February-2026/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview>
- AI crawlers and JavaScript rendering — <https://vercel.com/blog/the-rise-of-the-ai-crawler>

## Myths

| Claim | What the evidence says |
| --- | --- |
| "GEO boosts AI visibility by 40%" | The GEO paper (Aggarwal et al., KDD 2024, <https://arxiv.org/abs/2311.09735>) measured *word share* in a simulated engine: GPT-3.5 summarizing five fixed Google results. Its best method was **adding quotations** (about +41%), followed by statistics (about +30–34%) and citing sources (about +27–30%). "Authoritative tone" gained only about +11–13%, and keyword stuffing was negative. Gains went mostly to sources ranked 5th, at the expense of sources ranked 1st. C-SEO Bench later found these rewrites largely ineffective on current models. Some popular skills misorder this table and inflate the authoritative-tone figure. |
| "Expert quotes raise citation probability by 40.9%" | A garbled version of the GEO paper, which tested *adding quotations* and measured word share, not citation probability. |
| "llms.txt helps you get cited" | 97% of 137K llms.txt files got zero requests in a month, and AI bots never requested files that didn't exist (Ahrefs, May 2026, <https://ahrefs.com/blog/llmstxt-study/>). Google's John Mueller: "no AI system currently uses llms.txt" (Jun 2025), and Google's AI optimization guide (Jul 2026) says Google Search doesn't use such files. It is useful for developer docs read by coding agents. |
| "Schema markup increases AI citations" / "FAQ schema +40%" | A difference-in-differences study of 1,885 pages against 4,000 controls found no lift: AI Overviews −4.6%, while AI Mode and ChatGPT changes were noise (Ahrefs, May 2026, <https://ahrefs.com/blog/schema-ai-citations/>). Live AI fetchers ignored JSON-LD in testing (searchVIU, Oct 2025). Google says no special schema is needed. No primary source exists for the "+40%" figure. |
| "Chunk content for LLMs" / "write 40–60 (or 134–167) word passages" | Google's Danny Sullivan said explicitly not to chunk (Jan 2026), and Google's AI optimization guide (Jul 2026) says there's no need to. None of the passage-length figures traces to a primary source. Answer-first writing is supported. Fragmenting pages isn't. |
| "Reddit is 40% of AI citations" | 40.1% was the share of *responses* citing Reddit at least once in one Semrush sample. Reddit's share of all citations was about 1.8% in ChatGPT and 6.6% in Perplexity (Profound, 680M citations, 2025), and ChatGPT cut Reddit citations sharply in Sep 2025. |
| "Wikipedia is 48% of ChatGPT citations" | 47.9% was Wikipedia's share within ChatGPT's top-10 domains only. Its share of all citations was 7.8% (Profound). |
| "ChatGPT just uses Bing" | Overlap estimates range from 87% (100 queries, Seer) to about 8% (15K queries, Ahrefs). ChatGPT also runs its own index (OAI-SearchBot) and uses other search data. Bing indexing matters, but it isn't the whole picture. |
| "Rank #1 on Google and AI will cite you" | Only 38% of AI Overview citations rank in the top 10 for the query, and about 12% of standalone assistants' citations do. Ranking for fan-out sub-queries matters too. |
| "Our brand ranks #3 in ChatGPT" | The same list in the same order recurs about once in 1,000 runs. Only the share of runs mentioning the brand is stable enough to track. |
| "Backlinks are dead; mentions beat links 3:1" | Both numbers are weak correlations confounded by brand size. Traditional ranking still decides what gets retrieved. |
| "Update the date and AI will cite you" | AI Overviews show no freshness preference over organic results. Fake updates risk spam action. Update content, then the date. |
| "AI traffic converts 23× (or 4.4×) better" | The 23× is one company's anecdote, and the 4.4× is a modeled estimate for marketing topics. Amsive found no significant difference. Don't use these numbers in a business case. |
| "There's no AI reporting in Search Console" | Outdated since Jun 2026. The generative AI performance report shows AI Overviews and AI Mode impressions by page. |
| "Block Google-Extended to get out of AI Overviews" | Google-Extended controls Gemini training and Gemini app grounding, not Search. AI Overviews run on Googlebot. Use `nosnippet` controls or Search Console's Search generative AI control instead. |
| "GEO score: 72/100" | Composite scores use invented weights that haven't been validated against observed citations, and "monitoring" them just re-runs the heuristic. |

## Unverifiable figures (don't cite)

Figures attributed to an "Authoritas AI Overview Study 2026" (such as "FAQPage schema = 4.7×
citations" and "listicles = 63% of citations") circulate on aggregator sites but trace to no
Authoritas publication. Treat them, and any statistic without a primary source, as unverified.
