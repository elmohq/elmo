// Server-only domain classification. Holds the large hardcoded domain lists
// (including the ~25k-entry editorial set) and `categorizeDomain`. Importing
// this from a client module would bloat the browser bundle — keep it confined to
// server functions. Client code imports types/config from `./domain-categories`.

import {
	type CitationCategory,
	FORUM_DOMAINS,
	hasDeveloperPath,
	inDomainSet,
	inferPageType,
	isForumDomain,
} from "./domain-categories";
import { EDITORIAL_DOMAINS } from "./editorial-domains";

const SOCIAL_MEDIA_DOMAINS = new Set([
	"facebook.com",
	"twitter.com",
	"x.com",
	"instagram.com",
	"linkedin.com",
	"youtube.com",
	"tiktok.com",
	"pinterest.com",
	"reddit.com",
	"snapchat.com",
	"tumblr.com",
	"whatsapp.com",
	"telegram.org",
	"discord.com",
	"twitch.tv",
	"threads.net",
	"threads.com",
	// More platforms / creator / video / community
	"bsky.app",
	"mastodon.social",
	"vk.com",
	"weibo.com",
	"vimeo.com",
	"patreon.com",
	"nextdoor.com",
	"flickr.com",
	"deviantart.com",
	"letterboxd.com",
	"strava.com",
	"meetup.com",
	"rumble.com",
	"kick.com",
	"bilibili.com",
	"imgur.com",
	// General Q&A (developer Q&A lives under "developer")
	"quora.com",
]);

