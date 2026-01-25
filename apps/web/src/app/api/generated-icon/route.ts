import { NextResponse } from "next/server";
import { clientConfig } from "@/lib/config/client";

/**
 * Dynamic icon generator for local/demo modes
 * Returns an SVG with the letter "E" in blue
 * 
 * NOT available in whitelabel mode - whitelabel must provide APP_ICON env var
 */
export async function GET() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <rect width="100" height="100" rx="20" fill="#3182ce"/>
  <text x="50" y="72" font-family="system-ui, -apple-system, sans-serif" font-size="60" font-weight="700" fill="white" text-anchor="middle">E</text>
</svg>`;

  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
