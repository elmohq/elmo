"use client";

import { useUser } from "@auth0/nextjs-auth0";
import { getDeploymentMode, requiresAuthentication } from "@/lib/config.client";

// Type for user object that works across auth providers
export interface AuthUser {
  id: string;
  name?: string;
  email?: string;
  picture?: string;
  given_name?: string;
  family_name?: string;
}

export interface UseAuthResult {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  loginUrl: string | null;
  logoutUrl: string | null;
}

/**
 * Local user for non-authenticated modes
 */
const LOCAL_USER: AuthUser = {
  id: "local-user",
  name: "Local User",
  email: "local@localhost",
  given_name: "Local",
  family_name: "User",
};

/**
 * Demo user for demo mode
 */
const DEMO_USER: AuthUser = {
  id: "demo-user",
  name: "Demo User",
  email: "demo@example.com",
  given_name: "Demo",
  family_name: "User",
};

/**
 * Hook to get current user across different auth providers
 * 
 * - In whitelabel mode: Uses Auth0's useUser hook
 * - In local mode: Returns a fixed local user
 * - In demo mode: Returns a fixed demo user
 * 
 * Note: useUser() is always called to satisfy React's rules of hooks.
 * In local/demo mode, the Auth0 result is ignored and replaced with mock users.
 */
export function useAuth(): UseAuthResult {
  // Always call useUser unconditionally (React rules of hooks)
  // In local/demo mode, this will just return { user: undefined, isLoading: false }
  const { user: auth0User, isLoading: auth0Loading } = useUser();
  
  // Get deployment mode (this is a simple sync function, not a hook)
  const mode = getDeploymentMode();
  
  // For local mode, return local user (ignore Auth0 result)
  if (mode === "local") {
    return {
      user: LOCAL_USER,
      isLoading: false,
      isAuthenticated: true,
      loginUrl: null,
      logoutUrl: null,
    };
  }
  
  // For demo mode, return demo user (ignore Auth0 result)
  if (mode === "demo") {
    return {
      user: DEMO_USER,
      isLoading: false,
      isAuthenticated: true,
      loginUrl: null,
      logoutUrl: null,
    };
  }
  
  // For whitelabel/cloud mode, use Auth0 result
  return {
    user: auth0User ? {
      id: auth0User.sub,
      name: auth0User.name,
      email: auth0User.email,
      picture: auth0User.picture,
      given_name: auth0User.given_name,
      family_name: auth0User.family_name,
    } : null,
    isLoading: auth0Loading,
    isAuthenticated: !!auth0User,
    loginUrl: "/auth/login",
    logoutUrl: "/auth/logout",
  };
}

/**
 * Check if the current deployment mode requires authentication
 */
export function requiresAuth(): boolean {
  return requiresAuthentication();
}
