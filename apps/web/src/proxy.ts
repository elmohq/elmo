import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-auth";
import { getDeploymentConfig, getAuth0Client } from "@/lib/config";

/**
 * Demo mode error response
 */
const DEMO_MODE_ERROR = {
  error: "Demo Mode",
  message: "Write operations are disabled in demo mode",
};

/**
 * Admin panel disabled error response
 */
const ADMIN_PANEL_DISABLED_ERROR = {
  error: "Admin Panel Disabled",
  message: "Admin panel is not available in this deployment mode",
};

/**
 * Admin read-only error response
 */
const ADMIN_READONLY_ERROR = {
  error: "Admin Read-Only",
  message: "Admin write operations are disabled in this deployment mode",
};

/**
 * Write HTTP methods that should be blocked in read-only modes
 */
const WRITE_METHODS = ["POST", "PUT", "PATCH", "DELETE"];

/**
 * Main proxy for the application (Next.js 16+ uses proxy.ts instead of middleware.ts)
 * 
 * Handles:
 * 1. Read-only mode write blocking - blocks all POST/PUT/PATCH/DELETE on /api/* routes
 * 2. Admin panel access control (disabled, readonly, or full)
 * 3. Public API documentation access
 * 4. Admin API key authentication for /api/v1/* routes
 * 5. Auth provider-specific session handling
 */
export async function proxy(request: NextRequest) {
  try {
    const { pathname } = request.nextUrl;
    const deploymentConfig = getDeploymentConfig();
    const isWriteMethod = WRITE_METHODS.includes(request.method);

    // Read-only mode: Block all write requests to API routes
    if (deploymentConfig.features.readOnly) {
      const isApiRoute = pathname.startsWith("/api/");
      
      if (isApiRoute && isWriteMethod) {
        return NextResponse.json(DEMO_MODE_ERROR, { status: 403 });
      }
    }

    // Handle admin panel access control
    const adminAccess = deploymentConfig.features.adminAccess;
    const isAdminRoute = pathname.startsWith("/admin");
    const isAdminApiRoute = pathname.startsWith("/api/admin");
    
    if (isAdminRoute || isAdminApiRoute) {
      // Admin panel completely disabled
      if (adminAccess === false) {
        if (isAdminRoute) {
          return NextResponse.redirect(new URL("/", request.url));
        }
        return NextResponse.json(ADMIN_PANEL_DISABLED_ERROR, { status: 403 });
      }
      
      // Admin panel read-only - block write operations
      if (adminAccess === "readonly" && isAdminApiRoute && isWriteMethod) {
        return NextResponse.json(ADMIN_READONLY_ERROR, { status: 403 });
      }
    }

    // Allow public access to API documentation (all modes)
    if (pathname.startsWith("/api/v1/docs") || pathname.startsWith("/api/v1/openapi.json")) {
      return NextResponse.next();
    }

    // Handle /api/v1/* routes with API key authentication (admin API - all modes)
    if (pathname.startsWith("/api/v1/")) {
      const authError = requireAdminAuth(request);
      if (authError) return authError;
      return NextResponse.next();
    }

    // For local/demo modes, allow all requests (no session-based auth)
    if (deploymentConfig.mode === "local" || deploymentConfig.mode === "demo") {
      return NextResponse.next();
    }

    // Whitelabel mode: Handle Auth0 session-based authentication
    if (deploymentConfig.mode === "whitelabel") {
      const auth0 = getAuth0Client();
      if (!auth0) {
        console.error("Auth0 client not available in whitelabel mode");
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
      }
      
      const session = await auth0.getSession(request);
      
      if (!session) {
        // No session - handle based on path
        if (pathname.startsWith("/auth")) {
          // Auth routes are handled by Auth0
          return auth0.middleware(request);
        } else if (pathname.startsWith("/api")) {
          // API routes require authentication
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        } else {
          // Other routes redirect to home
          return NextResponse.redirect(new URL("/", request.url));
        }
      } else {
        // Has session - let Auth0 middleware handle it
        return auth0.middleware(request);
      }
    }

    // Default: allow request
    return NextResponse.next();
  } catch (error) {
    // Handle JWE decryption errors (corrupted sessions) - Auth0 specific
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
  matcher: ["/app/:path*", "/admin/:path*", "/reports/:path*", "/auth/:path*", "/api/:path*"],
};
