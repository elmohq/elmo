/**
 * The MCP endpoint, driven the way a real client drives it.
 *
 * The Bruno suite already covers the JSON-RPC contract by hand — who is
 * offered which tool, what a refusal looks like, what the discovery documents
 * say. Two things it structurally cannot reach are here instead:
 *
 *  - **A real MCP client.** Hand-written JSON-RPC proves our handler answers;
 *    it does not prove the official SDK's transport can negotiate a protocol
 *    version, agree on headers, and parse what comes back. A server that fails
 *    only against real clients passes every request-level test we have.
 *  - **The browser half of OAuth.** A key is pasted into a config file; a
 *    session is signed in for. The whole point of the `mcp` plugin is the
 *    second path, and every step of it before the token is a page.
 *
 * Both run against the same seeded data every other spec uses, so a number an
 * agent reads here is checked against the one the REST surface publishes.
 */
import { request as playwrightRequest } from "@playwright/test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { expect, test } from "../../test";
import { API_KEYS, NIKE_BRAND_ID, TEST_API_KEY, TEST_BRAND_ID, TEST_USER } from "../../fixtures";

const MCP_PATH = "/api/mcp";

/** Wide enough to cover the seeded runs, in the instants the API takes. */
const WINDOW = { start: "2025-01-01T00:00:00Z", end: "2027-01-01T00:00:00Z" };

/** Connect the official client to the running instance as a given key. */
async function connect(baseURL: string, token: string) {
  const transport = new StreamableHTTPClientTransport(new URL(MCP_PATH, baseURL), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  const client = new Client({ name: "elmo-e2e", version: "1.0.0" });
  await client.connect(transport);
  return client;
}

/** Every tool answers with one JSON text block; this is what is in it. */
async function callTool(client: Client, name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args });
  const [block] = (result.content ?? []) as Array<{ text?: string }>;
  const text = block?.text ?? "";
  return { isError: result.isError === true, text, json: () => JSON.parse(text) };
}

