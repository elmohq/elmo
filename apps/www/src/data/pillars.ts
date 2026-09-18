import type { FaqItem } from "@/lib/faqs";

export interface PillarStep {
	name: string;
	text: string;
}

export interface PillarSection {
	id: string;
	heading: string;
	body: string[];
	steps?: PillarStep[];
	bullets?: string[];
	callout?: { heading: string; text: string };
}

export interface Pillar {
	slug: string;
	eyebrow: string;
	h1: string;
	metaTitle: string;
	description: string;
	lead: string;
	definition: string;
	sections: PillarSection[];
	faqs: FaqItem[];
	related: { label: string; href: string; description: string }[];
}

const AEO: Pillar = {
	slug: "answer-engine-optimization",
	eyebrow: "Guide",
	h1: "Answer Engine Optimization (AEO)",
	metaTitle: "Answer Engine Optimization (AEO): The Complete Guide · Elmo",
	description:
		"What answer engine optimization is, how AEO differs from SEO, how AI answer engines decide what to cite, what to measure, and how to run it — a practical guide from an open-source AEO platform.",
	lead: "SEO got you ranked. AEO gets you quoted. Here is what answer engine optimization actually is, how it works, and how to run it without guessing.",
	definition:
		"Answer engine optimization (AEO) is the practice of measuring and improving how often AI answer engines — ChatGPT, Google AI Overviews, Perplexity, Gemini, Copilot — mention and cite your brand. Where SEO competes for a position in a list of links, AEO competes to be the source a model quotes inside a written answer.",
	sections: [
		{
			id: "what-it-is",
			heading: "What answer engine optimization is",
			body: [
				"An answer engine does not hand you ten links and let you choose. It reads the web, decides what is true, writes a paragraph, and names a handful of sources. Your brand is either in that paragraph or it is not, and there is no second page to be on.",
				"Answer engine optimization is the work of getting into that paragraph. It borrows from SEO — clear writing, crawlable pages, credible sources — but the unit of success changes. You are no longer optimizing for a rank. You are optimizing for a mention, a citation, and the sentence the model writes about you.",
				"The discipline is young enough that it goes by four names. AEO, GEO (generative engine optimization), LLMO (large language model optimization), and generative SEO all describe the same work. Choose one and move on; the practitioners arguing about the acronym are not the ones getting cited.",
			],
		},
		{
			id: "what-aeo-stands-for",
			heading: "What AEO stands for in marketing",
			body: [
				"AEO stands for answer engine optimization. An answer engine is any system that responds to a question with a synthesized answer rather than a ranked list — ChatGPT, Perplexity, Claude, Gemini, Copilot, and Google's own AI Overviews and AI Mode.",
				"The term matters mostly because it marks a change in what marketing teams can control. For twenty years the deliverable was a position. Now the deliverable is a description: how the model characterizes your product, which competitors it names in the same breath, and whether it gets your pricing right.",
			],
		},
		{
			id: "aeo-vs-seo",
			heading: "AEO vs SEO: what actually changes",
			body: [
				"Most of SEO still applies. Answer engines read the same web crawlers index, prefer the same well-structured pages, and trust the same authoritative domains. If your site is unindexable, AEO is not your problem yet.",
				"Four things are genuinely different.",
			],
			steps: [
				{
					name: "The winner set is smaller",
					text: "A search result page has ten organic positions. An AI answer names three to six sources. The long tail of positions four through ten, which quietly carried a lot of traffic, does not exist.",
				},
				{
					name: "You are described, not just listed",
					text: "The model writes a sentence about your product. That sentence can be wrong, outdated, or subtly unflattering, and it will be repeated to every person who asks. Monitoring what the model says is as important as monitoring whether it mentions you.",
				},
				{
					name: "Off-site sources carry more weight",
					text: "Answers are frequently assembled from sources you do not own — Reddit threads, review roundups, LinkedIn posts, competitor comparison pages. Your own site is one input among many, and often not the decisive one.",
				},
				{
					name: "Results are non-deterministic",
					text: "Ask the same question twice and you can get different sources. A single check tells you almost nothing. Measurement has to be repeated across many runs to mean anything, which is the single biggest practical difference from rank tracking.",
				},
			],
		},
		{
			id: "how-engines-choose",
			heading: "How answer engines decide what to cite",
			body: [
				"Two mechanisms operate at once, and conflating them is the most common mistake in AEO.",
				"The first is retrieval. When an engine runs a live web search, it issues one or more queries, retrieves pages, and grounds its answer in what it finds. Here, classic SEO is doing the heavy lifting — if you do not surface for the query the model issues, you cannot be cited. The queries models issue are frequently not the queries humans type, which is why keyword research and prompt research are different exercises.",
				"The second is the model's own parametric memory — what it absorbed during training. This is why a brand can be recommended confidently in a chat with web access turned off. Parametric memory moves slowly, is shaped by how widely a brand is discussed across the open web, and cannot be influenced on a campaign timescale.",
				"Practically: retrieval is what you can move this quarter. Parametric memory is what you move over years, by being the thing people write about.",
			],
			callout: {
				heading: "Why the same prompt gives different answers",
				text: "Engines sample. They rewrite your question into search queries that vary run to run, and they retrieve different pages each time. Any claim about your AI visibility drawn from a single check is noise. Run each prompt repeatedly and look at the rate, not the result.",
			},
		},
		{
			id: "what-to-measure",
			heading: "What to measure",
			body: ["Four metrics carry almost all the signal. Everything else is a slice of one of them."],
			steps: [
				{
					name: "Mention rate",
					text: "Across many runs of a prompt, how often does your brand appear at all? This is the base metric. A brand at 3% on the central question in its category has a positioning problem, not a content problem.",
				},
				{
					name: "Citation rate",
					text: "How often does the engine link to a page you own? Mention without citation is common and still valuable, but a citation is the only version that sends traffic.",
				},
				{
					name: "Share of voice",
					text: "Of all the brands named in answers to your prompts, what fraction are you? This is the number that tells you whether you are winning, because AI answers are explicitly comparative in a way search results are not.",
				},
				{
					name: "Sentiment and accuracy",
					text: "What does the model actually say about you? Track the descriptions, not just the counts. A factual error repeated across thousands of answers is a bigger problem than a missing mention.",
				},
			],
		},
		{
			id: "playbook",
			heading: "How to run AEO",
			body: [
				"A workable programme has five parts. None of them are exotic; the discipline is in doing them repeatedly rather than once.",
			],
			steps: [
				{
					name: "Build a prompt set that reflects real buying questions",
					text: "Twenty to forty prompts, written the way a buyer would ask them. Include the generic category question ('best X tool'), the qualified versions ('best X tool for B2B SaaS'), the comparison questions, and the problem-first questions where your category is the answer but nobody names it. Track branded and unbranded separately.",
				},
				{
					name: "Measure before you change anything",
					text: "Run the set across the engines that matter to you, repeatedly, for at least a couple of weeks. You need a baseline with enough runs behind it to distinguish a real move from sampling noise.",
				},
				{
					name: "Fix the pages the engines already reach",
					text: "Look at what gets cited for your prompts — yours and everyone else's. Usually a handful of third-party roundups and comparison pages carry the category. Getting listed accurately on those moves the number faster than anything you publish on your own domain.",
				},
				{
					name: "Write the answer, not the article",
					text: "Put a direct, self-contained answer in the first 40 to 60 words under each heading. Models extract passages, not pages. A clear definitional paragraph is far more quotable than a well-argued essay that takes 400 words to reach the point.",
				},
				{
					name: "Re-measure and attribute",
					text: "Check the same prompts on the same cadence. Tag AI referral traffic so you can tell what converts. Expect movement in weeks for retrieval-driven prompts and quarters for anything that depends on how widely you are discussed.",
				},
			],
		},
		{
			id: "content",
			heading: "What kind of content gets cited",
			body: [
				"Three patterns come up repeatedly in citation data, and they are not the patterns that win at SEO.",
				"Comparison and alternatives pages punch far above their traffic. A page that honestly compares five tools in a category gets pulled into answers constantly, because that is the shape of the question people ask an answer engine. The same page may attract very little search traffic, which makes it easy to under-invest in.",
				"Definitional content — clear 'what is X' pages with a short, extractable definition up top — is the cheapest citation you can buy. It is also the shape that compounds: once a model has a good definition of your category, your framing travels with it.",
				"First-party data is the only genuinely defensible asset. Anyone can restate a study. If you publish the study, every article about it is a path back to you, and models cite the origin more often than the commentary.",
			],
		},
		{
			id: "tools",
			heading: "AEO tools",
			body: [
				"An AEO tool does one core job: run your prompts across the engines on a schedule, and record what came back. Everything else — dashboards, alerts, competitor tracking, reporting — is built on that log.",
				"The differences that matter when choosing one are which engines are covered and how, how many runs per prompt you get (sampling noise is the whole problem), whether you can see the raw answer rather than a score, and whether the methodology behind the score is inspectable.",
				"That last point is why Elmo is open source. A visibility score is a number somebody chose how to calculate. When two tools disagree about your brand — and they routinely do — the only way to know which is right is to read how each one counts. Elmo can be self-hosted, and the counting is in the repository.",
			],
			callout: {
				heading: "Try it without installing anything",
				text: "Elmo's directory of AI visibility tools compares the options in this category, including the open-source and self-hosted ones. It is the same comparison an answer engine would assemble, written by people who build in the category.",
			},
		},
		{
			id: "timeline",
			heading: "How long AEO takes",
			body: [
				"Retrieval-driven prompts respond within weeks. If you get added to a roundup the engines already cite, or you publish a page that ranks for the query the model issues, you can see the mention rate move on the next measurement cycle.",
				"Parametric prompts — where the engine answers from memory without searching — move on a timescale of quarters to years, and only as a by-product of being genuinely well known. No tactic accelerates this. It is the accumulated residue of being written about.",
				"The honest framing for a marketing team: AEO is a measurement discipline first and a content discipline second. Most of the early wins come from finding out you are invisible on a question you assumed you owned.",
			],
		},
	],
	faqs: [
		{
			question: "What does AEO stand for in marketing?",
			answer:
				"AEO stands for answer engine optimization: the practice of measuring and improving how often AI answer engines like ChatGPT, Google AI Overviews, Perplexity, and Gemini mention and cite your brand in their written answers.",
		},
		{
			question: "What is the difference between AEO and SEO?",
			answer:
				"SEO competes for a position in a ranked list of links. AEO competes to be a source the model quotes inside a synthesized answer. SEO fundamentals still matter, because most engines retrieve from the live web, but AEO adds three things: only three to six sources are named instead of ten, the model describes your brand rather than just listing it, and results vary between runs, so measurement has to be repeated.",
		},
		{
			question: "Is AEO the same as GEO?",
			answer:
				"Effectively yes. AEO (answer engine optimization), GEO (generative engine optimization), LLMO (large language model optimization), and generative SEO all describe the same work: getting mentioned and cited by AI answer engines. The terms emerged in parallel from different corners of the industry and no meaningful distinction has settled between them.",
		},
		{
			question: "Does AEO replace SEO?",
			answer:
				"No. Most answer engines ground their answers in live web search, so a page that cannot be found by a crawler cannot be cited. AEO is better understood as a layer on top of SEO that measures a different outcome, not a replacement for the technical and content work underneath.",
		},
		{
			question: "How do you measure AEO?",
			answer:
				"Four metrics: mention rate (how often your brand appears at all), citation rate (how often the engine links to a page you own), share of voice (your fraction of all brands named across your prompts), and sentiment or accuracy (what the model actually says about you). Each has to be measured across many repeated runs of the same prompt, because engines sample and a single check is noise.",
		},
		{
			question: "Can you do AEO for free?",
			answer:
				"Yes, at small scale. You can run prompts manually and record the answers in a spreadsheet, which is enough to discover whether you are invisible on your category's central question. It stops working once you need repeated runs across several engines, because the volume required to see past sampling noise is more than a person will do by hand. Self-hosting an open-source tool is the free option beyond that point.",
		},
		{
			question: "How long does AEO take to work?",
			answer:
				"Prompts where the engine searches the live web can respond within weeks — getting added to a roundup the model already cites is often the fastest lever. Prompts the model answers from its own training data move over quarters or years and cannot be accelerated by any tactic, because they reflect how widely a brand is discussed across the open web.",
		},
	],
	related: [
		{
			label: "Generative engine optimization",
			href: "/generative-engine-optimization",
			description: "The same discipline under its other common name, and where the two terms diverge.",
		},
		{
			label: "AI visibility tools",
			href: "/ai-visibility-tools",
			description: "Every AEO and AI visibility tracker on the market, compared feature by feature.",
		},
		{
			label: "Open-source AEO tools",
			href: "/ai-visibility-tools/category/open-source",
			description: "The self-hostable options, for teams who want to read how the score is calculated.",
		},
		{
			label: "AEO glossary",
			href: "/glossary",
			description: "Short definitions for every term in this guide.",
		},
		{
			label: "AEO vs SEO",
			href: "/blog/aeo-vs-seo",
			description: "A longer treatment of where the two disciplines actually part ways.",
		},
		{
			label: "AEO by industry",
			href: "/aeo-for",
			description: "What the work looks like for SaaS, ecommerce, agencies, and other verticals.",
		},
	],
};

