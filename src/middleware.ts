import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";

export async function middleware(request: NextRequest) {
	try {
		return await auth0.middleware(request);
	} catch (error) {
		// Handle JWE decryption errors (corrupted sessions)
		if (error instanceof Error && error.message?.includes("Invalid Compact JWE")) {
			console.warn("Session decryption failed, clearing corrupted session:", error.message);

			// Create a response that clears the session cookie
			const response = NextResponse.next();
			response.cookies.delete("appSession");
			return response;
		}

		// Re-throw other errors
		throw error;
	}
}

export const config = {
	matcher: [
		/*
		 * Match all request paths except for the ones starting with:
		 * - _next/static (static files)
		 * - _next/image (image optimization files)
		 * - favicon.ico, sitemap.xml, robots.txt (metadata files)
		 */
		"/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
	],
};
