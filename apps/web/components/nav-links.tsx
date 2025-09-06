'use client';

import { ExternalLink, FileText, Github } from 'lucide-react';
import { getAppConfig } from '@/lib/adapters';
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@elmo/ui/components/sidebar';

export function NavLinks() {
  const { navigation } = getAppConfig();

  // Don't show if links are disabled
  if (!navigation.showLinks || navigation.links.length === 0) {
    return null;
  }

  const getIcon = (title: string) => {
    switch (title.toLowerCase()) {
      case 'docs':
        return FileText;
      case 'github':
        return Github;
      default:
        return ExternalLink;
    }
  };

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Links</SidebarGroupLabel>
      <SidebarMenu>
        {navigation.links.map((link) => {
          const Icon = getIcon(link.title);
          
          return (
            <SidebarMenuItem key={link.title}>
              <SidebarMenuButton asChild>
                <a 
                  href={link.url}
                  target={link.external ? "_blank" : "_self"}
                  rel={link.external ? "noopener noreferrer" : undefined}
                  className="flex items-center gap-2 w-full cursor-pointer"
                >
                  <Icon className="size-4" />
                  <span>{link.title}</span>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}
