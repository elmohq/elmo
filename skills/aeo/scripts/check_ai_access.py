#!/usr/bin/env python3
"""Check whether AI answer-engine crawlers can reach and read a set of pages.

Usage: python3 check_ai_access.py URL [URL ...] [--json]

For each URL: evaluates robots.txt for every crawler (RFC 9309 matching),
fetches the page as each crawler and as a browser, reads noindex/nosnippet
from the meta robots tag and X-Robots-Tag header, and measures how much
visible text the raw HTML carries without running JavaScript.

Standard library only. Makes plain GET requests to the URLs given and their
robots.txt, nothing else.
"""

import argparse
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser

TIMEOUT = 15
MAX_BYTES = 5_000_000

BROWSER_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
)

# (robots.txt token, what blocking it costs, user agent sent when fetching)
CRAWLERS = [
    ("OAI-SearchBot", "ChatGPT search", "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.3; +https://openai.com/searchbot"),
    ("ChatGPT-User", "ChatGPT live fetch", "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot"),
    ("GPTBot", "OpenAI training", "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.3; +https://openai.com/gptbot"),
    ("Claude-SearchBot", "Claude search", "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; Claude-SearchBot/1.0; +https://www.anthropic.com"),
    ("Claude-User", "Claude live fetch", "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; Claude-User/1.0; +https://www.anthropic.com"),
    ("ClaudeBot", "Anthropic training", "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ClaudeBot/1.0; +claudebot@anthropic.com"),
    ("PerplexityBot", "Perplexity", "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot"),
    ("Perplexity-User", "Perplexity live fetch", "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; Perplexity-User/1.0; +https://perplexity.ai/perplexity-user"),
    ("Googlebot", "Google Search + AI Overviews/AI Mode", "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"),
    ("Google-Extended", "Gemini training + Gemini app grounding", None),
    ("Bingbot", "Bing + Copilot", "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm) Chrome/116.0.1938.76 Safari/537.36"),
    ("Applebot", "Siri/Spotlight", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1.1 Safari/605.1.15 (Applebot/0.1; +http://www.apple.com/go/applebot)"),
    ("Applebot-Extended", "Apple training", None),
    ("Meta-ExternalAgent", "Meta AI", "meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)"),
    ("Amazonbot", "Amazon AI", "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Amazonbot/0.1; +https://developer.amazon.com/support/amazonbot) Chrome/119.0.6045.214 Safari/537.36"),
    ("DuckAssistBot", "DuckDuckGo AI answers", "DuckAssistBot/1.2; (+http://duckduckgo.com/duckassistbot.html)"),
    ("CCBot", "Common Crawl (training sets)", "CCBot/2.0 (https://commoncrawl.org/faq/)"),
]

CHALLENGE_MARKERS = (
    "cf-chl", "challenge-platform", "just a moment...", "attention required",
    "captcha", "access denied", "verify you are human", "px-captcha",
)


def fetch(url, user_agent):
    """GET a URL. Returns (status, headers, body_text, error)."""
    request = urllib.request.Request(url, headers={
        "User-Agent": user_agent,
        "Accept": "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
        "Accept-Language": "en",
    })
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            body = response.read(MAX_BYTES)
            return response.status, response.headers, decode(body, response.headers), None
    except urllib.error.HTTPError as error:
        body = error.read(MAX_BYTES) if error.fp else b""
        return error.code, error.headers, decode(body, error.headers), None
    except Exception as error:  # network errors, TLS, timeouts
        return None, None, "", f"{type(error).__name__}: {error}"


def decode(body, headers):
    charset = headers.get_content_charset() if headers else None
    return body.decode(charset or "utf-8", errors="replace")


# --- robots.txt (RFC 9309) -------------------------------------------------

def parse_robots(text):
    """Return a list of (agents, rules) groups; rules are (allow: bool, path)."""
    groups = []
    agents, rules, last_was_agent = [], [], False
    for raw in text.splitlines():
        line = raw.split("#", 1)[0].strip()
        if ":" not in line:
            continue
        key, value = (part.strip() for part in line.split(":", 1))
        key = key.lower()
        if key == "user-agent":
            if not last_was_agent and (agents or rules):
                groups.append((agents, rules))
                agents, rules = [], []
            agents.append(value.lower())
            last_was_agent = True
        elif key in ("allow", "disallow"):
            if agents:
                rules.append((key == "allow", value))
            last_was_agent = False
        else:
            last_was_agent = False
    if agents:
        groups.append((agents, rules))
    return groups


def rules_for(groups, token):
    """Rules from every group naming this token, or else from the * groups."""
    token = token.lower()
    named = [rule for agents, rules in groups if token in agents for rule in rules]
    if any(token in agents for agents, _ in groups):
        return named
    return [rule for agents, rules in groups if "*" in agents for rule in rules]


def path_pattern(path):
    anchored = path.endswith("$")
    body = path[:-1] if anchored else path
    regex = ".*".join(re.escape(part) for part in body.split("*"))
    return re.compile(regex + ("$" if anchored else ""))


def is_allowed(groups, token, url):
    parsed = urllib.parse.urlsplit(url)
    target = (parsed.path or "/") + (f"?{parsed.query}" if parsed.query else "")
    best = None  # (length, allow)
    for allow, path in rules_for(groups, token):
        if not path:
            continue  # an empty Disallow allows everything
        if path_pattern(path).match(target):
            length = len(path)
            if best is None or length > best[0] or (length == best[0] and allow):
                best = (length, allow)
    return True if best is None else best[1]


def robots_for(origin, cache):
    if origin in cache:
        return cache[origin]
    status, _, body, error = fetch(origin + "/robots.txt", BROWSER_UA)
    if error:
        result = {"status": None, "note": f"unreachable ({error})", "groups": None}
    elif status is not None and 400 <= status < 500:
        result = {"status": status, "note": "no robots.txt (everything allowed)", "groups": []}
    elif status is not None and status >= 500:
        result = {"status": status, "note": "server error: Google treats this as disallow-all", "groups": None}
    else:
        result = {"status": status, "note": "ok", "groups": parse_robots(body)}
    cache[origin] = result
    return result


# --- page content -----------------------------------------------------------

class PageReader(HTMLParser):
    SKIP = {"script", "style", "noscript", "template", "svg"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.depth = 0
        self.words = 0
        self.scripts = 0
        self.title = ""
        self.in_title = False
        self.meta_robots = []
        self.canonical = None

    def handle_starttag(self, tag, attrs):
        attrs = {k.lower(): (v or "") for k, v in attrs}
        if tag == "script":
            self.scripts += 1
        if tag in self.SKIP:
            self.depth += 1
        elif tag == "title":
            self.in_title = True
        elif tag == "meta" and attrs.get("name", "").lower() in ("robots", "googlebot", "bingbot"):
            self.meta_robots.append(attrs.get("content", "").lower())
        elif tag == "link" and "canonical" in attrs.get("rel", "").lower():
            self.canonical = attrs.get("href")

    def handle_endtag(self, tag):
        if tag in self.SKIP and self.depth:
            self.depth -= 1
        elif tag == "title":
            self.in_title = False

    def handle_data(self, data):
        if self.in_title:
            self.title += data
        elif not self.depth:
            self.words += len(data.split())


def read_page(html):
    reader = PageReader()
    try:
        reader.feed(html)
    except Exception:
        pass
    return reader


def directives(reader, headers):
    values = list(reader.meta_robots)
    if headers:
        values += [v.lower() for v in headers.get_all("X-Robots-Tag") or []]
    joined = ",".join(values)
    return {
        "noindex": "noindex" in joined or "none" in re.split(r"[,\s]+", joined),
        "nosnippet": "nosnippet" in joined,
        "raw": values,
    }


def looks_blocked(status, body):
    if status is None:
        return True
    if status in (401, 403, 429, 503):
        return True
    sample = body[:20000].lower()
    return any(marker in sample for marker in CHALLENGE_MARKERS)


# --- report -----------------------------------------------------------------

def check(url, robots_cache):
    parsed = urllib.parse.urlsplit(url)
    origin = f"{parsed.scheme}://{parsed.netloc}"
    robots = robots_for(origin, robots_cache)

    browser_status, browser_headers, browser_body, browser_error = fetch(url, BROWSER_UA)
    reader = read_page(browser_body)
    page = {
        "url": url,
        "browser_status": browser_status,
        "browser_error": browser_error,
        "title": reader.title.strip()[:120],
        "canonical": reader.canonical,
        "visible_words_raw_html": reader.words,
        "script_tags": reader.scripts,
        "likely_client_rendered": reader.words < 150 and reader.scripts >= 5,
        **directives(reader, browser_headers),
        "robots_txt": {"status": robots["status"], "note": robots["note"]},
        "crawlers": [],
    }
    browser_blocked = looks_blocked(browser_status, browser_body)

    for token, purpose, user_agent in CRAWLERS:
        allowed = None if robots["groups"] is None else is_allowed(robots["groups"], token, url)
        entry = {"crawler": token, "purpose": purpose, "robots": allowed}
        if user_agent:
            status, _, body, error = fetch(url, user_agent)
            entry["status"] = status if not error else error
            entry["firewall_suspect"] = looks_blocked(status, body) and not browser_blocked
        page["crawlers"].append(entry)
    return page


def print_page(page):
    print(f"\n== {page['url']}")
    if page["browser_error"]:
        print(f"   browser fetch failed: {page['browser_error']}")
    else:
        print(f"   browser status {page['browser_status']}  title: {page['title'] or '(none)'}")
    print(f"   robots.txt: {page['robots_txt']['note']}")
    flags = []
    if page["noindex"]:
        flags.append("NOINDEX")
    if page["nosnippet"]:
        flags.append("NOSNIPPET (hidden from AI Overviews/AI Mode)")
    if page["likely_client_rendered"]:
        flags.append("LIKELY CLIENT-RENDERED (little text in raw HTML)")
    print(f"   raw HTML: {page['visible_words_raw_html']} visible words, {page['script_tags']} script tags")
    if page["canonical"]:
        print(f"   canonical: {page['canonical']}")
    for flag in flags:
        print(f"   ! {flag}")
    print(f"   {'crawler':<20}{'robots.txt':<12}{'fetch':<10}{'purpose'}")
    for c in page["crawlers"]:
        robots = {True: "allowed", False: "BLOCKED", None: "unknown"}[c["robots"]]
        if "status" not in c:
            fetched = "token"
        elif c.get("firewall_suspect"):
            fetched = f"{c['status']}!"
        else:
            fetched = str(c["status"])
        print(f"   {c['crawler']:<20}{robots:<12}{fetched:<10}{c['purpose']}")


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("urls", nargs="+")
    parser.add_argument("--json", action="store_true", help="print JSON instead of a table")
    args = parser.parse_args()

    cache = {}
    pages = []
    for url in args.urls:
        if not re.match(r"^https?://", url):
            url = "https://" + url
        pages.append(check(url, cache))

    if args.json:
        json.dump(pages, sys.stdout, indent=2)
        print()
        return
    for page in pages:
        print_page(page)
    print(
        "\nNotes: 'token' rows are robots.txt product tokens with no crawler of their own."
        "\n'!' after a status means the crawler user agent was refused while a browser was not:"
        "\na firewall rule, or bot verification rejecting a spoofed user agent. Confirm in CDN"
        "\nsettings or server logs before calling it a block."
    )


if __name__ == "__main__":
    main()
