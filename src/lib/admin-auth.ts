import { NextRequest, NextResponse } from "next/server";

/**
 * Validates admin API key from request headers
 * Checks the Authorization header for Bearer token against ADMIN_API_KEYS environment variable
 */
export function validateAdminApiKey(request: NextRequest): boolean {
	const authHeader = request.headers.get("Authorization");
	
	if (!authHeader || !authHeader.startsWith("Bearer ")) {
		return false;
	}

	const token = authHeader.substring(7); // Remove "Bearer " prefix
	
	if (!token) {
		return false;
	}

	const adminApiKeys = process.env.ADMIN_API_KEYS?.split(",") || [];
	
	if (adminApiKeys.length === 0) {
		console.warn("ADMIN_API_KEYS environment variable is not set or empty");
		return false;
	}

	return adminApiKeys.includes(token);
}

/**
 * Middleware function to authenticate admin API requests
 * Returns an error response if authentication fails, null if authenticated
 */
export function requireAdminAuth(request: NextRequest): NextResponse | null {
	if (!validateAdminApiKey(request)) {
		return NextResponse.json(
			{ 
				error: "Unauthorized", 
				message: "Valid API key required as Bearer token in Authorization header" 
			}, 
			{ status: 401 }
		);
	}
	return null;
}
