"use client";

import { ClerkProvider } from "@clerk/nextjs";
import type React from "react";

export function AuthWrapper({ children }: { children: React.ReactNode }) {
  return <ClerkProvider>{children}</ClerkProvider>;
}
