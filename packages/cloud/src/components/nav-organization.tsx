"use client";

import { Protect, useClerk, useOrganizationList } from "@clerk/nextjs";
import { Alert, AlertDescription } from "@elmo/ui/components/alert";
import { Separator } from "@elmo/ui/components/separator";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@elmo/ui/components/sidebar";
import { CircleDollarSign, Repeat, Settings, Users } from "lucide-react";

export function NavOrganization() {
  const { openOrganizationProfile } = useClerk();
  const { setActive } = useOrganizationList();

  const handleSettingsClick = () => {
    openOrganizationProfile();
  };

  const handleMembersClick = () => {
    openOrganizationProfile({
      __experimental_startPath: "/organization-members",
    });
  };

  const handleBillingClick = () => {
    openOrganizationProfile({
      __experimental_startPath: "/organization-billing",
    });
  };

  const switchOrganization =
    setActive === undefined ? null : (
      <SidebarMenuItem>
        <SidebarMenuButton onClick={() => setActive({ organization: null })}>
          <div className="flex w-full cursor-pointer items-center gap-2">
            <Repeat className="size-4" />
            <span>Switch</span>
          </div>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );

  const switchOrganizationWarning =
    setActive === undefined ? null : (
      <>
        <Separator className="my-2" />
        <button
          className="cursor-pointer font-bold"
          onClick={() => setActive({ organization: null })}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setActive({ organization: null });
            }
          }}
          type="button"
        >
          Switch Organization
        </button>
      </>
    );

  const warning = (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Organization</SidebarGroupLabel>
      <Alert>
        <AlertDescription className="text-xs">
          You're on the limited free plan. Contact your organization admin to
          upgrade for full access.
          {switchOrganizationWarning}
        </AlertDescription>
      </Alert>
    </SidebarGroup>
  );

  return (
    <Protect
      condition={(has) =>
        has({ role: "org:admin" }) || has({ feature: "paid" })
      }
      fallback={warning}
    >
      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
        <SidebarGroupLabel>Organization</SidebarGroupLabel>
        <SidebarMenu>
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
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleBillingClick}>
              <div className="flex w-full cursor-pointer items-center gap-2">
                <CircleDollarSign className="size-4" />
                <span>Billing</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
          {switchOrganization}
        </SidebarMenu>
      </SidebarGroup>
    </Protect>
  );
}