// Code hosting, package registries, developer Q&A, docs, and model hubs.
const DEVELOPER_DOMAINS = new Set([
	// Code hosting
	"github.com",
	"gitlab.com",
	"bitbucket.org",
	"sourceforge.net",
	"codeberg.org",
	"gitea.com",
	// Package registries
	"npmjs.com",
	"pypi.org",
	"crates.io",
	"rubygems.org",
	"packagist.org",
	"nuget.org",
	"hex.pm",
	"pub.dev",
	"pkg.go.dev",
	"hub.docker.com",
	"cocoapods.org",
	"mvnrepository.com",
	// Developer Q&A / community
	"stackoverflow.com",
	"stackexchange.com",
	"superuser.com",
	"serverfault.com",
	"askubuntu.com",
	"dev.to",
	"hashnode.com",
	"lobste.rs",
	// Developer docs / learning
	"developer.mozilla.org",
	"w3schools.com",
	"geeksforgeeks.org",
	"freecodecamp.org",
	"readthedocs.io",
	"css-tricks.com",
	"baeldung.com",
	"digitalocean.com",
	// ML / model hubs + ex-Google dev/ML domains (no longer their own category)
	"huggingface.co",
	"paperswithcode.com",
	"kaggle.com",
	"chromium.org",
	"firebase.com",
	"firebaseio.com",
	"deepmind.com",
	"deepmind.google",
	// More code hosts + package registries (Wikipedia: source-code hosting facilities)
	"gitee.com",
	"launchpad.net",
	"savannah.gnu.org",
	"dev.azure.com",
	"anaconda.org",
	"metacpan.org",
	"rosettacode.org",
	// Developer hosting platforms. Listed as suffixes so every project subdomain
	// (alice.github.io, my-app.vercel.app) resolves with them.
	"github.io",
	"github.dev",
	"github.blog",
	"githubusercontent.com",
	"gitlab.io",
	"pages.dev",
	"workers.dev",
	"deno.dev",
	"val.town",
	"vercel.app",
	"netlify.app",
	"herokuapp.com",
	"fly.dev",
	"web.app",
	"firebaseapp.com",
	"appspot.com",
	"azurewebsites.net",
	"streamlit.app",
	"replit.app",
	"repl.co",
	"glitch.me",
	"surge.sh",
	"js.org",
	"gitbook.io",
	"mintlify.app",
	"codesandbox.io",
	"stackblitz.com",
	"jsfiddle.net",
	"codepen.io",
	"observablehq.com",
	"colab.research.google.com",
	// Platform developer portals. The docs./developer./api. prefix heuristic in
	// isDeveloperDomain covers most vendors; these are the apex-hosted exceptions.
	"cloud.google.com",
	"ai.google.dev",
	"firebase.google.com",
	"web.dev",
	"learn.microsoft.com",
	"azure.microsoft.com",
	"aws.amazon.com",
	// Languages, runtimes, and flagship open-source projects. These are mostly
	// .org/.io and would otherwise fall into the institutional blanket.
	"python.org",
	"nodejs.org",
	"php.net",
	"ruby-lang.org",
	"rust-lang.org",
	"go.dev",
	"kotlinlang.org",
	"scala-lang.org",
	"haskell.org",
	"perl.org",
	"typescriptlang.org",
	"openjdk.org",
	"cppreference.com",
	"isocpp.org",
	"apache.org",
	"kernel.org",
	"gnu.org",
	"linux.org",
	"debian.org",
	"ubuntu.com",
	"fedoraproject.org",
	"archlinux.org",
	"freebsd.org",
	"mozilla.org",
	"w3.org",
	"whatwg.org",
	"ietf.org",
	"rfc-editor.org",
	"postgresql.org",
	"sqlite.org",
	"mysql.com",
	"mariadb.org",
	"redis.io",
	"mongodb.com",
	"elastic.co",
	"kubernetes.io",
	"docker.com",
	"nginx.org",
	"terraform.io",
	"hashicorp.com",
	"ansible.com",
	"grafana.com",
	"prometheus.io",
	"opentelemetry.io",
	"openssl.org",
	"reactjs.org",
	"react.dev",
	"vuejs.org",
	"angular.dev",
	"svelte.dev",
	"nextjs.org",
	"nuxt.com",
	"vite.dev",
	"vitejs.dev",
	"eslint.org",
	"prettier.io",
	"jquery.com",
	"numpy.org",
	"scipy.org",
	"pydata.org",
	"scikit-learn.org",
	"pytorch.org",
	"tensorflow.org",
	"spring.io",
	"openapis.org",
	"json-schema.org",
	"semver.org",
	"json.org",
	// Developer publishers and practice sites (same shelf as dev.to / css-tricks).
	"sitepoint.com",
	"smashingmagazine.com",
	"infoq.com",
	"thenewstack.io",
	"hackernoon.com",
	"phoronix.com",
	"slashdot.org",
	"tutorialspoint.com",
	"javatpoint.com",
	"programiz.com",
	"realpython.com",
	"towardsdatascience.com",
	"machinelearningmastery.com",
	"kdnuggets.com",
	"analyticsvidhya.com",
	"leetcode.com",
	"hackerrank.com",
	"codewars.com",
	"exercism.org",
	"codeforces.com",
	"roadmap.sh",
	"refactoring.guru",
	"martinfowler.com",
	// Model providers and LLM tooling — the working end of the "model hub" shelf.
	// The assistant surfaces themselves (chatgpt.com, claude.ai, perplexity.ai,
	// gemini.google.com) are consumer products, not developer sources, and stay
	// unbucketed rather than sit in the wrong one.
	"openai.com",
	"anthropic.com",
	"mistral.ai",
	"cohere.com",
	"deepseek.com",
	"x.ai",
	"together.ai",
	"groq.com",
	"replicate.com",
	"ollama.com",
	"langchain.com",
	"llamaindex.ai",
	"langfuse.com",
	"modal.com",
	"ai.google",
	"vertexai.google.com",
]);

// Host prefixes that mark a developer surface on any domain — the same
// generalizable shape as the forum subdomain heuristic, so a vendor's docs land
// in "developer" without enumerating every vendor.
const DEVELOPER_HOST_PREFIX_RE = /^(docs?|developers?|dev|devs|api|apis|sdks?|codelabs|git|engineering)\./;

// Hosts the prefix heuristic would claim but that publish something else:
// docs.google.com is the consumer document editor, not Google's developer docs.
const DEVELOPER_HOST_PREFIX_EXCEPTIONS = new Set(["docs.google.com"]);

// Mirrors and proxies of the big code hosts (qgithub.com, github.leishennb.icu)
// — the host carrying the code host's name is the signal.
const CODE_HOST_MIRROR_RE = /(github|gitlab|bitbucket)/;

// Press-release distribution wires — small, finite, unambiguous.
const PR_WIRE_DOMAINS = new Set([
	"prnewswire.com",
	"businesswire.com",
	"globenewswire.com",
	"accesswire.com",
	"einpresswire.com",
	"einnews.com",
	"prweb.com",
	"newswire.com",
	"24-7pressrelease.com",
	"prlog.org",
	"openpr.com",
	"pr.com",
	"presswire.com",
	"issuewire.com",
	"prunderground.com",
	"send2press.com",
	"webwire.com",
	"releasewire.com",
	"prfree.com",
	"newswire.ca",
	"pressat.co.uk",
]);

