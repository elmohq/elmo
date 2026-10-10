# Off-site

Contents: why off-site matters · building the target list · consistent positioning · playbooks by
source type · lines not to cross

Answer engines lean heavily on third-party pages. Academic comparisons find that ChatGPT and
similar engines cite earned editorial sources far more than brand-owned pages for product
questions, and the strongest correlate of AI Overview brand visibility in industry data is how
often the brand is mentioned across the web, not backlinks. Both findings are correlational and
favor big brands, but the direction is consistent: what others say about a brand is much of what
the engines say about it.

## Building the target list

Don't start from a generic list of "sites AI likes". Global citation-share statistics vary by
study, by engine, and by month. Start from the brand's own data:

1. Take the **lost prompts** (unbranded, competitors present, brand absent).
2. Pull every cited URL for them, per engine. In Elmo, use `get_citations`; editorial URLs are
   already labeled.
3. Classify each non-owned URL:
   - **Editorial / listicle:** "best X" roundups, reviews, comparisons on publisher or affiliate sites
   - **Review platforms:** G2, Capterra, TrustRadius, Trustpilot, app stores, and category-specific sites
   - **UGC:** Reddit threads, forums, Quora, Stack Exchange, YouTube videos, LinkedIn posts
   - **Reference:** Wikipedia, Wikidata, industry directories, standards bodies
   - **Competitor-owned:** their docs, comparison pages, and blogs
4. Rank targets by **how many lost prompts and engines cite them**. A roundup cited for nine prompts
   across three engines is worth more than ten pages cited once.
5. For each target, record whether the brand is absent, present but described poorly, or present and
   accurate. Then pick the play below.

Re-pull the list monthly. Cited sources churn: a large share of cited URLs change between runs.

## Consistent positioning

An engine writes its description of a brand from many pages at once. When those pages agree on what
the brand is and who it's for, the answer repeats it. When they disagree, the answer hedges, picks
the most-repeated version, or keeps an old one. This is usually why a brand is mentioned but not
recommended for the need it cares about (`measurement.md`, "Cited is not recommended"): the sources
the engine reads don't connect the brand to that need, in words the buyer uses.

1. **Write the canonical description.** One short paragraph: the category, who it's for, the two or
   three things that set it apart, and the pricing model. Use the words buyers use for the category,
   not an invented one. Every profile below should be able to quote it.
2. **List where the description lives.** Start with the profiles the engines cite for branded and
   lost prompts. Then check the usual set: review platforms, Crunchbase, the LinkedIn company page,
   Wikidata, app marketplaces, partner and integration directories, social bios, and the press
   boilerplate.
3. **Compare each one with the canonical description.** Note a wrong category, an old segment
   ("for startups" after moving upmarket), stale pricing, retired product names, or a missing use
   case. Fix the ones the brand controls first, then ask publishers for the rest (see Corrections
   below).
4. **Make the use case a third-party fact.** To be recommended "for agencies", pages other than the
   brand's own must say it's good for agencies: reviews from agency customers, case studies published
   by partners, and roundups that list it in that category.
5. **Re-check branded answers** after the changes, and expect stale descriptions to persist for
   weeks.

After a rebrand, merger, or repositioning, the old description is everywhere and the new one is
nowhere. Redirect old product URLs, update profiles in one pass, say plainly on the site what the
brand used to be called, and prioritize the most-cited pages that still use the old story.

## Playbooks by source type

**Editorial and listicles.** Find the author and the update cadence. Pitch with a reason to include
the brand: a real differentiator, original data, a free account to test, or a correction of an
outdated description. Prioritize pages the engines cite across several prompts. Paid placement on
affiliate lists exists. If the user pursues it, it must be labeled as sponsored on the page, and it
counts as advertising, not earned coverage.

**Review platforms.** Claim the profiles and make the facts on them (pricing, category, features,
screenshots) match the site. Ask real customers for reviews through normal channels. Never write
or buy them. Respond to negative reviews with facts, because engines quote them.

Review rules are law, not just platform policy. In the US, the FTC's rule on consumer reviews (16
CFR Part 465, in force since October 2024) bans fake and AI-generated reviews, incentives
conditioned on a positive review, undisclosed insider reviews, and review suppression: hiding
reviews because of their rating while presenting the ones shown as representative. Neutral
moderation is allowed when the criteria ignore sentiment and apply to every review (abuse, personal
data, spam, content that's false). Google Maps goes further: its content policy bans any incentive
for a review, disclosed or not, and selectively asking only happy customers. On your own site,
review or rating markup about your own business (`LocalBusiness` or any `Organization`) is
ineligible for Google's review stars.

**Reddit, forums, and communities.** Participate as a disclosed company representative: answer
questions in threads the engines cite, help without pitching, and correct factual errors with a
source. Don't run sock-puppet accounts, astroturf, or buy upvotes or aged accounts. Communities
detect it, moderators remove it, and Google's spam policies now treat inauthentic mentions as spam
in AI features.

**YouTube.** Video mentions correlate strongly with AI visibility in industry data, and engines
cite YouTube directly. Publish demos, tutorials, and comparisons with accurate titles, descriptions,
chapters, and transcripts (engines read the text, not the pixels). Creator reviews are earned media
if they're independent, and must be disclosed if paid.

**Wikipedia and Wikidata.** Wikipedia has strict notability and conflict-of-interest rules.
Employees and agencies shouldn't write or edit the brand's article. They can propose corrections on
the talk page, with independent sources, while disclosing the relationship. Notability comes from
independent coverage, which is the editorial play above. Wikidata entries for the organization
(official website, founding date, identifiers) are easier to keep accurate and feed knowledge graphs.

**Press and original research.** Data that journalists and bloggers cite generates the third-party
mentions engines rely on. One credible study cited by twenty pages beats twenty press releases.
Wire-only press releases are seldom what gets cited. Don't load releases with keyword-rich anchor
links: Google's link spam policy names "links with optimized anchor text in articles, guest posts,
or press releases distributed on other sites". Qualify such links with `rel="nofollow"` or
`rel="sponsored"`, and put the report's key findings in crawlable text, not only in a gated PDF or an
image.

**Partners and integrations.** Partner directories, marketplace listings, and integration docs on
other companies' sites are third-party pages that describe the brand's capabilities in specific
terms. Keep them current.

**Corrections.** For wrong facts traced to a third-party page, contact the publisher with the
correct fact and a source, starting with the pages cited most often. Old reviews and outdated
comparisons are the usual culprits.

## Lines not to cross

- No fake reviews, sock puppets, seeded threads, paid mentions without disclosure, or mention farms.
- Employees, agencies, and paid partners who recommend the product must disclose the connection.
  The FTC's Endorsement Guides require disclosing material connections. Reddit's rules prohibit
  content and vote manipulation, and many communities ban undisclosed self-promotion.
- Paid list placements must be labeled as sponsored on the page, and their links qualified with
  `rel="sponsored"`. Google says seeking inauthentic mentions across the web isn't as helpful as it
  might seem, and its spam policies cover them in AI features too.
- No "parasite" content on high-authority domains you don't control. Google's site reputation abuse
  policy targets it.
- No spam-pitching every author on a list. Prioritize by citation frequency and pitch with substance.
- No wiki edits by people paid to make them without disclosure.

These tactics carry policy risk, and they tend to stop working as engines and platforms adjust. The
work that lasts is the brand being worth mentioning, and making sure the people who write about the
category know it exists.