test.describe("MCP", () => {
  test("the official client can connect, list tools, and read a brand's numbers", async ({ baseURL, request }) => {
    const client = await connect(baseURL!, API_KEYS.orgFull.token);

    expect(client.getServerVersion()).toMatchObject({ name: "elmo" });
    // The instructions are the only thing telling a model where to start.
    expect(client.getInstructions()).toContain("list_brands");

    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name);
    expect(names).toContain("list_brands");
    expect(names).toContain("get_analytics");

    const brands = await callTool(client, "list_brands");
    expect(brands.isError).toBe(false);
    expect(brands.json().data.map((brand: { id: string }) => brand.id)).toContain(TEST_BRAND_ID);

    // The numbers an agent would act on, against the ones the dashboard's own
    // API publishes. Two surfaces over one computation; this is what says so.
    const analytics = await callTool(client, "get_analytics", { brandId: TEST_BRAND_ID, ...WINDOW });
    const published = await request.get(
      `/api/v1/brands/${TEST_BRAND_ID}/analytics?start=${WINDOW.start}&end=${WINDOW.end}`,
      { headers: { Authorization: `Bearer ${API_KEYS.orgFull.token}` } },
    );
    expect(published.status()).toBe(200);
    expect(analytics.json()).toEqual(await published.json());

    await client.close();
  });

  test("a key is offered exactly the tools its scopes allow", async ({ baseURL }) => {
    const full = await connect(baseURL!, API_KEYS.orgFull.token);
    const readOnly = await connect(baseURL!, API_KEYS.orgReadOnly.token);
    const scopeless = await connect(baseURL!, API_KEYS.orgNoScopes.token);

    const namesOf = async (client: Client) => (await client.listTools()).tools.map((tool) => tool.name);

    expect(await namesOf(readOnly)).toContain("list_prompts");
    expect(await namesOf(readOnly)).not.toContain("create_prompts");
    expect(await namesOf(readOnly)).not.toContain("update_prompt");
    // Not a subset by accident: the read-only key sees strictly fewer.
    expect((await namesOf(readOnly)).length).toBeLessThan((await namesOf(full)).length);
    expect((await namesOf(scopeless)).sort()).toEqual(["list_models", "whoami"]);

    await Promise.all([full.close(), readOnly.close(), scopeless.close()]);
  });

  test("an instance key is offered no tool a member key lacks", async ({ baseURL }) => {
    // An admin key reaches every workspace, but /api/mcp is the product as a
    // member has it — so the two lists have to be identical. A difference means
    // the surface grew an operation no person in the product can perform.
    const admin = await connect(baseURL!, TEST_API_KEY);
    const member = await connect(baseURL!, API_KEYS.orgFull.token);

    const namesOf = async (client: Client) => (await client.listTools()).tools.map((t) => t.name).sort();
    expect(await namesOf(admin)).toEqual(await namesOf(member));
    // And nothing on either list deletes or provisions.
    for (const name of await namesOf(admin)) expect(name).not.toMatch(/^(delete_|create_(brand|organization))/);

    await Promise.all([admin.close(), member.close()]);
  });

  test("another tenant's brand reads as one that does not exist", async ({ baseURL }) => {
    const client = await connect(baseURL!, API_KEYS.orgFull.token);

    const other = await callTool(client, "get_brand", { brandId: NIKE_BRAND_ID });
    const absent = await callTool(client, "get_brand", { brandId: "no-such-brand-anywhere" });

    expect(other.isError).toBe(true);
    expect(absent.isError).toBe(true);
    // Worded identically, so a key cannot probe for another tenant's ids.
    expect(other.text.replace(NIKE_BRAND_ID, "X")).toBe(absent.text.replace("no-such-brand-anywhere", "X"));

    await client.close();
  });

  test("a client with no credential is told where to authenticate", async ({ request }) => {
    const response = await request.post(MCP_PATH, {
      headers: { Accept: "application/json, text/event-stream" },
      data: { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
    });

    expect(response.status()).toBe(401);
    const challenge = response.headers()["www-authenticate"] ?? "";
    expect(challenge).toContain("resource_metadata=");

    // The document the challenge points at has to actually be there, or a
    // client that has never been configured has nowhere to go.
    const metadata = await request.get(new URL(challenge.match(/"([^"]+)"/)?.[1] ?? "").pathname);
    expect(metadata.status()).toBe(200);
    expect((await metadata.json()).resource).toContain(MCP_PATH);
  });

  test("a person can authorize an MCP client from the browser", async ({ page, baseURL }, testInfo) => {
    test.skip(
      testInfo.project.name === "demo",
      "a read-only deployment runs no OAuth flow; the Bruno demo suite asserts the refusal",
    );

    // A context carrying no session and no cookies. An MCP client is not a
    // browser: it holds neither, which is also what exempts it from the
    // cookie-triggered origin check on these endpoints. `storageState: undefined`
    // is load-bearing — a new context inherits the project's signed-in state
    // otherwise, and the flow would be tested as something no client ever does.
    const anonymous = await playwrightRequest.newContext({ baseURL, storageState: undefined });

    // Register the way a client does: no session, no secret, PKCE only.
    const registration = await anonymous.post("/api/auth/mcp/register", {
      data: {
        client_name: "Playwright MCP Client",
        redirect_uris: ["http://127.0.0.1:41999/oauth/callback"],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      },
    });
    expect(registration.status()).toBe(201);
    const { client_id: clientId } = await registration.json();

    const verifier = "playwright-code-verifier-" + "x".repeat(32);
    const challenge = base64Url(await sha256(verifier));
    const query = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      redirect_uri: "http://127.0.0.1:41999/oauth/callback",
      scope: "openid profile email offline_access",
      state: "playwright-state",
      code_challenge: challenge,
      code_challenge_method: "S256",
    });

    // Whatever the discovery document advertises is what a client opens, so
    // that is what this follows — asserting the page rather than the path a
    // client is never told about.
    const discovery = await (await anonymous.get("/.well-known/oauth-authorization-server")).json();
    await page.goto(`${new URL(discovery.authorization_endpoint).pathname}?${query}`);
    await expect(page).toHaveURL(/\/auth\/authorize\?/);
    await expect(page.getByText("Connect to Elmo")).toBeVisible();
    // Named, so the person knows what they are handing access to, and told
    // where the token would be delivered — the one claim a client can't forge.
    await expect(page.getByText("Playwright MCP Client").first()).toBeVisible();
    await expect(page.getByText("127.0.0.1:41999")).toBeVisible();

    // The loopback listener a real client opens is not here, so the browser's
    // final hop is refused — but the code has already left the server by then,
    // and the request Chromium attempted is what carries it.
    const CALLBACK = "http://127.0.0.1:41999/oauth/callback";
    const delivered: string[] = [];
    page.on("request", (req) => {
      if (req.url().startsWith(CALLBACK)) delivered.push(req.url());
    });

    // The button does nothing until React has hydrated, and a click that lands
    // on markup with no handler attached is silently discarded.
    await page.waitForLoadState("networkidle");

    // Nothing is issued until it is clicked: a page that bounced a signed-in
    // browser onward would hand a token to anything that could load this URL.
    await page.getByRole("button", { name: /^Allow / }).click();
    await expect.poll(() => delivered.length).toBeGreaterThan(0);

    const callbackUrl = delivered[0];
    const callback = new URL(callbackUrl);
    expect(callback.searchParams.get("state")).toBe("playwright-state");
    const code = callback.searchParams.get("code");
    expect(code).toBeTruthy();

    // Exchanged with no cookie and no Origin, exactly as a native client does.
    const token = await anonymous.post("/api/auth/mcp/token", {
      form: {
        grant_type: "authorization_code",
        code: code!,
        redirect_uri: "http://127.0.0.1:41999/oauth/callback",
        client_id: clientId,
        code_verifier: verifier,
      },
    });
    expect(token.status()).toBe(200);
    const { access_token: accessToken } = await token.json();

    const client = await connect(baseURL!, accessToken);
    const identity = await callTool(client, "whoami");
    expect(identity.json().principal).toBe("oauth-session");
    expect(identity.json().email).toBe(TEST_USER.email);
    // The person's own workspaces, re-read from membership rather than baked
    // into the token.
    expect(identity.json().organizationIds).toContain(TEST_BRAND_ID);

    const brands = await callTool(client, "list_brands");
    expect(brands.json().data.map((brand: { id: string }) => brand.id)).toContain(TEST_BRAND_ID);
    expect((await callTool(client, "get_brand", { brandId: NIKE_BRAND_ID })).isError).toBe(true);

    await client.close();
    await anonymous.dispose();
  });
});

async function sha256(value: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
}

function base64Url(buffer: ArrayBuffer): string {
  return Buffer.from(buffer).toString("base64url");
}
