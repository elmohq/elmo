# Owned content

Contents: what to write · how to write it · keeping it true · what not to do

Owned pages win citations when they are the best available answer to a query the engine actually
runs. Every content recommendation should name the lost prompts or fan-out queries it targets.

## What to write

Work from the diagnosis, not a template:

1. **A page for every lost intent.** For each unbranded prompt where competitors appear and the brand
   doesn't, check whether the site has a crawlable page that answers it directly. Often it doesn't:
   the use case lives in a slide deck, or the comparison exists only in sales calls.
2. **Pages for recurring fan-out queries.** Engines rewrite a prompt into several searches (for
   example "best CRM for agencies" becomes "CRM agency pricing comparison" and "CRM client portal
   features"). Pages that rank for those sub-queries get retrieved. Elmo's `get_query_fanout` lists
   them. Without it, inspect the sources engines cite and infer the searches.
3. **Comparison and alternatives pages** for the locked competitor set. They should be honest and
   specific, including where the competitor is the better fit. Engines draw on comparison content
   heavily, and one-sided pages get used as sources while the engine recommends someone else.
4. **Fact pages the engines get wrong.** Pricing, plans, limits, integrations, supported regions,
   security and compliance, and changelog. Each wrong fact found in branded answers needs a crawlable
   page that states the right one plainly, with a date.
5. **Original data.** Benchmarks, surveys, and aggregate product data that others will cite. This is
   the one content type that also earns third-party coverage, which `off-site.md` builds on.

## How to write it

- **Answer first.** Open with a direct answer to the question the page targets, in the first
  paragraph, then support it. Citation studies find that a large share of quoted sentences come from
  the top of the page. This is ordinary good writing, not a chunking trick.
- **Match the query in the title and headings.** Titles and headings that closely match the query or
  sub-query get cited more. Use the words buyers use, not internal product names.
- **Be specific.** Use numbers, names, prices, limits, dates, and named sources. "Integrates with
  Salesforce, HubSpot, and Pipedrive; syncs every 5 minutes" can be quoted, while "seamless
  integrations" can't.
- **Show evidence.** Cite sources, quote named people with real credentials, and publish method
  notes for any data. The GEO research found these help once a page is retrieved. Don't expect them
  to get a page retrieved.
- **Say who it's for and who it isn't for.** Engines answering "best X for Y" need fit criteria. A
  page that states its fit clearly is easy to recommend for that fit.
- **Make it visible and crawlable.** Put key facts in server-rendered HTML text, not images, PDFs
  only, or content behind clicks (`technical.md`).
- **Name a real author and show dates.** Show a published date and a meaningful "updated" date, plus
  an author with relevant expertise. Engines and readers both use these to judge trust.
- **Use tables where readers compare** (plans, specs, alternatives). Don't force tables or FAQ blocks
  onto pages that don't need them.

## Keeping it true

- Update pages when the facts change, and change the date only then. Some engines favor recently
  updated pages, but faking freshness is a spam risk and gets noticed.
- After changing a fact, re-check the branded prompts that got it wrong. Engines that cache sources
  can take weeks to catch up, and the old fact may live on in third-party pages (`off-site.md`).
- Keep one canonical page per fact. Contradictions between the pricing page, docs, and old blog posts
  give the engine contradictory sources.

## What not to do

- Don't write separate "for AI" versions of pages, hidden text, or content that only crawlers see.
  That is cloaking.
- Don't split pages into tiny chunks or pad them to a magic word count.
- Don't publish self-promotional "best X" listicles at scale that rank your own product first. Engines
  cite them and then recommend someone else, and Google has acted against the pattern.
- Don't use AI to mass-produce pages for every keyword variant. Google's scaled-content policy covers
  this, and its spam policies now explicitly apply to AI Overviews and AI Mode.
- Don't rewrite pages chasing "GEO tactics" until the rewrites stop saying what the product actually
  does. Optimizing hard for visibility can drift away from accuracy, and the inaccuracy gets repeated
  under the brand's name.
