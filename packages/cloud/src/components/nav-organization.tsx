'use client';

import { CircleDollarSign, Users, Settings, Repeat } from 'lucide-react';
import { Protect, useClerk, useOrganizationList } from '@clerk/nextjs';
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@elmo/ui/components/sidebar';

import { Separator } from '@elmo/ui/components/separator';
import { Alert, AlertDescription } from '@elmo/ui/components/alert';

export function NavOrganization() {
  const { openOrganizationProfile } = useClerk();
  const { setActive } = useOrganizationList();

  const handleSettingsClick = () => {
    openOrganizationProfile();
  };

  const handleMembersClick = () => {
    openOrganizationProfile({ __experimental_startPath: '/organization-members' });
  };

  const handleBillingClick = () => {
    openOrganizationProfile({ __experimental_startPath: '/organization-billing' });
  };

  const switchOrganization =
    setActive === undefined ? (
      <></>
    ) : (
      <SidebarMenuItem>
        <SidebarMenuButton onClick={() => setActive({ organization: null })}>
          <div className="flex items-center gap-2 w-full cursor-pointer">
            <Repeat className="size-4" />
            <span>Switch</span>
          </div>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );

  const switchOrganizationWarning =
    setActive === undefined ? (
      <></>
    ) : (
      <>
        <Separator className="my-2" />
        <button
          type="button"
          className="cursor-pointer font-bold"
          onClick={() => setActive({ organization: null })}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setActive({ organization: null });
            }
          }}
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
          You're on the limited free plan. Contact your organization admin to upgrade for full
          access.
          {switchOrganizationWarning}
        </AlertDescription>
      </Alert>
    </SidebarGroup>
  );

  return (
    <Protect
      condition={(has: any) => has({ role: 'org:admin' }) || has({ feature: 'paid' })}
      fallback={warning}
    >
      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
        <SidebarGroupLabel>Organization</SidebarGroupLabel>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleSettingsClick}>
              <div className="flex items-center gap-2 w-full cursor-pointer">
                <Settings className="size-4" />
                <span>Settings</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleMembersClick}>
              <div className="flex items-center gap-2 w-full cursor-pointer">
                <Users className="size-4" />
                <span>Members</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleBillingClick}>
              <div className="flex items-center gap-2 w-full cursor-pointer">
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
