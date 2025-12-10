import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import { requireAdminAuth } from "@/lib/admin-auth";

export async function middleware(request: NextRequest) {
	try {
		const { pathname } = request.nextUrl;

		// Allow public access to API documentation
		if (pathname.startsWith("/api/v1/docs") || pathname.startsWith("/api/v1/openapi.json")) {
			return NextResponse.next();
		}

		// Handle /api/v1/* routes with API key authentication
		if (pathname.startsWith("/api/v1/")) {
			const authError = requireAdminAuth(request);
			if (authError) return authError;
			return NextResponse.next();
		}

		const session = await auth0.getSession(request);
		if (!session) {
			if (pathname.startsWith("/auth")) {
				return auth0.middleware(request);
			} else if (pathname.startsWith("/api")) {
				return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
			} else {
				return NextResponse.redirect(new URL("/", request.url));
			}
		} else {
			return auth0.middleware(request);
		}
	} catch (error) {
		// Handle JWE decryption errors (corrupted sessions)
		if (error instanceof Error && error.message?.includes("Invalid Compact JWE")) {
			console.warn("Session decryption failed, clearing corrupted session:", error.message);

			// Create a response that clears the session cookie
			const response = NextResponse.next();
			response.cookies.delete("appSession");
		}

		// Re-throw other errors
		throw error;
	}
}

export const config = {
	matcher: ["/app/:path*", "/admin/:path*", "/reports/:path*", "/auth/:path*", "/api/:path*"],
};
