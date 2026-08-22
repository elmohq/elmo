export interface AeoVertical {
	slug: string;
	/** Display noun used after "AEO for", e.g. "agencies". */
	audience: string;
	short: string;
	intro: string[];
	/** Illustrative prompts buyers in this vertical ask AI engines. */
	examplePrompts: string[];
	plays: { name: string; text: string }[];
	elmoFit: string;
	faqs: { question: string; answer: string }[];
}

export const aeoVerticals: AeoVertical[] = [
	{
		slug: "agencies",
		audience: "agencies",
		short:
			"Track AI visibility for every client and report it under your own brand, on an open-source platform you can run at agency scale.",
		intro: [
			"Agencies tend to feel the shift to AI search first, because clients start asking why a competitor shows up in ChatGPT and they do not. AEO turns into a service line: measure each client's presence across the answer engines, find the gaps, and show the work.",
			"The hard part is doing that across many clients without paying per seat for each one. An open-source, self-hostable tool changes the math, especially one with white-label support, so the dashboards carry your brand instead of a vendor's.",
		],
		examplePrompts: ["best [client category] companies", "[client] vs [competitor]", "is [client] worth it"],
		plays: [
			{
				name: "Run a prompt set per client",
				text: "Build a focused list of the questions each client's buyers actually ask, and track it on a schedule so changes stand out.",
			},
			{
				name: "Benchmark against named competitors",
				text: "Share of voice against specific rivals is the metric clients understand. Show who gets cited instead of them, and on which prompts.",
			},
			{
				name: "Turn gaps into a retainer",
				text: "Every prompt where a client is missing is a concrete content brief. That is the bridge from reporting to billable work.",
			},
			{
				name: "White-label the dashboards",
				text: "Put the reporting under your own brand and domain so the visibility data looks like part of your service, not a third-party tool.",
			},
		],
		elmoFit:
			"Elmo is open source with white-label support, so you can run one instance for an entire book of clients, brand the dashboards as your own, and skip the per-seat pricing that does not scale across an agency.",
		faqs: [
			{
				question: "Can agencies white-label AI visibility reports?",
				answer:
					"Yes. Elmo offers white-label deployments, so agencies can run multi-client dashboards under their own brand and domain. You self-host the platform and present the data as part of your own service.",
			},
			{
				question: "How do agencies price AEO services?",
				answer:
					"Most agencies bill AEO as a monitoring retainer plus content work, since each prompt where a client is missing becomes a brief. Running an open-source tool keeps your tooling cost flat as you add clients.",
			},
		],
	},
	{
		slug: "saas",
		audience: "SaaS companies",
		short: "Win the 'best [category] software' and 'X vs Y' answers where buyers now build their shortlists.",
		intro: [
			"SaaS buyers increasingly ask an AI engine to shortlist tools before they ever reach a vendor site. Best project management software, Notion vs Asana, alternatives to a given tool. If the model does not name you, you are out of the consideration set before the demo.",
			"These comparison and alternatives prompts are high intent and winnable. The same content that ranks a comparison page can earn the citation in an AI answer, as long as it is clear, current, and backed by sources the model trusts.",
		],
		examplePrompts: [
			"best [category] software",
			"[your tool] vs [competitor]",
			"alternatives to [competitor]",
			"is [your tool] good for [use case]",
		],
		plays: [
			{
				name: "Track comparison and alternatives prompts",
				text: "These are where buyers shortlist. Monitor them across engines and watch which competitors get named alongside or instead of you.",
			},
			{
				name: "Publish honest comparison pages",
				text: "Well-structured, fair comparison and alternatives content gives engines a clean source to cite when buyers ask how you stack up.",
			},
			{
				name: "Earn third-party reviews",
				text: "Reviews and mentions on sites the models trust shape how confidently they recommend you.",
			},
			{
				name: "Catch wrong feature and pricing claims",
				text: "Models go stale. Monitor for outdated descriptions of your features or pricing and correct the underlying sources.",
			},
		],
		elmoFit:
			"Elmo tracks exactly these prompts across every major engine, shows which competitors get named with or instead of you, and flags when a model gets your features or pricing wrong.",
		faqs: [
			{
				question: "How do I show up when buyers ask AI for software recommendations?",
				answer:
					"Publish clear, current content for the comparison and alternatives queries in your category, earn reviews on trusted sources, and track those prompts so you can see where you appear and where a competitor does instead.",
			},
			{
				question: "Can I see which competitors AI tools recommend?",
				answer:
					"Yes. Elmo records which competitors get mentioned and cited alongside you on each prompt, so you can measure share of voice against your named rivals.",
			},
		],
	},
	{
		slug: "ecommerce",
		audience: "e-commerce brands",
		short: "Make sure AI shopping answers and buying-guide queries surface your products, not just your competitors'.",
		intro: [
			"Shoppers ask AI engines to compare products and recommend the best option, and some engines now have dedicated shopping features. Best running shoes for flat feet, cheapest option under a hundred dollars. The answer usually names a few brands and skips the rest.",
			"Product and category content, clean structured data, and reviews on trusted sources are what get your catalog into those answers. The work overlaps with SEO, but the target is the recommendation rather than the ranking.",
		],
		examplePrompts: ["best [product] for [need]", "[product] under [price]", "[your brand] vs [competitor] [product]"],
		plays: [
			{
				name: "Track buying-guide prompts",
				text: "Monitor the comparison and recommendation queries for your top categories, and see which competitors the engines name.",
			},
			{
				name: "Add product and review schema",
				text: "Structured data for products and reviews helps engines extract and trust your catalog details.",
			},
			{
				name: "Earn reviews engines cite",
				text: "Recommendations lean on third-party reviews. Presence on the sites engines pull from improves your odds of being named.",
			},
			{
				name: "Keep price and availability accurate",
				text: "Stale prices and stock invite wrong answers. Keep product data current so engines describe you correctly.",
			},
		],
		elmoFit:
			"Elmo tracks how AI answers describe and recommend your products against competitors, so you can see which categories you win and which you are missing.",
		faqs: [
			{
				question: "Do AI engines recommend products?",
				answer:
					"Yes. Engines answer buying-guide and comparison questions with a shortlist of products, and some now have dedicated shopping features. Brands not named in those answers lose the recommendation.",
			},
			{
				question: "How do I get my products into AI shopping answers?",
				answer:
					"Publish clear product and category content, add product and review structured data, earn reviews on trusted sites, and keep price and availability accurate. Then track the prompts to measure progress.",
			},
		],
	},
	{
		slug: "b2b",
		audience: "B2B companies",
		short: "Show up when buyers research categories, vendors, and you, across long and considered purchases.",
		intro: [
			"B2B purchases involve a lot of research, and much of it now starts with an AI engine. Buyers ask what a category is, who the serious vendors are, and whether you are credible, long before they fill out a form.",
			"Because the cycle is long and the deals are large, a single AI answer that omits or misframes you carries outsized cost. The fix is durable authority: clear content, trusted mentions, and accurate descriptions across the engines your buyers use.",
		],
		examplePrompts: [
			"what is [category] software",
			"top [category] vendors for enterprise",
			"is [your brand] enterprise-ready",
		],
		plays: [
			{
				name: "Track category, competitor, and branded prompts",
				text: "Cover the full research journey, from what a category is to whether you specifically are credible.",
			},
			{
				name: "Build authority content",
				text: "Thorough, well-structured content on your topic gives engines a confident source to cite for considered purchases.",
			},
			{
				name: "Earn analyst and press mentions",
				text: "Corroboration on respected sources weighs heavily in how engines describe enterprise vendors.",
			},
			{
				name: "Correct inaccuracies quickly",
				text: "An out-of-date claim about your product can sit in answers for months. Monitor and fix the sources behind it.",
			},
		],
		elmoFit:
			"Elmo measures your presence across category, competitor, and branded prompts, so you can see where you enter the buyer's research and where you are absent.",
		faqs: [
			{
				question: "Why does AEO matter for B2B?",
				answer:
					"B2B buyers research with AI engines before they talk to sales. If the model does not name you, or describes you inaccurately, you can lose a deal before it starts. AEO is how you measure and fix that.",
			},
			{
				question: "How is AI visibility different from SEO for B2B?",
				answer:
					"SEO targets a ranking on a results page. AI visibility targets being named and cited inside a written answer. The fundamentals overlap, but the unit of success is the citation, not the position.",
			},
		],
	},
	{
		slug: "startups",
		audience: "startups",
		short: "Build AI visibility from zero without enterprise pricing, on a tool you can self-host for free.",
		intro: [
			"A new brand starts out invisible to AI engines, because there is little for the models to have learned. The job is to build a credible footprint quickly: clear content, early reviews, and mentions on sources the models trust.",
			"Budgets are tight, which is the catch with most tools in this space. An open-source platform you self-host for free lets you start measuring on day one and only pay for the API calls you actually make.",
		],
		examplePrompts: ["best [new category] tools", "alternatives to [incumbent]", "what is [your brand]"],
		plays: [
			{
				name: "Define a tight prompt set",
				text: "A handful of high-intent prompts beats a broad, expensive list. Track the questions your earliest buyers ask.",
			},
			{
				name: "Tell a clear category story",
				text: "Help engines place you by explaining your category and product plainly, with consistent naming.",
			},
			{
				name: "Earn your first reviews",
				text: "Early mentions on trusted sources give the models something to ground an answer about you in.",
			},
			{
				name: "Track weekly",
				text: "Visibility moves as you publish and get covered. A weekly read shows whether it is working.",
			},
		],
		elmoFit:
			"Elmo is free to self-host, so an early-stage team can track AI visibility without an enterprise contract and only pay for the provider API keys it uses.",
		faqs: [
			{
				question: "Is there a free AI visibility tool for startups?",
				answer:
					"Yes. Elmo is free and open source to self-host. There is no license fee or per-seat pricing, so you only pay for your own infrastructure and the AI provider keys you use.",
			},
			{
				question: "When should a startup start doing AEO?",
				answer:
					"As soon as buyers in your category ask AI engines for recommendations, which is early for most categories now. Starting sooner builds the trusted footprint that later answers draw on.",
			},
		],
	},
	{
		slug: "enterprise",
		audience: "enterprises",
		short: "Track AI visibility at scale while keeping your prompts and history on your own infrastructure.",
		intro: [
			"Large brands have the most to lose when an AI engine describes them wrongly, and the most scrutiny over where their data goes. Many AI visibility tools are closed and hosted, which means handing your prompt strategy and history to a third party.",
			"Self-hosting changes that. An open-source platform runs on your own infrastructure, keeps your data in house, and lets your team verify exactly how each metric is computed, which matters when the number ends up in a board report.",
		],
		examplePrompts: ["is [brand] trustworthy", "[brand] vs [competitor]", "best [category] for enterprise"],
		plays: [
			{
				name: "Self-host for data control",
				text: "Run the platform on your own infrastructure so prompts and visibility history never leave your environment.",
			},
			{
				name: "Standardize a prompt set",
				text: "Use a consistent set of prompts across product lines and regions so results are comparable across the org.",
			},
			{
				name: "Benchmark named competitors",
				text: "Track share of voice against the specific rivals leadership cares about, on the prompts that matter.",
			},
			{
				name: "Audit the methodology",
				text: "Open code means your team can verify how every metric is built, rather than trusting a black-box score.",
			},
		],
		elmoFit:
			"Elmo is open source and self-hosted, so enterprise teams keep full ownership of their data, avoid vendor lock-in, and can audit the methodology behind every metric.",
		faqs: [
			{
				question: "Can we self-host AI visibility tracking?",
				answer:
					"Yes. Elmo is built to be self-hosted. You deploy it on your own infrastructure, keep prompts and history in house, and read the code to verify exactly how each metric is calculated.",
			},
			{
				question: "How does Elmo handle data ownership?",
				answer:
					"You own everything. Because Elmo is open source and runs on your infrastructure, your data stays with you, you can export it at any time, and there is no vendor lock-in.",
			},
		],
	},
	{
		slug: "healthcare",
		audience: "healthcare brands",
		short: "Monitor and correct how AI engines describe your healthcare brand, where accuracy is not optional.",
		intro: [
			"Health topics are exactly where AI engines are most cautious, and where errors do the most damage. An inaccurate description of a provider, product, or service is a real risk, not a cosmetic one.",
			"Accuracy and data control both matter here. Authoritative, well-sourced content shapes what the models say, and self-hosting keeps sensitive prompt data on your own infrastructure rather than a vendor's.",
		],
		examplePrompts: ["is [treatment] safe", "best [specialty] near me", "what does [brand] treat"],
		plays: [
			{
				name: "Publish authoritative content",
				text: "Well-sourced, expert-backed content is what cautious engines cite on health topics. Make yours the clear reference.",
			},
			{
				name: "Monitor for unsafe or wrong claims",
				text: "Track how engines describe your brand and treatments so an inaccurate or unsafe statement does not go unnoticed.",
			},
			{
				name: "Earn trusted health citations",
				text: "References from respected health sources carry extra weight in how engines ground their answers.",
			},
			{
				name: "Self-host sensitive data",
				text: "Keep prompts and history on your own infrastructure rather than a third-party dashboard.",
			},
		],
		elmoFit:
			"Elmo lets healthcare teams track how engines describe their brand and catch inaccuracies, while self-hosting keeps sensitive data in house and the methodology fully auditable.",
		faqs: [
			{
				question: "Why does AEO matter in healthcare?",
				answer:
					"Patients ask AI engines about conditions, treatments, and providers. An inaccurate answer about your brand carries real risk, so monitoring and correcting how engines describe you matters more here than almost anywhere.",
			},
			{
				question: "How do I catch AI errors about my health brand?",
				answer:
					"Track a consistent set of prompts about your brand and services across engines, and watch for inaccurate or stale claims. Elmo records how each engine describes you so errors surface quickly.",
			},
		],
	},
	{
		slug: "financial-services",
		audience: "financial services",
		short: "Track how AI engines describe your financial brand, with the accuracy and data control the sector demands.",
		intro: [
			"Finance is another area where engines tread carefully, and where a wrong answer about rates, products, or eligibility carries compliance weight. Buyers ask AI engines for recommendations and comparisons all the same.",
			"Authoritative content earns the citation, and self-hosting keeps your prompt data and visibility history on infrastructure you control, which fits a regulated environment better than a closed third-party dashboard.",
		],
		examplePrompts: ["best [product] for [need]", "is [brand] legit", "[brand] vs [competitor] fees"],
		plays: [
			{
				name: "Publish clear, accurate product content",
				text: "Precise content on your products and terms gives engines a reliable, compliant source to quote.",
			},
			{
				name: "Monitor for inaccurate claims",
				text: "Track how engines state your rates, fees, and eligibility so a wrong claim does not sit in answers unnoticed.",
			},
			{
				name: "Earn trusted citations",
				text: "References from respected financial sources weigh heavily in what engines repeat about you.",
			},
			{
				name: "Self-host for control",
				text: "Keep prompts and visibility history on your own infrastructure to fit your data and compliance requirements.",
			},
		],
		elmoFit:
			"Elmo tracks your AI visibility across engines and flags inaccurate descriptions, while open-source self-hosting keeps data in house and every metric auditable for compliance.",
		faqs: [
			{
				question: "Why does AEO matter for financial services?",
				answer:
					"Consumers ask AI engines to compare financial products and judge whether a brand is trustworthy. An inaccurate or absent answer affects both acquisition and compliance, so tracking it is essential.",
			},
			{
				question: "Can I keep AI visibility data on our own infrastructure?",
				answer:
					"Yes. Elmo is open source and self-hosted, so your prompts and visibility history stay on infrastructure you control, which suits regulated financial environments.",
			},
		],
	},
	{
		slug: "law-firms",
		audience: "law firms",
		short:
			"Win the 'best [practice area] lawyer near me' answers, where the AI response now stands between a potential client and a consultation.",
		intro: [
			"Legal intent has always been urgent and local. Someone injured last week does not browse ten firm websites; they ask one question and act on the answer. That question now goes to ChatGPT or an AI Overview as often as to a search box, and the response names two or three firms.",
			"Legal queries also sit squarely in what Google calls Your Money or Your Life territory, which means engines weight credentials, jurisdiction, and verifiable authorship harder here than almost anywhere else. That cuts both ways: the bar is higher, but a firm that publishes attributed, jurisdiction-specific answers is far more citable than a competitor running generic practice-area boilerplate.",
		],
		examplePrompts: [
			"best [practice area] lawyer in [city]",
			"do I have a case for [situation]",
			"how much does a [practice area] attorney cost",
			"[firm name] reviews",
		],
		plays: [
			{
				name: "Track by practice area and jurisdiction, not by firm name",
				text: "Nobody asks an engine about your firm before they know they need one. Build the prompt set around the situations clients describe — the injury, the dispute, the filing deadline — in each city you actually practise in.",
			},
			{
				name: "Publish jurisdiction-specific answers, not national boilerplate",
				text: "Statutes of limitation, filing rules, and damage caps differ by state. A page that answers the question for your jurisdiction gives an engine something specific to cite; a national overview gives it nothing it cannot already generate.",
			},
			{
				name: "Attach real attorney credentials to every page",
				text: "Bar admissions, practice years, and case types on the page and in Person schema are the evidence engines lean on for legal answers. An unsigned article is the easiest thing in the world for a model to skip.",
			},
			{
				name: "Watch how engines describe your firm, not just whether they name you",
				text: "A citation that describes your practice areas wrongly, or attributes another firm's outcome to you, is worse than being absent. Sentiment and description accuracy matter more in legal than in most categories.",
			},
		],
		elmoFit:
			"Elmo tracks practice-area and city-level prompts across every engine and flags when an answer describes your firm inaccurately. Because it is open source and self-hostable, client-adjacent research data never has to leave infrastructure your firm controls.",
		faqs: [
			{
				question: "Is AEO different for law firms than for other businesses?",
				answer:
					"Yes, in two ways. Legal queries are treated as Your Money or Your Life content, so engines weight author credentials and jurisdiction heavily, and the answers are hyper-local — the same question has a different correct answer in Texas than in New York. Effective legal AEO is practice-area and jurisdiction specific.",
			},
			{
				question: "Do AI answer engines recommend specific law firms?",
				answer:
					"Increasingly, yes. Asked for the best firm for a given matter in a given city, engines will name firms and cite the sources behind them — usually directories, review platforms, and firm pages that answer the question directly. Which firms get named is measurable and it changes over time.",
			},
			{
				question: "What should a law firm publish to get cited by AI engines?",
				answer:
					"Direct answers to the questions clients actually ask, written for a specific jurisdiction, signed by a named attorney with visible bar credentials. Process explanations, cost ranges, and deadline rules get cited far more often than practice-area landing pages.",
			},
		],
	},
	{
		slug: "local-business",
		audience: "local businesses",
		short:
			"Show up when someone asks an AI assistant for the best option near them, across every location you operate.",
		intro: [
			"Near-me search was the last big shift in local discovery, and it is happening again. Rather than scanning a map pack, people ask an assistant for a recommendation and get a short list with reasons attached. The engine assembles that list from your business profile, your reviews, and whatever local publications say about you.",
			"For multi-location operators the problem compounds: visibility is not one number but one per city, and the answer in Austin can look nothing like the answer in Denver. A single national ranking hides exactly the variance you need to act on.",
		],
		examplePrompts: [
			"best [service] near me",
			"who should I call for [problem] in [city]",
			"is [business name] any good",
			"[service] open now in [neighborhood]",
		],
		plays: [
			{
				name: "Run the prompt set per location",
				text: "AI answers to local questions are location-conditioned. Track each city or metro separately, because one strong market can mask several where you are invisible.",
			},
			{
				name: "Keep the business profile factually clean",
				text: "Hours, service areas, and categories propagate into AI answers through the same feeds that power maps. Contradictions between your site and your profile give an engine a reason to prefer a competitor it can state confidently.",
			},
			{
				name: "Earn mentions in local publications",
				text: "City guides, neighbourhood blogs, and regional press are disproportionately cited in local AI answers because they read as independent. One good local roundup often outperforms a dozen generic directory listings.",
			},
			{
				name: "Answer the operational questions on the site",
				text: "Pricing ranges, response times, service radius, and what happens on a first visit are exactly what people ask assistants. Publishing them plainly gives the engine something concrete to quote.",
			},
		],
		elmoFit:
			"Elmo runs the same prompt set across every location you operate and reports visibility per market, so a strong city never hides a weak one. Self-hosting means adding your fiftieth location costs infrastructure, not another per-seat licence.",
		faqs: [
			{
				question: "Do AI assistants give local recommendations?",
				answer:
					"Yes. ChatGPT, Gemini, and Perplexity all answer near-me style questions with named businesses and reasons, drawing on business profiles, review platforms, and local publications. The named set differs by engine and by city.",
			},
			{
				question: "How do multi-location businesses track AI visibility?",
				answer:
					"By treating each market as its own measurement. The same prompt returns different businesses in different cities, so visibility has to be tracked per location and compared across the portfolio rather than averaged into one score.",
			},
		],
	},
	{
		slug: "real-estate",
		audience: "real estate companies",
		short:
			"Be the brokerage an AI assistant names when someone asks how to buy, sell, or find an agent in your market.",
		intro: [
			"Buyers and sellers now open a research phase with an assistant rather than a portal. What is the market doing in this neighbourhood, what does a listing agent actually charge, how long do homes sit — these are the questions that precede any contact with an agent, and they are answered before you enter the picture.",
			"Real estate is unusual in that the big portals dominate transactional search but have little to say about local specifics. That gap is where a brokerage with genuine market knowledge can get cited: neighbourhood-level analysis, real timelines, and honest fee explanations are exactly what a general-purpose portal page cannot provide.",
		],
		examplePrompts: [
			"best real estate agent in [city]",
			"is now a good time to buy in [neighborhood]",
			"how much do realtors charge in [state]",
			"what are homes selling for in [area]",
		],
		plays: [
			{
				name: "Own the neighbourhood question",
				text: "Portals cover cities; almost nobody covers neighbourhoods well. Publish current, specific analysis at that level and you become the citable source for questions the portals answer vaguely.",
			},
			{
				name: "Answer the commission question directly",
				text: "Fee structure is one of the most-asked and least-answered questions in the category. A clear, current explanation of what you charge and what it covers gets cited precisely because so few brokerages state it plainly.",
			},
			{
				name: "Date and refresh your market data",
				text: "Engines discount stale market claims heavily, and real estate data ages in weeks. Visible publication dates and a real refresh cadence are what keep a page in the answer set.",
			},
			{
				name: "Track agent-level and brokerage-level prompts separately",
				text: "'Best agent in [city]' and 'best brokerage in [city]' produce different answers from different sources. Both matter, and improving one does not move the other.",
			},
		],
		elmoFit:
			"Elmo tracks neighbourhood, city, and agent-level prompts side by side so you can see which markets you own and which are still owned by the portals, with the full history kept on infrastructure you control.",
		faqs: [
			{
				question: "Can real estate brokerages outrank portals in AI answers?",
				answer:
					"On broad transactional queries, rarely. On neighbourhood-level and process questions, routinely — portals publish at city scale and engines prefer the source that answers the specific question, which is where local brokerages have a genuine advantage.",
			},
			{
				question: "How often does real estate AI visibility change?",
				answer:
					"Faster than most categories, because the underlying market data changes monthly and engines strongly prefer recent sources. Firms that refresh market analysis on a schedule tend to hold citations that one-off pages lose within a quarter.",
			},
		],
	},
	{
		slug: "education",
		audience: "education institutions",
		short:
			"Reach prospective students at the point where they now start: asking an AI assistant which programme is worth it.",
		intro: [
			"Programme research has moved. Before a prospective student reaches an admissions page they have already asked an assistant which programmes are respected, what they cost, and whether the credential is worth the time. The shortlist is formed in that conversation.",
			"Education also carries an unusual trust burden. Engines are cautious about outcome claims, so they favour sources that publish verifiable specifics — accreditation, real completion figures, actual cost of attendance — over marketing language. Institutions that publish that data plainly are far more citable than those that do not.",
		],
		examplePrompts: [
			"best [subject] programs",
			"is a [credential] worth it",
			"[institution] vs [institution]",
			"what can you do with a degree in [subject]",
		],
		plays: [
			{
				name: "Track programme-level prompts, not institutional ones",
				text: "Students ask about programmes and outcomes, not about the institution in the abstract. Build the prompt set around subjects, credentials, and career outcomes.",
			},
			{
				name: "Publish outcomes as data, not adjectives",
				text: "Completion rates, employment outcomes, and total cost of attendance are what engines quote. 'World-class faculty' is unquotable and gets skipped.",
			},
			{
				name: "Make accreditation explicit and machine-readable",
				text: "Accreditation is the trust signal that decides whether an engine will recommend a programme at all. State it on the programme page and mark it up, rather than burying it in a policy PDF.",
			},
			{
				name: "Answer the sceptical question honestly",
				text: "'Is this degree worth it' is asked constantly. An institution that addresses it with real numbers, including the cases where the answer is nuanced, earns citations that promotional copy never will.",
			},
		],
		elmoFit:
			"Elmo tracks how engines describe each programme, not just whether the institution is named, and flags when an answer misstates cost, length, or accreditation. Self-hosting keeps recruitment research inside institutional infrastructure.",
		faqs: [
			{
				question: "Do students use AI to choose programmes?",
				answer:
					"Widely, for the research and shortlisting phase. Assistants are asked to compare programmes, explain credential value, and estimate cost and duration — the questions that determine which institutions get a closer look.",
			},
			{
				question: "What content gets an education institution cited by AI engines?",
				answer:
					"Specific, verifiable facts: accreditation status, cost of attendance, programme length, completion and outcome data, and honest answers to whether a credential fits a given career path. Promotional language is consistently passed over.",
			},
		],
	},
	{
		slug: "travel-hospitality",
		audience: "travel and hospitality brands",
		short:
			"Get named in the itineraries and recommendations AI assistants now build for travellers before they ever reach a booking site.",
		intro: [
			"Trip planning is the single most obvious AI use case, and travellers adopted it immediately. Assistants build itineraries, recommend neighbourhoods, and name specific hotels and restaurants. That recommendation happens upstream of every booking channel you currently measure.",
			"The competitive picture is unusual too: the sources engines cite for travel skew heavily toward independent guides, editorial reviews, and forums rather than brand sites. Hotel and destination brands that only publish their own marketing are largely absent from the material engines actually draw on.",
		],
		examplePrompts: [
			"best hotels in [city] for [traveller type]",
			"[destination] itinerary for [duration]",
			"where to stay in [city]",
			"is [property] worth the price",
		],
		plays: [
			{
				name: "Track itinerary prompts, not just brand prompts",
				text: "The recommendation that matters is 'where should I stay in [city]', not 'tell me about [hotel]'. Build the prompt set around the planning questions travellers actually ask.",
			},
			{
				name: "Compete on traveller segment, not on adjectives",
				text: "Engines answer segmented questions — for families, for solo travellers, for a first visit. Content organised around who the trip is for is far more citable than a generic property description.",
			},
			{
				name: "Get into the independent guides",
				text: "Editorial guides and destination publications are cited disproportionately in travel answers. Earning a place in them moves visibility more than any amount of on-site copy.",
			},
			{
				name: "Keep the practical details current",
				text: "Seasonality, transit times, what is walkable, what is closed in winter. Practical specifics are what assistants quote when building an itinerary, and they are what most brand sites omit.",
			},
		],
		elmoFit:
			"Elmo tracks destination and segment-level prompts across engines so you can see which itineraries name you and which name a competitor, and which independent sources are driving those citations.",
		faqs: [
			{
				question: "How do AI assistants pick hotels and destinations to recommend?",
				answer:
					"Mostly from independent sources — editorial guides, review platforms, and forums — rather than from brand marketing. Properties that appear in credible third-party coverage get named far more often than those relying on their own site alone.",
			},
			{
				question: "Does AI trip planning affect direct bookings?",
				answer:
					"It shifts where the decision is made. If the assistant names your property while building the itinerary, the traveller arrives at a booking channel already decided. If it names a competitor, the comparison never happens.",
			},
		],
	},
	{
		slug: "manufacturing",
		audience: "manufacturers",
		short: "Be the supplier an AI assistant names when an engineer or buyer asks who makes the part they need.",
		intro: [
			"Industrial buying starts with a specification, not a brand. An engineer describes a requirement — material, tolerance, certification, volume — and asks who can supply it. That question increasingly goes to an assistant, and the answer is a short list of manufacturers assembled from spec sheets and technical documentation.",
			"This favours manufacturers who publish real technical detail. Distributors and marketplaces dominate the transactional queries, but they cannot answer a specification question the way a manufacturer's own documentation can. Published, crawlable specs are the asset here, and most manufacturers keep theirs behind a gated PDF.",
		],
		examplePrompts: [
			"who manufactures [component] with [specification]",
			"[material] supplier for [application]",
			"alternatives to [competitor part number]",
			"what certification is needed for [application]",
		],
		plays: [
			{
				name: "Publish specifications as HTML, not gated PDFs",
				text: "A spec sheet locked behind a form or trapped in a scanned PDF is invisible to the crawlers that feed AI answers. The same data as structured on-page content is directly quotable.",
			},
			{
				name: "Answer the specification question, not the brand question",
				text: "Buyers ask who makes a part with given properties. Pages organised by application and specification get cited; pages organised by product family do not.",
			},
			{
				name: "Make certifications and compliance explicit",
				text: "ISO, RoHS, REACH, industry-specific approvals. These are frequently the filter that decides whether a supplier is named at all, and they belong on the product page in plain text.",
			},
			{
				name: "Cover cross-reference and substitution queries",
				text: "'Alternatives to [competitor part]' is high-intent and poorly served. A clear cross-reference table is one of the most citable assets a manufacturer can publish.",
			},
		],
		elmoFit:
			"Elmo tracks specification and application-level prompts so you can see whether engines name you for the parts you actually make, and which competitors and distributors are being named instead.",
		faqs: [
			{
				question: "Do B2B industrial buyers use AI search?",
				answer:
					"Engineers and procurement teams use it heavily for supplier discovery and specification research — the early stages where a shortlist forms. The purchase still runs through established channels, but which suppliers reach the shortlist is increasingly decided by an assistant.",
			},
			{
				question: "Why do gated PDFs hurt manufacturing AEO?",
				answer:
					"Because the crawlers behind AI answers cannot get past the form, and often cannot parse scanned documents at all. The technical detail that would make a manufacturer the obvious answer is the exact content most commonly locked away.",
			},
		],
	},
	{
		slug: "insurance",
		audience: "insurance companies",
		short: "Be named accurately when someone asks an AI assistant which policy to buy and what it actually covers.",
		intro: [
			"Insurance shopping is a research problem before it is a purchase, and the research has moved to assistants. What does this policy cover, what is a reasonable premium, which carrier handles claims well. The answers shape the shortlist before any quote form is filled in.",
			"The stakes on accuracy are unusually high. An engine that misstates your coverage terms creates a mismatch between what a customer expects and what the policy says, and that surfaces later as a complaint or a lapsed policy. Monitoring how engines describe your products matters at least as much as whether they mention them.",
		],
		examplePrompts: [
			"best [type] insurance for [situation]",
			"does [insurance type] cover [scenario]",
			"[carrier] vs [carrier]",
			"how much is [type] insurance per month",
		],
		plays: [
			{
				name: "Track coverage questions, not just carrier comparisons",
				text: "'Does X cover Y' is the highest-volume question shape in insurance and the one most likely to be answered wrongly. It is also where clear published answers win citations easily.",
			},
			{
				name: "Publish plain-language coverage explanations",
				text: "Policy documents are precise and unquotable. A plain-language explanation that is still accurate gives engines something to cite without inventing a paraphrase of its own.",
			},
			{
				name: "Monitor accuracy, not only presence",
				text: "A wrong description of your coverage is a compliance and service problem, not just a marketing one. Track how engines characterise your products and correct the sources behind bad answers.",
			},
			{
				name: "Address the price question with real ranges",
				text: "Cost is the most-asked and most-evaded question in the category. Honest ranges with the factors that move them get cited over pages that route straight to a quote form.",
			},
		],
		elmoFit:
			"Elmo tracks coverage, comparison, and pricing prompts across engines and flags when an answer describes your policies inaccurately. Self-hosting keeps the whole record on infrastructure your compliance team controls and can audit.",
		faqs: [
			{
				question: "Why does answer accuracy matter more in insurance?",
				answer:
					"Because a misdescribed policy sets a false expectation that surfaces at claim time. Insurance is also regulated content, so an inaccurate third-party description of coverage is a risk issue rather than only a marketing one.",
			},
			{
				question: "Can insurers influence how AI engines describe their policies?",
				answer:
					"Indirectly but reliably. Engines paraphrase the clearest available source, so publishing accurate plain-language coverage explanations and correcting inaccurate third-party pages changes what the model has to work with.",
			},
		],
	},
	{
		slug: "automotive",
		audience: "automotive brands",
		short:
			"Get named in the comparisons AI assistants build when someone is deciding which vehicle or service to choose.",
		intro: [
			"Vehicle research is long, comparison-heavy, and now heavily assisted. Buyers ask which model suits their situation, how two trims differ, what ownership actually costs. Those conversations produce a two or three vehicle shortlist well before a dealership visit.",
			"Automotive content is also unusually well covered by independent reviewers, which means engines have plenty of non-brand sources to draw on. A manufacturer or dealer group that only publishes spec pages is competing against a deep body of editorial review content and generally losing.",
		],
		examplePrompts: [
			"best [vehicle type] for [use case]",
			"[model] vs [model]",
			"is [model] reliable",
			"how much does it cost to own a [model]",
		],
		plays: [
			{
				name: "Track use-case prompts, not model-name prompts",
				text: "Buyers ask for the best vehicle for a commute, a family, or towing. Those questions decide the shortlist; model-name queries happen after the decision is largely made.",
			},
			{
				name: "Publish total cost of ownership honestly",
				text: "Fuel, insurance, maintenance, and depreciation over five years is what buyers ask about and what brand sites almost never state. It is one of the most citable things an automotive brand can publish.",
			},
			{
				name: "Address reliability directly",
				text: "Reliability questions get answered from forums and third-party data whether you participate or not. Publishing real service intervals, common issues, and warranty terms gives engines a first-party source to weigh.",
			},
			{
				name: "Separate brand, model, and dealer visibility",
				text: "These behave differently. A strong model can sit inside a brand that engines describe poorly, and dealer-level answers are local and driven by entirely different sources.",
			},
		],
		elmoFit:
			"Elmo tracks model, brand, and dealer-level prompts separately so you can see where the shortlist is actually being formed, and which independent reviewers are driving the citations behind it.",
		faqs: [
			{
				question: "Do car buyers use AI assistants for research?",
				answer:
					"Heavily, in the comparison phase. Assistants are asked to narrow options by use case, compare trims, and estimate ownership cost — the work that produces the shortlist a buyer eventually acts on.",
			},
			{
				question: "Why do independent reviewers matter so much for automotive AEO?",
				answer:
					"Because engines prefer sources that read as impartial, and automotive has an unusually deep body of independent review content. Manufacturer spec pages compete against that rather than replacing it.",
			},
		],
	},
	{
		slug: "nonprofits",
		audience: "nonprofits",
		short:
			"Be the organisation an AI assistant names when someone asks where to donate or who is doing the work in your cause area.",
		intro: [
			"Donors research before they give, and that research now runs through assistants. Which organisations work on this cause, which use donations efficiently, which are legitimate. The answer names a handful of organisations, and for most donors that list is the consideration set.",
			"Nonprofits have a structural advantage here that many do not use: engines weight transparency and third-party verification heavily, and nonprofits already produce audited financials, impact reports, and charity-evaluator ratings. Published as crawlable content rather than PDF downloads, that material is exactly what an engine wants to cite.",
		],
		examplePrompts: [
			"best charities for [cause]",
			"is [organization] legitimate",
			"where should I donate for [issue]",
			"how much of my donation goes to [cause]",
		],
		plays: [
			{
				name: "Track cause-area prompts, not organisation names",
				text: "Donors ask about causes first. 'Best charities for clean water' decides the shortlist; your organisation name is searched only after it is on the list.",
			},
			{
				name: "Publish financials and impact data as HTML",
				text: "Annual reports as PDF downloads are close to invisible to AI crawlers. The same programme ratios and outcome figures as on-page content are directly quotable and answer the question donors actually ask.",
			},
			{
				name: "Make third-party ratings easy to find",
				text: "Charity evaluator ratings and regulatory registration numbers are the trust signals engines reach for on legitimacy questions. Stating them on the site makes the answer easy.",
			},
			{
				name: "Answer the efficiency question head on",
				text: "'How much goes to the programme' is the most common donor question and the most commonly dodged. A clear, current answer earns citations precisely because it is rare.",
			},
		],
		elmoFit:
			"Elmo tracks cause-area and legitimacy prompts across engines so you can see whether donors researching your cause are being pointed at your organisation. Being open source and self-hostable keeps the cost structure sane for a nonprofit budget.",
		faqs: [
			{
				question: "Do donors use AI to decide where to give?",
				answer:
					"For discovery and vetting, increasingly yes. Assistants are asked which organisations work on a cause, whether a given one is legitimate, and how efficiently donations are used — the questions that produce a donor's shortlist.",
			},
			{
				question: "What should a nonprofit publish to be cited by AI engines?",
				answer:
					"Programme expense ratios, outcome data, registration and tax status, and third-party evaluator ratings — published as readable web pages rather than PDF downloads. Transparency data is both what donors ask about and what engines can quote.",
			},
		],
	},
	{
		slug: "cybersecurity",
		audience: "cybersecurity companies",
		short:
			"Win the vendor shortlist that security buyers now assemble by asking an AI assistant before they call an analyst.",
		intro: [
			"Security buying is committee-driven, long, and heavily researched, which makes it exactly the kind of decision people delegate to an assistant early. Which vendors cover this control, how do two platforms differ, what does deployment actually involve. The shortlist forms in that research phase.",
			"Security is also a category where engines lean hard on technical credibility. Vendor marketing about being AI-powered and next-generation is functionally interchangeable and gets skipped; published research, detection methodology, and honest architecture documentation are what get quoted. Firms with a real research output have an advantage they usually under-exploit.",
		],
		examplePrompts: [
			"best [security category] tools",
			"[vendor] vs [vendor]",
			"how to meet [framework] compliance",
			"what is the difference between [technology] and [technology]",
		],
		plays: [
			{
				name: "Track category and control prompts",
				text: "Buyers ask by category and by control, not by vendor. Track the categories you claim to compete in and see whether engines actually place you in them.",
			},
			{
				name: "Turn security research into citable content",
				text: "Threat research, detection writeups, and vulnerability analysis are the most citable assets in this category because they are verifiable and specific. Most vendors publish them as PDFs and lose the benefit.",
			},
			{
				name: "Answer compliance mapping questions",
				text: "'How do I meet SOC 2 / ISO 27001 / NIS2' generates enormous assistant traffic. A control-by-control mapping page is high-intent, well-defined, and rarely done well.",
			},
			{
				name: "Document architecture honestly, including limits",
				text: "Engines reward sources that state constraints. Saying what your product does not cover makes the rest of the description more credible and more quotable.",
			},
		],
		elmoFit:
			"Elmo tracks category, comparison, and compliance prompts across engines so you can see which categories you are actually placed in. Self-hosting matters here for the obvious reason: a security vendor rarely wants its competitive research sitting in someone else's SaaS.",
		faqs: [
			{
				question: "Do security buyers really use AI assistants for vendor research?",
				answer:
					"For the early shortlist, consistently. Assistants are used to map a category, compare vendors, and understand technology differences before analyst calls or RFPs begin, which means the shortlist is often set before a vendor knows the evaluation exists.",
			},
			{
				question: "What content gets a security vendor cited?",
				answer:
					"Original research, detection methodology, compliance mappings, and honest architecture documentation. Generic capability marketing is close to invisible because every vendor in the category publishes the same claims.",
			},
		],
	},
	{
		slug: "recruiting",
		audience: "recruiting and HR companies",
		short: "Be named when employers ask an AI assistant which staffing partner or HR platform to use.",
		intro: [
			"Both sides of the recruiting market now research with assistants. Employers ask which agencies specialise in a role or region and which HR platforms fit their size; candidates ask which firms are worth working with. Each conversation produces a short list, and neither runs through your website first.",
			"The category is crowded and largely undifferentiated in how it describes itself, which is an opportunity. Specificity about roles, industries, and geographies is what makes an agency citable, and most publish the same claims about talent and culture as everyone else.",
		],
		examplePrompts: [
			"best recruiting agency for [role or industry]",
			"[ATS] vs [ATS]",
			"how much do recruiters charge",
			"best applicant tracking system for [company size]",
		],
		plays: [
			{
				name: "Specialise the prompt set by role and region",
				text: "Nobody asks for the best recruiting agency in general. They ask for engineering recruiters in Berlin or healthcare staffing in Texas. Track the specific combinations you actually serve.",
			},
			{
				name: "Publish fee structures and timelines",
				text: "Placement fees, guarantee periods, and typical time-to-fill are what employers ask about and what almost no agency site states. Publishing them is an unusually cheap way to become the citable source.",
			},
			{
				name: "Cover the platform comparison queries",
				text: "For HR tech, 'X vs Y' and 'best ATS for [company size]' carry the buying intent. Honest comparison content earns the citation that a feature page will not.",
			},
			{
				name: "Track employer brand prompts separately",
				text: "How engines describe you to candidates is a different question from how they describe you to employers, driven by different sources — review platforms rather than industry press.",
			},
		],
		elmoFit:
			"Elmo tracks role, region, and platform-comparison prompts separately, and shows the employer-facing and candidate-facing pictures side by side rather than collapsing them into one score.",
		faqs: [
			{
				question: "How do employers use AI to choose a recruiting partner?",
				answer:
					"By asking for specialists — agencies that cover a given role, industry, or region — and by asking about fee structures and typical timelines. The assistant returns a short list, and that list is usually where the evaluation starts.",
			},
			{
				question: "Should recruiting firms track candidate-facing AI visibility too?",
				answer:
					"Yes, and separately. Candidate-facing answers draw mainly on review platforms and forums rather than industry publications, so the two pictures can diverge sharply and need different work to fix.",
			},
		],
	},
	{
		slug: "dev-tools",
		audience: "developer tools companies",
		short:
			"Get recommended inside the coding assistants and AI answers developers now consult before choosing a library or platform.",
		intro: [
			"Developers adopted AI assistants faster than any other audience, and they use them at exactly the moment of tool selection: which library handles this, what should I use instead of that, how do I do this in that framework. The recommendation arrives inside the editor, and it is frequently acted on immediately.",
			"This is the one category where documentation quality is the whole game. Assistants are trained and grounded on public docs, examples, and the discussions around them. A tool with clear, complete, crawlable documentation gets recommended; one whose docs are behind a login, rendered client-side, or thin on runnable examples effectively does not exist to the model.",
		],
		examplePrompts: [
			"best library for [task] in [language]",
			"how do I [task] with [framework]",
			"[tool] vs [tool]",
			"alternatives to [tool]",
		],
		plays: [
			{
				name: "Make documentation server-rendered and crawlable",
				text: "AI crawlers generally do not execute JavaScript. Documentation that renders client-side is invisible to them no matter how good it is — a surprisingly common and entirely fixable failure.",
			},
			{
				name: "Publish runnable examples for real tasks",
				text: "Assistants quote code. Complete, copy-pasteable examples organised by task are what get surfaced; API reference tables alone rarely are.",
			},
			{
				name: "Write the migration and comparison pages",
				text: "'Alternatives to X' and 'migrating from X to Y' are high-intent developer queries and are usually only answered by whoever is being migrated away from.",
			},
			{
				name: "Publish an llms.txt and keep docs available as markdown",
				text: "Serving plain markdown alongside the rendered docs gives models a clean, unambiguous source and removes any dependence on their HTML parsing.",
			},
		],
		elmoFit:
			"Elmo tracks the library and framework recommendation prompts developers actually run, across engines, and reports which sources drove each citation. As an open-source tool it also runs inside the environments developer-tools companies already trust.",
		faqs: [
			{
				question: "How do AI coding assistants decide which libraries to recommend?",
				answer:
					"Largely from public documentation, code examples, and community discussion. Tools with thorough, crawlable docs and plentiful runnable examples get recommended far more often than equally capable tools with sparse or client-rendered documentation.",
			},
			{
				question: "Does client-side rendered documentation hurt AI visibility?",
				answer:
					"Significantly. Most AI crawlers do not execute JavaScript, so client-rendered docs return an effectively empty page. The content exists for human readers and not for the models developers ask for recommendations.",
			},
			{
				question: "What is llms.txt and should a developer tool publish one?",
				answer:
					"It is a plain-text file that points models at your most important documentation in a clean, parseable form. It is cheap to publish and removes any reliance on a model correctly parsing your rendered HTML.",
			},
		],
	},
];

export function getAeoVertical(slug: string): AeoVertical | undefined {
	return aeoVerticals.find((v) => v.slug === slug);
}