// Review / comparison / vendor-listing sites.
const REVIEW_DOMAINS = new Set([
	"g2.com",
	"capterra.com",
	"getapp.com",
	"softwareadvice.com",
	"trustradius.com",
	"trustpilot.com",
	"sitejabber.com",
	"productreview.com.au",
	"peerspot.com",
	"gartner.com",
	"forrester.com",
	"yelp.com",
	"tripadvisor.com",
	"consumeraffairs.com",
	"glassdoor.com",
	"omr.com",
	"producthunt.com",
	"goodfirms.co",
	"clutch.co",
	"influenster.com",
	"makeupalley.com",
	"bbb.org",
	"angi.com",
	"houzz.com",
	"reviews.io",
	"resellerratings.com",
	"feefo.com",
	"consumerlab.com",
	"thingtesting.com",
	// Consumer / electronics / pro-services / school / employer review sites
	"consumerreports.org",
	"which.co.uk",
	"rtings.com",
	"dxomark.com",
	"notebookcheck.net",
	"healthgrades.com",
	"ratemds.com",
	"vitals.com",
	"greatschools.org",
	"niche.com",
	"ratemyprofessors.com",
	"avvo.com",
	"comparably.com",
	"kununu.com",
	"homeadvisor.com",
	"thumbtack.com",
	// Software / tool directories: listings with side-by-side alternatives, the
	// same job G2 and Capterra do.
	"alternativeto.net",
	"slant.co",
	"saashub.com",
	"stackshare.io",
	"financesonline.com",
	"softwaresuggest.com",
	"crozdesk.com",
	"saasworthy.com",
	"tekpon.com",
	"selecthub.com",
	"theresanaiforthat.com",
	"futurepedia.io",
	"futuretools.io",
	"toolify.ai",
	"aitools.fyi",
	"libhunt.com",
	// Local / professional directories
	"yellowpages.com",
	"manta.com",
	"justdial.com",
	"foursquare.com",
]);

// Reference / structured-knowledge. Checked before `institutional` so that
// wikipedia.org (a .org) lands here rather than in the institutional blanket.
const REFERENCE_DOMAINS = new Set([
	"wikipedia.org",
	"wikimedia.org",
	"wiktionary.org",
	"wikivoyage.org",
	"fandom.com",
	"wikihow.com",
	"crunchbase.com",
	"imdb.com",
	"britannica.com",
	"dictionary.com",
	"merriam-webster.com",
	"investopedia.com",
	"goodreads.com",
	"discogs.com",
	"genius.com",
	"allmusic.com",
	"incidecoder.com",
	"skinsort.com",
	"patents.google.com", // Google-owned, but a reference DB (not a traditional citation surface)
	// Dictionaries / encyclopedias
	"dictionary.cambridge.org",
	"collinsdictionary.com",
	"vocabulary.com",
	"thesaurus.com",
	// Knowledge / structured data
	"wolframalpha.com",
	"howstuffworks.com",
	"tvtropes.org",
	"wikidata.org",
	"wikiquote.org",
	"wikibooks.org",
	"openfoodfacts.org",
	"pitchbook.com",
	"owler.com",
	"zoominfo.com",
	"similarweb.com",
	// Encyclopedias (Wikipedia: list of online encyclopedias)
	"encyclopedia.com",
	"scholarpedia.org",
	"newworldencyclopedia.org",
	"worldhistory.org",
	"plato.stanford.edu",
	"iep.utm.edu",
	"mathworld.wolfram.com",
	"scienceworld.wolfram.com",
	"oeis.org",
	"emojipedia.org",
	"knowyourmeme.com",
	"ballotpedia.org",
	"liquipedia.net",
	"musicbrainz.org",
	"rateyourmusic.com",
	"pcgamingwiki.com",
	"radiopaedia.org",
	"omniglot.com",
	"minecraft.wiki",
	"treccani.it",
	"larousse.fr",
	"snl.no",
	"ne.se",
	"baike.baidu.com",
	// Dictionaries / thesauruses (Wikipedia: list of online dictionaries)
	"thefreedictionary.com",
	"ahdictionary.com",
	"oxfordlearnersdictionaries.com",
	"ldoceonline.com",
	"urbandictionary.com",
	"wordnik.com",
	"linguee.com",
	"reverso.net",
	"etymonline.com",
	"rae.es",
	"duden.de",
	// Wikis / structured DBs (Wikipedia: list of wikis)
	"openstreetmap.org",
	"geonames.org",
	"wikisource.org",
	"wikiversity.org",
	"wikispecies.org",
	"wikiart.org",
	"imslp.org",
	"familysearch.org",
]);

