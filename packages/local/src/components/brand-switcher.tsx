"use client";

/**
 * BrandSwitcher stub for local mode
 * 
 * In local mode, there's only one organization, so we redirect immediately.
 * This component should never actually render - the page should redirect before showing it.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export interface Organization {
  id: string;
  name: string;
}

export interface BrandSwitcherProps {
  organizations: Organization[];
  title?: string;
  subtitle?: string;
}

export function BrandSwitcher({ organizations }: BrandSwitcherProps) {
  const router = useRouter();
  
  useEffect(() => {
    // In local mode, redirect to the first (and only) organization
    if (organizations.length > 0) {
      router.replace(`/app/${organizations[0].id}`);
    }
  }, [organizations, router]);
  
  // Show nothing while redirecting
  return null;
}

export default BrandSwitcher;
