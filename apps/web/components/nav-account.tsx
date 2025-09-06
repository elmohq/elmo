"use client";

import type { User as UserType } from "@elmo/shared/lib/adapters/types";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@elmo/ui/components/avatar";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@elmo/ui/components/sidebar";
import { LogOut, User } from "lucide-react";
import { useEffect, useState } from "react";
import { getAppConfig } from "@/lib/adapters";

export function NavAccount() {
  const { features, adapters } = getAppConfig();
  const [user, setUser] = useState<UserType | null>(null);

  useEffect(() => {
    const loadUser = async () => {
      if (features.auth) {
        const currentUser = await adapters.auth.getCurrentUser();
        setUser(currentUser);
      }
    };
    loadUser();
  }, [features.auth, adapters.auth]);

  const handleUserProfileClick = () => {
    // This would open user profile management
    // Implementation depends on the auth provider
  };

  const handleSignOutClick = async () => {
    if (features.auth) {
      await adapters.auth.signOut();
    }
  };

  // Don't show account section if auth is disabled
  if (!features.auth) {
    return null;
  }

  const userEmail = user?.email || "Loading...";
  const userImageUrl = user?.imageUrl;

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Account</SidebarGroupLabel>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton onClick={handleUserProfileClick}>
            <div className="flex w-full cursor-pointer items-center gap-2">
              <Avatar className="size-4">
                <AvatarImage alt={userEmail} src={userImageUrl} />
                <AvatarFallback className="text-xs">
                  <User />
                </AvatarFallback>
              </Avatar>
              <span>{userEmail}</span>
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
        {/* Terms and Privacy links are only shown in cloud version */}
        <SidebarMenuItem>
          <SidebarMenuButton onClick={handleSignOutClick}>
            <div className="flex w-full cursor-pointer items-center gap-2">
              <LogOut className="size-4" />
              <span>Sign Out</span>
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  );
}