// Retailers, marketplaces, drugstores, and coupon/deal sites.
const ECOMMERCE_DOMAINS = new Set([
	// Marketplaces
	"amazon.com",
	"amazon.co.uk",
	"amazon.ca",
	"amazon.de",
	"amazon.fr",
	"amazon.es",
	"amazon.it",
	"amazon.in",
	"amazon.com.au",
	"amazon.co.jp",
	"amazon.com.br",
	"amazon.com.mx",
	"ebay.com",
	"ebay.co.uk",
	"ebay.com.au",
	"etsy.com",
	"aliexpress.com",
	"alibaba.com",
	"temu.com",
	"shein.com",
	"wish.com",
	"mercari.com",
	"poshmark.com",
	"depop.com",
	// General / department retail
	"walmart.com",
	"target.com",
	"costco.com",
	"samsclub.com",
	"bestbuy.com",
	"nordstrom.com",
	"nordstromrack.com",
	"macys.com",
	"bloomingdales.com",
	"saksfifthavenue.com",
	"kohls.com",
	"jcpenney.com",
	"qvc.com",
	"hsn.com",
	"overstock.com",
	"wayfair.com",
	// Beauty / personal-care retail
	"sephora.com",
	"ulta.com",
	"dermstore.com",
	"skinstore.com",
	"bluemercury.com",
	"lookfantastic.com",
	"cultbeauty.com",
	"spacenk.com",
	"beautylish.com",
	"credobeauty.com",
	"thedetoxmarket.com",
	"beautybay.com",
	"feelunique.com",
	"sokoglam.com",
	"yesstyle.com",
	"stylevana.com",
	"revolve.com",
	"shopbop.com",
	"asos.com",
	"violetgrey.com",
	"adorebeauty.com.au",
	// Drugstores / pharmacy retail
	"walgreens.com",
	"cvs.com",
	"riteaid.com",
	"boots.com",
	"superdrug.com",
	"chemistwarehouse.com.au",
	// Coupon / deal / cashback
	"rakuten.com",
	"retailmenot.com",
	"couponcabin.com",
	"joinhoney.com",
	"honey.com",
	"slickdeals.net",
	"groupon.com",
	"dealmoon.com",
	"coupons.com",
	"knoji.com",
	// General / specialty retailers
	"rei.com",
	"kroger.com",
	"dickssportinggoods.com",
	"chewy.com",
	"zappos.com",
	"gnc.com",
	"iherb.com",
	"vitaminshoppe.com",
	"backcountry.com",
	"newegg.com",
	"homedepot.com",
	"lowes.com",
	"vitacost.com",
	"bodybuilding.com",
	"swansonvitamins.com",
	"hm.com",
	"zara.com",
	"uniqlo.com",
	"gap.com",
	// Resale marketplaces
	"stockx.com",
	"goat.com",
	"grailed.com",
	"vinted.com",
	"therealreal.com",
	// More global marketplaces (Wikipedia: list of online marketplaces)
	"flipkart.com",
	"pinduoduo.com",
	"trendyol.com",
	"hepsiburada.com",
	"gumtree.com",
	"kijiji.ca",
	"mercadolibre.com",
	"jd.com",
	"tmall.com",
	"lazada.com",
	"shopee.com",
	"rakuten.co.jp",
	"instacart.com",
	// Electronics / fashion / home / books / auto retailers
	"bhphotovideo.com",
	"adorama.com",
	"microcenter.com",
	"farfetch.com",
	"ssense.com",
	"net-a-porter.com",
	"mytheresa.com",
	"endclothing.com",
	"ikea.com",
	"crateandbarrel.com",
	"williams-sonoma.com",
	"staples.com",
	"officedepot.com",
	"petco.com",
	"petsmart.com",
	"barnesandnoble.com",
	"abebooks.com",
	"bookshop.org",
	"thriftbooks.com",
	"carvana.com",
	"cargurus.com",
	"autotrader.com",
	"cars.com",
	// App stores and marketplaces — a listing page is a storefront.
	"apps.apple.com",
	"itunes.apple.com",
	"play.google.com",
	"chromewebstore.google.com",
	"addons.mozilla.org",
	"apps.shopify.com",
	"apps.odoo.com",
	"marketplace.atlassian.com",
	"marketplace.visualstudio.com",
	"workspace.google.com",
	"appsumo.com",
	// Hosted-store platforms, matched as suffixes so every merchant subdomain
	// (acme.myshopify.com) resolves.
	"myshopify.com",
	"bigcartel.com",
	"ecwid.com",
	"square.site",
]);

