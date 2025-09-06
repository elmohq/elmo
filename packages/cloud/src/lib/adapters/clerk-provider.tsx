"use client";

import {
  ClerkProvider,
  SignIn as ClerkSignIn,
  UserButton as ClerkUserButton,
  useAuth as useClerkAuth,
  useUser,
} from "@clerk/nextjs";
import type { AuthProvider } from "@elmo/shared/lib/adapters/types";
import type React from "react";

function useAuthHook() {
  const { isLoaded, userId } = useClerkAuth();
  const { user: clerkUser } = useUser();

  const user = clerkUser
    ? {
        id: clerkUser.id,
        email: clerkUser.emailAddresses[0]?.emailAddress || "",
        name: clerkUser.fullName || clerkUser.firstName || "User",
        imageUrl: clerkUser.imageUrl,
      }
    : null;

  return { user, isLoaded };
}

function ClerkAuthProviderComponent({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ClerkProvider>{children}</ClerkProvider>;
}

function ClerkSignInComponent() {
  return <ClerkSignIn />;
}

function ClerkUserButtonComponent() {
  return <ClerkUserButton />;
}

export const ClerkAuthProvider: AuthProvider = {
  Provider: ClerkAuthProviderComponent,
  useAuth: useAuthHook,
  SignIn: ClerkSignInComponent,
  UserButton: ClerkUserButtonComponent,
};
