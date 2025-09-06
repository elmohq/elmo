"use client";

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@elmo/ui/components/sidebar";
import { ExternalLink, FileText, Github } from "lucide-react";
import { getAppConfig } from "@/lib/adapters";

export function NavLinks() {
  const { navigation } = getAppConfig();

  // Don't show if links are disabled
  if (!navigation.showLinks || navigation.links.length === 0) {
    return null;
  }

  const getIcon = (title: string) => {
    switch (title.toLowerCase()) {
      case "docs":
        return FileText;
      case "github":
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
                  className="flex w-full cursor-pointer items-center gap-2"
                  href={link.url}
                  rel={link.external ? "noopener noreferrer" : undefined}
                  target={link.external ? "_blank" : "_self"}
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
