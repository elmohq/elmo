'use client';

import { User, LogOut, FileText, Shield } from 'lucide-react';
import Link from 'next/link';
import { getAppConfig } from '@/lib/adapters';
import { useState, useEffect } from 'react';
import type { User as UserType } from '@/lib/adapters/types';

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@workspace/ui/components/sidebar';
import { Avatar, AvatarImage, AvatarFallback } from '@workspace/ui/components/avatar';

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

  const userEmail = user?.email || 'Loading...';
  const userImageUrl = user?.imageUrl;

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Account</SidebarGroupLabel>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton onClick={handleUserProfileClick}>
            <div className="flex items-center gap-2 w-full cursor-pointer">
              <Avatar className="size-4">
                <AvatarImage src={userImageUrl} alt={userEmail} />
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
            <div className="flex items-center gap-2 w-full cursor-pointer">
              <LogOut className="size-4" />
              <span>Sign Out</span>
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  );
}
