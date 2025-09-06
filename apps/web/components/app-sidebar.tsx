"use client";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from "@elmo/ui/components/sidebar";
import {
  IconDashboard,
  IconListDetails,
  IconSettings,
} from "@tabler/icons-react";
import Link from "next/link";
import type * as React from "react";
import { NavMain } from "@/components/nav-main";
import { useOrganizations } from "@/hooks/use-organizations";
import { getAppConfig } from "@/lib/adapters";
import { Logo } from "./logo";
import { NavAccount } from "./nav-account";
import { NavLinks } from "./nav-links";
import { NavOrgSwitcher } from "./nav-org-switcher";
import { NavOrganization } from "./nav-organization";
import { SubscriptionStatus } from "./subscription-status";

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
    ? currentOrganization?.slug || "default"
    : "default";

  const navData = getNavData(orgSlug);
  const homeUrl = `/${orgSlug}`;

  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader>
        <Link className="p-2 pb-0" href={homeUrl}>
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
      {features.organizations && (
        <SidebarFooter>
          <NavOrgSwitcher />
        </SidebarFooter>
      )}
    </Sidebar>
  );
}
