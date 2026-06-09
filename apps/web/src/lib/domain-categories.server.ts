// Server-only domain classification. Holds the large hardcoded domain lists
// (including the ~25k-entry editorial set) and `categorizeDomain`. Importing
// this from a client module would bloat the browser bundle — keep it confined to
// server functions. Client code imports types/config from `./domain-categories`.

import { EDITORIAL_DOMAINS } from "./editorial-domains";
import { type CitationCategory, inferPageType } from "./domain-categories";

const SOCIAL_MEDIA_DOMAINS = new Set([
	"facebook.com", "twitter.com", "x.com", "instagram.com", "linkedin.com",
	"youtube.com", "tiktok.com", "pinterest.com", "reddit.com", "snapchat.com",
	"tumblr.com", "whatsapp.com", "telegram.org", "discord.com", "twitch.tv",
	"threads.net", "threads.com",
	// Q&A / forums
	"quora.com", "stackoverflow.com", "stackexchange.com", "superuser.com",
	"serverfault.com", "askubuntu.com", "news.ycombinator.com",
	// Code / developer communities (user-published)
	"github.com", "gitlab.com",
]);

const GOOGLE_OWNED_DOMAINS = new Set([
	"google.com", "google.org", "google.dev", "google.cloud",
	"googleapis.com", "googleusercontent.com", "googleblog.com",
	"googlesource.com", "googlecode.com",
	"blog.google", "about.google", "store.google",
	"android.com", "chromium.org", "chrome.com",
	"youtube.google.com", "withgoogle.com",
	"firebase.com", "firebaseio.com",
	"gstatic.com", "ggpht.com",
	"gmail.com", "googlemail.com",
	"google.ai", "deepmind.google", "deepmind.com",
	"kaggle.com", "waze.com", "fitbit.com",
	"blogger.com", "blogspot.com",
	"appspot.com", "web.app", "firebaseapp.com",
	"googlemaps.com", "google.maps",
	"doubleclick.net", "googlesyndication.com", "googleadservices.com",
	"google.shopping", "google.flights",
]);

// Press-release distribution wires — small, finite, unambiguous.
const PR_WIRE_DOMAINS = new Set([
	"prnewswire.com", "businesswire.com", "globenewswire.com", "accesswire.com",
	"einpresswire.com", "einnews.com", "prweb.com", "newswire.com",
	"24-7pressrelease.com", "prlog.org", "openpr.com", "pr.com",
	"presswire.com", "issuewire.com", "prunderground.com", "send2press.com",
]);

// Review / comparison / vendor-listing sites.
const REVIEW_DOMAINS = new Set([
	"g2.com", "capterra.com", "getapp.com", "softwareadvice.com", "trustradius.com",
	"trustpilot.com", "sitejabber.com", "productreview.com.au", "peerspot.com",
	"gartner.com", "forrester.com", "yelp.com", "tripadvisor.com", "consumeraffairs.com",
	"glassdoor.com", "omr.com", "producthunt.com", "goodfirms.co", "clutch.co",
]);

// Reference / structured-knowledge. Checked before `institutional` so that
// wikipedia.org (a .org) lands here rather than in the institutional blanket.
const REFERENCE_DOMAINS = new Set([
	"wikipedia.org", "wikimedia.org", "wiktionary.org", "wikivoyage.org",
	"fandom.com", "wikihow.com", "crunchbase.com", "imdb.com", "britannica.com",
	"dictionary.com", "merriam-webster.com", "investopedia.com", "goodreads.com",
	"discogs.com", "genius.com", "allmusic.com", "incidecoder.com", "skinsort.com",
	// Dictionaries / encyclopedias
	"dictionary.cambridge.org", "collinsdictionary.com", "vocabulary.com", "thesaurus.com",
]);

// Retailers, marketplaces, drugstores, and coupon/deal sites.
const ECOMMERCE_DOMAINS = new Set([
	// Marketplaces
	"amazon.com", "amazon.co.uk", "amazon.ca", "amazon.de", "amazon.fr", "amazon.es",
	"amazon.it", "amazon.in", "amazon.com.au", "amazon.co.jp", "amazon.com.br", "amazon.com.mx",
	"ebay.com", "ebay.co.uk", "ebay.com.au", "etsy.com", "aliexpress.com", "alibaba.com",
	"temu.com", "shein.com", "wish.com", "mercari.com", "poshmark.com", "depop.com",
	// General / department retail
	"walmart.com", "target.com", "costco.com", "samsclub.com", "bestbuy.com",
	"nordstrom.com", "nordstromrack.com", "macys.com", "bloomingdales.com", "saksfifthavenue.com",
	"kohls.com", "jcpenney.com", "qvc.com", "hsn.com", "overstock.com", "wayfair.com",
	// Beauty / personal-care retail
	"sephora.com", "ulta.com", "dermstore.com", "skinstore.com", "bluemercury.com",
	"lookfantastic.com", "cultbeauty.com", "spacenk.com", "beautylish.com", "credobeauty.com",
	"thedetoxmarket.com", "beautybay.com", "feelunique.com", "sokoglam.com", "yesstyle.com",
	"stylevana.com", "revolve.com", "shopbop.com", "asos.com", "violetgrey.com", "adorebeauty.com.au",
	// Drugstores / pharmacy retail
	"walgreens.com", "cvs.com", "riteaid.com", "boots.com", "superdrug.com", "chemistwarehouse.com.au",
	// Coupon / deal / cashback
	"rakuten.com", "retailmenot.com", "couponcabin.com", "joinhoney.com", "honey.com",
	"slickdeals.net", "groupon.com", "dealmoon.com", "coupons.com", "knoji.com",
	// General / specialty retailers
	"rei.com", "bestbuy.com", "kroger.com", "dickssportinggoods.com", "chewy.com",
	"zappos.com", "gnc.com", "iherb.com", "vitaminshoppe.com", "backcountry.com",
]);