// Host prefixes and TLDs that mark a storefront on any domain, so a shop doesn't
// need to be enumerated to be recognized.
const ECOMMERCE_HOST_PREFIX_RE = /^(shop|store|shopping|checkout)\./;
const ECOMMERCE_TLDS = new Set(["shop", "store"]);

const EDITORIAL_DOMAIN_SET = new Set(EDITORIAL_DOMAINS);

// A blog/news subdomain is published content whoever owns the apex domain — the
// editorial counterpart to the forum and developer prefix heuristics. Checked
// after every other category, so it only claims otherwise-unbucketed hosts.
const EDITORIAL_HOST_PREFIX_RE = /^(blogs?|news|newsroom|magazine)\./;

// A press subdomain is the company's own release feed rather than a publisher's
// coverage of it, so it belongs with the wires. Checked as late as the editorial
// prefix, so a university press office stays institutional.
const PR_HOST_PREFIX_RE = /^press\./;

// TLDs and second-level domains that indicate institutional/government/academic sites
const INSTITUTIONAL_TLDS = new Set(["edu", "gov", "mil", "int"]);
const INSTITUTIONAL_SLDS = new Set(["edu", "gov", "org", "ac", "mil", "govt", "gob"]);

const INSTITUTIONAL_DOMAINS = new Set([
	"nhs.uk",
	"nhs.net",
	"nih.gov",
	"cdc.gov",
	"fda.gov",
	"who.int",
	"europa.eu",
	"un.org",
	"unesco.org",
	"unicef.org",
	"worldbank.org",
	"imf.org",
	"wto.org",
	"nato.int",
	"icrc.org",
	"mayo.edu",
	"mayoclinic.org",
	"clevelandclinic.org",
	"hopkinsmedicine.org",
	"webmd.com",
	"pubmed.ncbi.nlm.nih.gov",
	"medlineplus.gov",
	"cochrane.org",
	"arxiv.org",
	"doi.org",
	"jstor.org",
	"ncbi.nlm.nih.gov",
	"ieee.org",
	"acm.org",
	"nature.com",
	"sciencedirect.com",
	"springer.com",
	"wiley.com",
	// Academic / research publishers + databases
	"mdpi.com",
	"tandfonline.com",
	"sagepub.com",
	"jamanetwork.com",
	"biomedcentral.com",
	"oup.com",
	"researchgate.net",
	"examine.com",
	"cambridge.org",
	"ssrn.com",
	"thelancet.com",
	"bmj.com",
	"cell.com",
	"karger.com",
	"frontiersin.org",
	"hindawi.com",
	"dovepress.com",
	"spandidos-publications.com",
	"parliament.uk",
	"legislation.gov.uk",
	"service.gov.uk",
	"canada.ca",
	"gc.ca",
	"gov.au",
	"govt.nz",
]);

function isSocialMediaDomain(domain: string): boolean {
	return inDomainSet(domain, SOCIAL_MEDIA_DOMAINS);
}

function isPrWireDomain(domain: string): boolean {
	return inDomainSet(domain, PR_WIRE_DOMAINS);
}

function isReviewDomain(domain: string): boolean {
	return inDomainSet(domain, REVIEW_DOMAINS);
}

function isEcommerceDomain(domain: string): boolean {
	if (inDomainSet(domain, ECOMMERCE_DOMAINS)) return true;
	if (ECOMMERCE_HOST_PREFIX_RE.test(domain)) return true;
	return ECOMMERCE_TLDS.has(domain.split(".").pop() ?? "");
}

function isDeveloperDomain(domain: string): boolean {
	if (inDomainSet(domain, DEVELOPER_DOMAINS)) return true;
	if (DEVELOPER_HOST_PREFIX_EXCEPTIONS.has(domain)) return false;
	return DEVELOPER_HOST_PREFIX_RE.test(domain) || CODE_HOST_MIRROR_RE.test(domain);
}

function isReferenceDomain(domain: string): boolean {
	return inDomainSet(domain, REFERENCE_DOMAINS);
}

function isEditorialDomain(domain: string): boolean {
	return inDomainSet(domain, EDITORIAL_DOMAIN_SET);
}

