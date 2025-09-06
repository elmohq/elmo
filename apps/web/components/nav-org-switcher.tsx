import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@elmo/ui/components/avatar";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@elmo/ui/components/sidebar";
import Link from "next/link";
import { useOrganizations } from "@/hooks/use-organizations";
import { getAppConfig } from "@/lib/adapters";

export function NavOrgSwitcher() {
  const { currentOrganization } = useOrganizations();
  const { features } = getAppConfig();

  // When orgs are disabled, always use 'default' as the slug
  const orgSlug = features.organizations
    ? currentOrganization?.slug || "default"
    : "default";

  // Always use org-based link
  const orgLink = `/${orgSlug}`;

  // todo: should launch org switcher, not link to dashboard

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton asChild size="lg">
          <Link href={orgLink}>
            <div className="m-1 ml-0 flex w-full cursor-pointer items-center gap-2 rounded-lg p-2 pl-0 transition-colors hover:bg-accent hover:text-accent-foreground">
              <Avatar className="size-9 rounded-md border">
                <AvatarImage
                  alt={currentOrganization?.name}
                  src={currentOrganization?.imageUrl}
                />
                <AvatarFallback className="rounded-md">
                  {currentOrganization?.name?.charAt(0)?.toUpperCase() || "P"}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">
                  {currentOrganization?.name || "Personal"}
                </span>
                <span className="truncate text-xs">
                  {currentOrganization ? "Organization" : "Workspace"}
                </span>
              </div>
            </div>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