const EDITORIAL_DOMAIN_SET = new Set(EDITORIAL_DOMAINS);

// TLDs and second-level domains that indicate institutional/government/academic sites
const INSTITUTIONAL_TLDS = new Set(["edu", "gov", "mil", "int"]);
const INSTITUTIONAL_SLDS = new Set(["edu", "gov", "org", "ac", "mil", "govt", "gob"]);

const INSTITUTIONAL_DOMAINS = new Set([
	"nhs.uk", "nhs.net",
	"nih.gov", "cdc.gov", "fda.gov", "who.int",
	"europa.eu", "un.org", "unesco.org", "unicef.org",
	"worldbank.org", "imf.org", "wto.org",
	"nato.int", "icrc.org",
	"mayo.edu", "mayoclinic.org", "clevelandclinic.org", "hopkinsmedicine.org", "webmd.com",
	"pubmed.ncbi.nlm.nih.gov", "medlineplus.gov", "cochrane.org",
	"arxiv.org", "doi.org", "jstor.org", "ncbi.nlm.nih.gov",
	"ieee.org", "acm.org", "nature.com", "sciencedirect.com", "springer.com", "wiley.com",
	// Academic / research publishers + databases
	"mdpi.com", "tandfonline.com", "sagepub.com", "jamanetwork.com", "biomedcentral.com",
	"oup.com", "researchgate.net", "examine.com", "cambridge.org", "ssrn.com",
	"thelancet.com", "bmj.com", "cell.com", "karger.com", "frontiersin.org",
	"parliament.uk", "legislation.gov.uk", "service.gov.uk",
	"canada.ca", "gc.ca", "gov.au", "govt.nz",
]);

/**
 * True if `domain` equals, or is a subdomain of, any entry in `set`. Walks the
 * domain's parent suffixes so lookups stay O(labels) regardless of set size —
 * important for the large editorial set.
 */
function inDomainSet(domain: string, set: Set<string>): boolean {
	let d = domain;
	while (true) {
		if (set.has(d)) return true;
		const dot = d.indexOf(".");
		if (dot === -1) return false;
		d = d.slice(dot + 1);
	}
}

export function isSocialMediaDomain(domain: string): boolean {
	return inDomainSet(domain, SOCIAL_MEDIA_DOMAINS);
}

export function isPrWireDomain(domain: string): boolean {
	return inDomainSet(domain, PR_WIRE_DOMAINS);
}

export function isReviewDomain(domain: string): boolean {
	return inDomainSet(domain, REVIEW_DOMAINS);
}

export function isEcommerceDomain(domain: string): boolean {
	return inDomainSet(domain, ECOMMERCE_DOMAINS);
}

export function isReferenceDomain(domain: string): boolean {
	return inDomainSet(domain, REFERENCE_DOMAINS);
}

export function isEditorialDomain(domain: string): boolean {
	return inDomainSet(domain, EDITORIAL_DOMAIN_SET);
}

export function isGoogleDomain(domain: string): boolean {
	if (inDomainSet(domain, GOOGLE_OWNED_DOMAINS)) return true;
	// Google country-specific TLDs: google.co.uk, google.com.au, google.de, etc.
	if (/^google\.[a-z]{2,3}(\.[a-z]{2})?$/.test(domain)) return true;
	return false;
}

export function isInstitutionalDomain(domain: string): boolean {
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

export function categorizeDomain(
	domain: string,
	brandDomains: Set<string>,
	competitorDomains: Set<string>,
): CitationCategory {
	for (const bd of brandDomains) {
		if (domain === bd || domain.endsWith(`.${bd}`)) return "brand";
	}
	for (const cd of competitorDomains) {
		if (domain === cd || domain.endsWith(`.${cd}`)) return "competitor";
	}
	if (isGoogleDomain(domain)) return "google";
	if (isPrWireDomain(domain)) return "pr";
	if (isReviewDomain(domain)) return "reviews";
	if (isEcommerceDomain(domain)) return "ecommerce";
	if (isSocialMediaDomain(domain)) return "social";
	if (isReferenceDomain(domain)) return "reference";
	if (isEditorialDomain(domain)) return "editorial";
	if (isInstitutionalDomain(domain)) return "institutional";
	return "other";
}

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
	if (EDITORIAL_PAGE_TYPES.has(pt)) return "editorial";
	if (pt === "product" || pt === "shopping") return "ecommerce";
	return "other";
}
