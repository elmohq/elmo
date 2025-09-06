'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getAppConfig } from '@/lib/adapters';
import { useOrganizations } from '@/hooks/use-organizations';
import { Logo } from "@/components/logo";

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
      <div className="flex items-center justify-center min-h-screen">
        <Logo />
      </div>
    );
  }

  // If organizations are enabled, show the original home page content
  return (
    <div><Logo /><p>todo implement page contents</p></div>
  );
}