function hasEditorialHostPrefix(domain: string): boolean {
	return EDITORIAL_HOST_PREFIX_RE.test(domain);
}

function hasPrHostPrefix(domain: string): boolean {
	return PR_HOST_PREFIX_RE.test(domain);
}

function isInstitutionalDomain(domain: string): boolean {
	if (inDomainSet(domain, INSTITUTIONAL_DOMAINS)) return true;
	const parts = domain.split(".");
	if (parts.length < 2) return false;
	const tld = parts[parts.length - 1];
	if (INSTITUTIONAL_TLDS.has(tld)) return true;
	if (tld === "org") return true;
	if (parts.length >= 3) {
		const sld = parts[parts.length - 2];
		if (INSTITUTIONAL_SLDS.has(sld)) return true;
	}
	return false;
}

/** Tried in order; the first match wins. Forums (incl. community.X / forums.X
 *  subdomains) lead so a forum on an ecommerce/editorial site isn't miscounted
 *  as a store. */
const DOMAIN_CATEGORY_CHECKS: [(domain: string) => boolean, CitationCategory][] = [
	[isForumDomain, "social"],
	[isPrWireDomain, "pr"],
	[isReviewDomain, "reviews"],
	[isEcommerceDomain, "ecommerce"],
	[isSocialMediaDomain, "social"],
	[isDeveloperDomain, "developer"],
	[isReferenceDomain, "reference"],
	[isEditorialDomain, "editorial"],
	[isInstitutionalDomain, "institutional"],
	// Last: a university or agency newsroom (news.mit.edu) is institutional first.
	[hasEditorialHostPrefix, "editorial"],
	[hasPrHostPrefix, "pr"],
];

export function categorizeDomain(
	domain: string,
	brandDomains: Set<string>,
	competitorDomains: Set<string>,
): CitationCategory {
	if (inDomainSet(domain, brandDomains)) return "brand";
	if (inDomainSet(domain, competitorDomains)) return "competitor";
	return DOMAIN_CATEGORY_CHECKS.find(([matches]) => matches(domain))?.[1] ?? "other";
}

/**
 * The curated domain lists categorizeDomain consults, in precedence order. Exported
 * so a test can assert they're mutually exclusive: a domain in two lists would be
 * silently resolved by whichever is checked first (the slickdeals class of bug). The
 * ~25k editorial set is intentionally excluded — it's the catch-all checked last, so
 * overlaps with the specific lists above are expected (and harmless), not bugs.
 */
export const CURATED_DOMAIN_LISTS: { name: string; domains: Set<string> }[] = [
	{ name: "forum", domains: FORUM_DOMAINS },
	{ name: "pr", domains: PR_WIRE_DOMAINS },
	{ name: "reviews", domains: REVIEW_DOMAINS },
	{ name: "ecommerce", domains: ECOMMERCE_DOMAINS },
	{ name: "social", domains: SOCIAL_MEDIA_DOMAINS },
	{ name: "developer", domains: DEVELOPER_DOMAINS },
	{ name: "reference", domains: REFERENCE_DOMAINS },
	{ name: "institutional", domains: INSTITUTIONAL_DOMAINS },
];

const EDITORIAL_PAGE_TYPES = new Set(["article", "listicle", "howto", "comparison", "review"]);

/**
 * Classify a single citation by domain, and — when the domain alone is
 * unclassified ("other") — fall back to the inferred page type so long-tail
 * review blogs and articles count as editorial, and standalone storefront/product
 * pages count as ecommerce. This is the main lever for shrinking the catch-all
 * "other" bucket beyond what the hardcoded domain lists can cover.
 */
export function classifyUrl(
	domain: string,
	url: string,
	title: string | null | undefined,
	brandDomains: Set<string>,
	competitorDomains: Set<string>,
): CitationCategory {
	const cat = categorizeDomain(domain, brandDomains, competitorDomains);
	if (cat !== "other") return cat;
	const pt = inferPageType(url, title);
	if (pt === "forum") return "social"; // a forum page on an unlisted domain is still community / UGC
	if (EDITORIAL_PAGE_TYPES.has(pt)) return "editorial";
	if (pt === "product" || pt === "shopping") return "ecommerce";
	// Technical documentation reads as a developer source no matter who hosts it.
	// Narrower than the "doc" page type, which also covers consumer help centres.
	if (hasDeveloperPath(url)) return "developer";
	return "other";
}
