/**
 * OG Image Generation E2E Tests
 *
 * `/api/og` renders social-share preview images with Takumi's production
 * renderer. The E2E Docker build enables Sentry's Vite integration with fake
 * credentials, so this catches failures at the Sentry + Nitro boundary.
 * It's a public route (social crawlers fetch it, unauthenticated) referenced
 * from every page's `og:image` meta tag (see apps/web src/routes/__root.tsx).
 *
 * Nothing else in the E2E suite fetches this route — a browser sets the
 * `og:image` meta tag but never requests it, so a bare page load can't catch a
 * broken renderer. These tests exercise the route directly so that a Takumi
 * bundling regression in the standalone Docker image fails CI here instead of
 * silently shipping blank social cards.
 */
import { test, expect } from "@playwright/test";

// PNG files start with this 8-byte signature.
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

test.describe("OG Image - /api/og", () => {
  test("renders a PNG for a titled page", async ({ request }) => {
    const response = await request.get(
      `/api/og?title=Elmo&description=AI%20Search%20Optimization`,
    );

    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/png");

    const body = await response.body();
    // A real render is a non-trivial PNG; a crashed/blank response is not.
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
