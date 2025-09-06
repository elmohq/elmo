'use client';

import type * as React from 'react';

import { NavMain } from '@/components/nav-main';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@workspace/ui/components/sidebar';
import {
	IconDashboard,
	IconListDetails,
	IconSettings,
} from "@tabler/icons-react";
import Link from 'next/link';
import { NavAccount } from './nav-account';
import { NavLinks } from './nav-links';
import { NavOrganization } from './nav-organization';
import { SubscriptionStatus } from './subscription-status';
import { Logo } from './logo';
import { getAppConfig } from '@/lib/adapters';
import { NavOrgSwitcher } from './nav-org-switcher';
import { useOrganizations } from '@/hooks/use-organizations';

const getNavData = (orgSlug: string) => ({
  navMain: [
    {
			title: "Overview",
			url: `/${orgSlug}`,
			icon: IconDashboard,
		},
		{
			title: "Prompts",
			url: `/${orgSlug}/prompts`,
			icon: IconListDetails,
		},
      {
			title: "Settings",
			url: `/${orgSlug}/settings`,
			icon: IconSettings,
		},
  ],
});

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { features } = getAppConfig();
  const { currentOrganization } = useOrganizations();
  
  // When orgs are disabled, always use 'default' as the slug
  const orgSlug = features.organizations 
    ? (currentOrganization?.slug || 'default')
    : 'default';
  
  const navData = getNavData(orgSlug);
  const homeUrl = `/${orgSlug}`;

  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader>
        <Link href={homeUrl} className="p-2 pb-0">
          <Logo />
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SubscriptionStatus />
        <NavMain items={navData.navMain} />
        <NavLinks />
        <NavOrganization />
        <NavAccount />
      </SidebarContent>
      {features.organizations && 
        <SidebarFooter>
          <NavOrgSwitcher />
        </SidebarFooter>
      }
    </Sidebar>
  );
}
