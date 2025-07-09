import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";

export async function middleware(request: NextRequest) {
	try {
		const { pathname } = request.nextUrl;
		const session = await auth0.getSession(request);
		if (!session && !pathname.startsWith("/auth/")) {
			return NextResponse.redirect(new URL("/", request.url));
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
	matcher: ["/app/:path*", "/auth/:path*", "/api/:path*"],
};