const GEO: Pillar = {
	slug: "generative-engine-optimization",
	eyebrow: "Guide",
	h1: "Generative Engine Optimization (GEO)",
	metaTitle: "Generative Engine Optimization (GEO): The Complete Guide · Elmo",
	description:
		"What generative engine optimization means, how GEO differs from SEO and AEO, what the research says actually works, and how to measure it — a practical guide from an open-source GEO platform.",
	lead: "Generative engines write the answer instead of listing the links. GEO is the work of being in that answer — and of knowing, with numbers, whether you are.",
	definition:
		"Generative engine optimization (GEO) is the practice of getting your brand mentioned and cited inside AI-generated answers — ChatGPT, Google AI Overviews and AI Mode, Perplexity, Gemini, Copilot. It is the same discipline as answer engine optimization (AEO); the two terms emerged in parallel and are used interchangeably.",
	sections: [
		{
			id: "what-it-is",
			heading: "What generative engine optimization is",
			body: [
				"A generative engine answers a question by writing prose. It reads sources, synthesizes them, and names a few. There is no list to climb and no position ten to settle for — you are quoted or you are absent.",
				"GEO is the practice of being quoted. In day-to-day work that means three things: knowing which questions your buyers actually put to these engines, measuring how often you appear in the answers, and changing what the engines can find so the number moves.",
				"The name is contested and the distinction is not worth your time. GEO, AEO, LLMO, and generative SEO all label the same work. GEO is the term that came out of the academic literature; AEO is the term that came out of the SEO industry. They describe identical practice.",
			],
		},
		{
			id: "geo-meaning-marketing",
			heading: "What GEO means in marketing (and the older meaning)",
			body: [
				"In marketing, GEO now has two unrelated meanings, and searches for the term return both.",
				"The older meaning is geographic: geo-targeting, geo-fencing, geo-modified keywords — anything scoped to a physical location. If you arrived here looking for local search, that is a different discipline entirely.",
				"The newer meaning, and the subject of this guide, is generative engine optimization. It has nothing to do with location. The collision is unfortunate and shows no sign of resolving, which is part of why many practitioners prefer AEO.",
			],
		},
		{
			id: "geo-vs-seo",
			heading: "GEO vs SEO vs AEO",
			body: ["GEO and AEO are the same thing. The real comparison is between generative optimization and classic SEO."],
			steps: [
				{
					name: "SEO",
					text: "Compete for one of ten positions on a results page. Success is a rank; the click is the outcome. Deterministic enough that a daily rank check is meaningful.",
				},
				{
					name: "GEO / AEO",
					text: "Compete to be one of three to six sources named inside a written answer. Success is a mention, a citation, and a favourable description. Non-deterministic, so a single check means nothing and only repeated sampling produces a number you can act on.",
				},
				{
					name: "What carries over",
					text: "Crawlability, page structure, topical authority, and credible external mentions all still matter, because most generative engines ground their answers in a live web search. GEO sits on top of SEO rather than replacing it.",
				},
			],
		},
		{
			id: "where-answers-appear",
			heading: "Where generative answers appear",
			body: [
				"Five surfaces account for nearly all of it, and they behave differently enough that a brand can dominate one and be invisible in another.",
			],
			bullets: [
				"Google AI Overviews — the summary above the classic results, reaching the largest audience by a wide margin.",
				"Google AI Mode — a full conversational surface, with its own retrieval behaviour distinct from AI Overviews.",
				"ChatGPT — both the model's own memory and its live browsing mode, which behave very differently and should be measured separately.",
				"Perplexity — search-first and citation-heavy, which makes it the most legible surface to optimize for.",
				"Gemini, Copilot, Claude and Grok — smaller but growing, and each with its own retrieval quirks.",
			],
			callout: {
				heading: "Measure engines separately, always",
				text: "Aggregated 'AI visibility' scores hide the thing you need to know. A brand can sit at 25% in ChatGPT and 8% in Google AI Mode at the same time. Averaging those produces a number that describes no engine and misleads every decision made from it.",
			},
		},
		{
			id: "what-works",
			heading: "What actually moves the number",
			body: ["The tactics with evidence behind them are unglamorous and mostly not on your own domain."],
			steps: [
				{
					name: "Get onto the sources that already get cited",
					text: "For any given prompt, a small set of third-party pages — roundups, comparison articles, community threads — supplies most of the citations. Being listed accurately on those moves your mention rate faster than anything you can publish yourself.",
				},
				{
					name: "Write extractable passages",
					text: "Models lift passages, not pages. A self-contained answer in the first 40 to 60 words under a heading is quotable; the same point buried in paragraph six is not. This is the highest-leverage change to content you already have.",
				},
				{
					name: "Publish original data",
					text: "Engines cite the source of a statistic more reliably than they cite commentary on it. First-party research is the one asset a competitor cannot replicate by writing a better article.",
				},
				{
					name: "Make your site machine-readable",
					text: "Clean structure, real headings, structured data where it fits, and no critical content that only exists after JavaScript runs. This is table stakes rather than an advantage, but failing it is disqualifying.",
				},
				{
					name: "Fix what the model says, not just whether it speaks",
					text: "Outdated pricing, a discontinued feature, a wrong category — models repeat these confidently. Correcting the underlying sources is often a larger win than a new mention.",
				},
			],
		},
		{
			id: "what-does-not-work",
			heading: "What does not work",
			body: [
				"Two things absorb a disproportionate share of GEO effort and have little evidence behind them.",
				"The first is llms.txt. It is a sensible proposal and costs nothing to publish, but no major engine has committed to consuming it, and there is no measurable citation lift attributable to it. Publish one if you like; do not build a strategy on it.",
				"The second is keyword-stuffing for models. Generative engines are not matching strings. Writing 'best AEO tool' fourteen times does not make you the best AEO tool, and the resulting prose is worse for the humans who do arrive.",
			],
		},
		{
			id: "measuring",
			heading: "How to measure GEO",
			body: [
				"The measurement problem is the discipline. Because engines sample, a number from a single run is indistinguishable from chance, and most disagreements about AI visibility are really disagreements about run counts.",
				"A defensible setup has four properties: a prompt set written the way buyers actually ask; enough repeated runs per prompt that the rate is stable; engines reported separately rather than averaged; and access to the raw answers, so a surprising number can be explained rather than merely observed.",
				"Track mention rate, citation rate, share of voice against named competitors, and the descriptions themselves. If a tool gives you a single composite score and no way to see how it was computed, you cannot debug it when it moves.",
			],
		},
		{
			id: "tools",
			heading: "GEO tools",
			body: [
				"The category is crowded and young. Most tools do the same core job — schedule prompts, run them across engines, log what came back — and differ in engine coverage, sampling depth, and how much of the raw data they let you see.",
				"Two questions cut through the marketing. How many times is each prompt actually run, and can you read the answer behind the score? A tool that samples thinly will report movement that is not there, and a tool that hides the raw output cannot be checked when it does.",
				"Elmo is open source for exactly this reason. Self-host it, read the code that computes the score, and verify the methodology rather than trusting it.",
			],
			callout: {
				heading: "Compare the options",
				text: "Elmo maintains an open directory of every GEO and AI visibility tool in the category, including the self-hostable ones, with an honest account of what each does.",
			},
		},
	],
	faqs: [
		{
			question: "What is generative engine optimization?",
			answer:
				"Generative engine optimization (GEO) is the practice of getting your brand mentioned and cited inside AI-generated answers from engines like ChatGPT, Google AI Overviews, Perplexity, and Gemini. Instead of competing for a position in a list of links, you are competing to be one of the few sources a model names in the answer it writes.",
		},
		{
			question: "What does GEO stand for in marketing?",
			answer:
				"It depends on which conversation you are in. In AI search, GEO stands for generative engine optimization. In older marketing usage it is shorthand for geographic — geo-targeting, geo-fencing, geo-modified keywords. The two are unrelated, and the overlap is a common source of confusion.",
		},
		{
			question: "Is GEO the same as AEO?",
			answer:
				"Yes, in practice. Generative engine optimization and answer engine optimization describe identical work. GEO came out of academic research, AEO out of the SEO industry, and no meaningful distinction has settled between them. LLMO and generative SEO are two further names for the same thing.",
		},
		{
			question: "What is GEO in SEO?",
			answer:
				"GEO is the layer of SEO that deals with AI-generated answers rather than ranked links. The underlying work overlaps heavily — crawlability, structure, authority, credible external mentions — but the outcome measured is a mention and a citation inside an answer, not a position on a results page.",
		},
		{
			question: "Does GEO actually work?",
			answer:
				"The tactics with evidence behind them do: being listed on the third-party pages that engines already cite, writing self-contained passages engines can extract, and publishing original data. The tactics without much evidence — llms.txt files, keyword density aimed at models — absorb a lot of effort for little measurable return.",
		},
		{
			question: "How is GEO measured?",
			answer:
				"By running a set of buyer-realistic prompts across each engine repeatedly and recording four things: how often your brand is mentioned, how often a page you own is cited, your share of voice against competitors named in the same answers, and what the model says about you. Engines must be reported separately, because visibility in ChatGPT and Google AI Mode routinely differ by a factor of three.",
		},
		{
			question: "Do llms.txt files help with GEO?",
			answer:
				"There is no measurable evidence that they do. No major answer engine has committed to consuming llms.txt, and no citation lift has been convincingly attributed to publishing one. It costs almost nothing to add, so there is little harm in it, but it should not be mistaken for a strategy.",
		},
	],
	related: [
		{
			label: "Answer engine optimization",
			href: "/answer-engine-optimization",
			description: "The same discipline under its other common name, with the full playbook.",
		},
		{
			label: "GEO and AI visibility tools",
			href: "/ai-visibility-tools",
			description: "Every tool in the category, compared feature by feature.",
		},
		{
			label: "Open-source GEO tools",
			href: "/ai-visibility-tools/category/open-source",
			description: "The self-hostable options, for teams who want to audit the methodology.",
		},
		{
			label: "AEO glossary",
			href: "/glossary",
			description: "Short definitions for every term in this guide.",
		},
		{
			label: "Where AI citations come from",
			href: "/blog/where-ai-citations-come-from",
			description: "Citation data on which sources engines actually pull from.",
		},
		{
			label: "AI search engines",
			href: "/ai-search",
			description: "How each engine retrieves, cites, and differs from the others.",
		},
	],
};

export const pillars: Pillar[] = [AEO, GEO];

export function getPillar(slug: string): Pillar | undefined {
	return pillars.find((p) => p.slug === slug);
}
