/** What the Bruno suite cannot reach: the SDK's transport, and the browser half
 * of the OAuth flow. */
import { request as playwrightRequest } from "@playwright/test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { expect, test } from "../../test";
import { API_KEYS, NIKE_BRAND_ID, TEST_API_KEY, TEST_BRAND_ID, TEST_USER } from "../../fixtures";

const MCP_PATH = "/api/mcp";

/** Nothing listens here; the code is read off the request the browser attempts. */
const SIGNED_OUT_CALLBACK = "http://127.0.0.1:41998/oauth/callback";

const WINDOW = { start: "2025-01-01T00:00:00Z", end: "2027-01-01T00:00:00Z" };

async function connect(baseURL: string, token: string) {
  const transport = new StreamableHTTPClientTransport(new URL(MCP_PATH, baseURL), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  const client = new Client({ name: "elmo-e2e", version: "1.0.0" });
  await client.connect(transport);
  return client;
}

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
    expect(client.getInstructions()).toContain("list_brands");

    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name);
    expect(names).toContain("list_brands");
    expect(names).toContain("get_analytics");

    const brands = await callTool(client, "list_brands");
    expect(brands.isError).toBe(false);
    expect(brands.json().data.map((brand: { id: string }) => brand.id)).toContain(TEST_BRAND_ID);

    const analytics = await callTool(client, "get_analytics", { brandId: TEST_BRAND_ID, ...WINDOW });
    const published = await request.get(
      `/api/v1/brands/${TEST_BRAND_ID}/analytics?start=${WINDOW.start}&end=${WINDOW.end}`,
      { headers: { Authorization: `Bearer ${API_KEYS.orgFull.token}` } },
    );
    expect(published.status()).toBe(200);
    expect(analytics.json()).toEqual(await published.json());

    await client.close();
  });

  test("a key is offered exactly the tools its scopes allow", async ({ baseURL }, testInfo) => {
    const full = await connect(baseURL!, API_KEYS.orgFull.token);
    const readOnly = await connect(baseURL!, API_KEYS.orgReadOnly.token);
    const scopeless = await connect(baseURL!, API_KEYS.orgNoScopes.token);

    const namesOf = async (client: Client) => (await client.listTools()).tools.map((tool) => tool.name);
    const fullNames = await namesOf(full);
    const readOnlyNames = await namesOf(readOnly);

    expect(readOnlyNames).toContain("list_prompts");
    expect(readOnlyNames).not.toContain("create_prompts");
    expect(readOnlyNames).not.toContain("update_prompt");
    expect(fullNames).toEqual(expect.arrayContaining(readOnlyNames));
    // A read-only deployment has already dropped both writers for every key, so
    // the lists are equal there rather than strictly ordered.
    if (testInfo.project.name === "demo") expect([...readOnlyNames].sort()).toEqual([...fullNames].sort());
    else expect(readOnlyNames.length).toBeLessThan(fullNames.length);

    expect((await namesOf(scopeless)).sort()).toEqual(["list_models", "whoami"]);

    await Promise.all([full.close(), readOnly.close(), scopeless.close()]);
  });

  test("an instance key is offered no tool a member key lacks", async ({ baseURL }) => {
    const admin = await connect(baseURL!, TEST_API_KEY);
    const member = await connect(baseURL!, API_KEYS.orgFull.token);

    const namesOf = async (client: Client) => (await client.listTools()).tools.map((t) => t.name).sort();
    expect(await namesOf(admin)).toEqual(await namesOf(member));
    for (const name of await namesOf(admin)) expect(name).not.toMatch(/^(delete_|create_(brand|organization))/);

    await Promise.all([admin.close(), member.close()]);
  });

  test("another tenant's brand reads as one that does not exist", async ({ baseURL }) => {
    const client = await connect(baseURL!, API_KEYS.orgFull.token);

    const other = await callTool(client, "get_brand", { brandId: NIKE_BRAND_ID });
    const absent = await callTool(client, "get_brand", { brandId: "no-such-brand-anywhere" });

    expect(other.isError).toBe(true);
    expect(absent.isError).toBe(true);
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

    const metadata = await request.get(new URL(challenge.match(/"([^"]+)"/)?.[1] ?? "").pathname);
    expect(metadata.status()).toBe(200);
    expect((await metadata.json()).resource).toContain(MCP_PATH);
  });

  test("the endpoint answers its own URL, and nothing below it", async ({ request }) => {
    const call = (path: string) =>
      request.post(path, {
        headers: { Accept: "application/json, text/event-stream" },
        data: { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
      });

    for (const path of [MCP_PATH, `${MCP_PATH}/`]) {
      expect((await call(path)).status(), path).toBe(401);
    }

    const below = await call(`${MCP_PATH}/anything`);
    expect(below.status()).toBe(404);
    expect((await below.json()).error.message).toBe("Not Found");
  });

  test("a person can authorize an MCP client from the browser", async ({ page, baseURL, clientHeaders }, testInfo) => {
    test.skip(
      testInfo.project.name === "demo",
      "a read-only deployment runs no OAuth flow; the Bruno demo suite asserts the refusal",
    );

    // `storageState: undefined` is load-bearing: a new context otherwise
    // inherits the project's signed-in state, which no MCP client has.
    const anonymous = await playwrightRequest.newContext({
      baseURL,
      storageState: undefined,
      extraHTTPHeaders: clientHeaders,
    });

    // A loopback redirect URI belongs to a `native` client; the server holds a
    // web client to HTTPS.
    const registration = await anonymous.post("/api/auth/oauth2/register", {
      data: {
        client_name: "Playwright MCP Client",
        redirect_uris: ["http://127.0.0.1:41999/oauth/callback"],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
        application_type: "native",
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

    const discovery = await (await anonymous.get("/.well-known/oauth-authorization-server")).json();
    await page.goto(`${new URL(discovery.authorization_endpoint).pathname}?${query}`);
    await expect(page).toHaveURL(/\/auth\/authorize\?/);
    await expect(page.getByText("Connect to Elmo")).toBeVisible();
    await expect(page.getByText("Playwright MCP Client").first()).toBeVisible();
    await expect(page.getByText("127.0.0.1:41999")).toBeVisible();

    const CALLBACK = "http://127.0.0.1:41999/oauth/callback";
    const delivered: string[] = [];
    page.on("request", (req) => {
      if (req.url().startsWith(CALLBACK)) delivered.push(req.url());
    });

    // A click before hydration is silently discarded.
    await page.waitForLoadState("networkidle");

    expect(delivered).toHaveLength(0);
    await page.getByRole("button", { name: /^Allow / }).click();
    await expect.poll(() => delivered.length).toBeGreaterThan(0);

    const callbackUrl = delivered[0];
    const callback = new URL(callbackUrl);
    expect(callback.searchParams.get("state")).toBe("playwright-state");
    const code = callback.searchParams.get("code");
    expect(code).toBeTruthy();

    // No `resource`, as a client predating RFC 8707 presents. The server names
    // its own, so a JWT still comes back.
    const token = await anonymous.post("/api/auth/oauth2/token", {
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

    const claims = JSON.parse(Buffer.from(accessToken.split(".")[1], "base64url").toString());
    expect(claims.aud).toContain(new URL(MCP_PATH, baseURL).toString());

    const client = await connect(baseURL!, accessToken);
    const identity = await callTool(client, "whoami");
    expect(identity.json().principal).toBe("oauth-session");
    expect(identity.json().email).toBe(TEST_USER.email);
    expect(identity.json().organizationIds).toContain(TEST_BRAND_ID);

    const brands = await callTool(client, "list_brands");
    expect(brands.json().data.map((brand: { id: string }) => brand.id)).toContain(TEST_BRAND_ID);
    expect((await callTool(client, "get_brand", { brandId: NIKE_BRAND_ID })).isError).toBe(true);

    await client.close();
    await anonymous.dispose();
  });
  /** The signed query has to reach the consent endpoint character for character,
   * so anything that rebuilds it on the way breaks the connection. */
  test("a person who is not signed in yet arrives at the same consent screen", async ({
    browser,
    baseURL,
    clientHeaders,
  }, testInfo) => {
    test.skip(testInfo.project.name === "demo", "a read-only deployment runs no OAuth flow");
    test.skip(testInfo.project.name === "whitelabel", "whitelabel signs in through Auth0, which this suite does not stand up");

    const anonymous = await playwrightRequest.newContext({
      baseURL,
      storageState: undefined,
      extraHTTPHeaders: clientHeaders,
    });
    const registration = await anonymous.post("/api/auth/oauth2/register", {
      data: {
        client_name: "Playwright Signed-out Client",
        redirect_uris: [SIGNED_OUT_CALLBACK],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
        application_type: "native",
      },
    });
    expect(registration.status()).toBe(201);
    const { client_id: clientId } = await registration.json();

    const verifier = "playwright-signed-out-verifier-" + "y".repeat(32);
    const query = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      redirect_uri: SIGNED_OUT_CALLBACK,
      scope: "openid profile email offline_access",
      state: "playwright-signed-out",
      code_challenge: base64Url(await sha256(verifier)),
      code_challenge_method: "S256",
    });

    const context = await browser.newContext({ storageState: undefined, extraHTTPHeaders: clientHeaders });
    const page = await context.newPage();
    const delivered: string[] = [];
    page.on("request", (req) => {
      if (req.url().startsWith(SIGNED_OUT_CALLBACK)) delivered.push(req.url());
    });

    const discovery = await (await anonymous.get("/.well-known/oauth-authorization-server")).json();
    await page.goto(`${new URL(discovery.authorization_endpoint).pathname}?${query}`);
    await expect(page).toHaveURL(/\/auth\/login\?/);

    await page.getByLabel("Email").fill(TEST_USER.email);
    await page.getByLabel("Password").fill(TEST_USER.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    await page.waitForURL(/\/auth\/authorize/);
    await expect(page.getByText("Playwright Signed-out Client").first()).toBeVisible();
    expect(delivered).toHaveLength(0);

    await page.getByRole("button", { name: /^Allow / }).click();
    await expect.poll(() => delivered.length).toBeGreaterThan(0);

    const callback = new URL(delivered[0]);
    expect(callback.searchParams.get("state")).toBe("playwright-signed-out");
    const code = callback.searchParams.get("code");
    expect(code).toBeTruthy();

    const token = await anonymous.post("/api/auth/oauth2/token", {
      form: {
        grant_type: "authorization_code",
        code: code!,
        redirect_uri: SIGNED_OUT_CALLBACK,
        client_id: clientId,
        code_verifier: verifier,
      },
    });
    expect(token.status()).toBe(200);

    const client = await connect(baseURL!, (await token.json()).access_token);
    expect((await callTool(client, "whoami")).json().email).toBe(TEST_USER.email);
    await client.close();
    await context.close();
    await anonymous.dispose();
  });
});

async function sha256(value: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
}

function base64Url(buffer: ArrayBuffer): string {
  return Buffer.from(buffer).toString("base64url");
}
