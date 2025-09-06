"use client";

import { Alert, AlertDescription } from "@elmo/ui/components/alert";
import { Separator } from "@elmo/ui/components/separator";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@elmo/ui/components/sidebar";
import {
  AlertTriangle,
  CircleDollarSign,
  Repeat,
  Settings,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useOrganizations } from "@/hooks/use-organizations";
import { getAppConfig } from "@/lib/adapters";

export function NavOrganization() {
  const { features } = getAppConfig();
  const {
    canManageOrganization,
    switchOrganization,
    organizations,
    openOrganizationProfile,
    openCreateOrganization,
  } = useOrganizations();

  // Don't show if organizations are not enabled
  if (!features.organizations) {
    return null;
  }

  const handleSettingsClick = () => {
    if (openOrganizationProfile) {
      openOrganizationProfile();
    }
  };

  const handleMembersClick = () => {
    if (openOrganizationProfile) {
      openOrganizationProfile();
    }
  };

  const handleBillingClick = () => {
    if (openOrganizationProfile) {
      openOrganizationProfile();
    }
  };

  const handleSwitchOrganization = () => {
    if (openCreateOrganization) {
      openCreateOrganization();
    }
  };

  const switchOrganizationButton =
    organizations.length > 1 ? (
      <SidebarMenuItem>
        <SidebarMenuButton onClick={handleSwitchOrganization}>
          <div className="flex w-full cursor-pointer items-center gap-2">
            <Repeat className="size-4" />
            <span>Switch</span>
          </div>
        </SidebarMenuButton>
      </SidebarMenuItem>
    ) : null;

  // Show limited functionality warning for non-admin users
  if (!canManageOrganization && features.auth) {
    return (
      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
        <SidebarGroupLabel>Organization</SidebarGroupLabel>
        <Alert>
          <AlertDescription className="text-xs">
            You're on the limited free plan. Contact your organization admin to
            upgrade for full access.
            {switchOrganizationButton && (
              <>
                <Separator className="my-2" />
                <button
                  className="cursor-pointer font-bold"
                  onClick={handleSwitchOrganization}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleSwitchOrganization();
                    }
                  }}
                  type="button"
                >
                  Switch Organization
                </button>
              </>
            )}
          </AlertDescription>
        </Alert>
      </SidebarGroup>
    );
  }

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Organization</SidebarGroupLabel>
      <SidebarMenu>
        {canManageOrganization && (
          <>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={handleSettingsClick}>
                <div className="flex w-full cursor-pointer items-center gap-2">
                  <Settings className="size-4" />
                  <span>Settings</span>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={handleMembersClick}>
                <div className="flex w-full cursor-pointer items-center gap-2">
                  <Users className="size-4" />
                  <span>Members</span>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
            {features.billing && (
              <SidebarMenuItem>
                <SidebarMenuButton onClick={handleBillingClick}>
                  <div className="flex w-full cursor-pointer items-center gap-2">
                    <CircleDollarSign className="size-4" />
                    <span>Billing</span>
                  </div>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
          </>
        )}
        {switchOrganizationButton}
      </SidebarMenu>
    </SidebarGroup>
  );
}
