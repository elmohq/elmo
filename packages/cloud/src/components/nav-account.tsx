"use client";

import { useClerk, useUser } from "@clerk/nextjs";
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
import { FileText, LogOut, Shield, User } from "lucide-react";

export function NavAccount() {
  const { user } = useUser();
  const { openUserProfile, signOut } = useClerk();

  const userEmail = user?.emailAddresses?.[0]?.emailAddress || "Loading...";
  const userImageUrl = user?.imageUrl;

  const handleUserProfileClick = () => {
    openUserProfile();
  };

  const handleSignOutClick = () => {
    signOut();
  };

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
        <SidebarMenuItem>
          <SidebarMenuButton asChild>
            <a
              className="flex w-full cursor-pointer items-center gap-2"
              href="https://www.elmohq.com/terms"
              rel="noopener noreferrer"
              target="_blank"
            >
              <FileText className="size-4" />
              <span>Terms of Service</span>
            </a>
          </SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuButton asChild>
            <a
              className="flex w-full cursor-pointer items-center gap-2"
              href="https://www.elmohq.com/privacy"
              rel="noopener noreferrer"
              target="_blank"
            >
              <Shield className="size-4" />
              <span>Privacy Policy</span>
            </a>
          </SidebarMenuButton>
        </SidebarMenuItem>
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
