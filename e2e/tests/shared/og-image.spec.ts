/**
 * A browser never fetches the `og:image` it is given, so only this catches a
 * takumi/WASM bundling break in the Docker image before it ships blank social
 * cards.
 */
import { expect, test } from "../../test";

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

test.describe("OG Image - /api/og", () => {
  test("renders a PNG for a titled page", async ({ request }) => {
    const response = await request.get(
      `/api/og?title=Elmo&description=AI%20Search%20Optimization`,
    );

    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/png");

    const body = await response.body();
    // A blank render is still a valid PNG, just a tiny one.
    expect(body.byteLength).toBeGreaterThan(1000);
    expect(body.subarray(0, 8).equals(PNG_MAGIC)).toBe(true);
  });

  test("renders the default-branding image with no params", async ({ request }) => {
    const response = await request.get(`/api/og?defaultBranding=true`);

    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/png");

    const body = await response.body();
    expect(body.byteLength).toBeGreaterThan(1000);
    expect(body.subarray(0, 8).equals(PNG_MAGIC)).toBe(true);
  });
});
