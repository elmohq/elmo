"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Logo } from "@/components/logo";
import { useOrganizations } from "@/hooks/use-organizations";
import { getAppConfig } from "@/lib/adapters";

export default function Home() {
  const router = useRouter();
  const { features } = getAppConfig();
  const { currentOrganization, isLoaded } = useOrganizations();

  useEffect(() => {
    if (!features.organizations && isLoaded && currentOrganization) {
      router.replace(`/${currentOrganization.slug}`);
    }
  }, [features.organizations, isLoaded, currentOrganization, router]);

  // Show loading or fallback while redirecting
  if (!features.organizations) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Logo />
      </div>
    );
  }

  // If organizations are enabled, show the original home page content
  return (
    <div>
      <Logo />
      <p>todo implement page contents</p>
    </div>
  );
}
