import Link from "next/link";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@elmo/ui/components/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@elmo/ui/components/avatar";
import { useOrganizations } from "@/hooks/use-organizations";
import { getAppConfig } from "@/lib/adapters";

export function NavOrgSwitcher() {
    const { currentOrganization } = useOrganizations();
    const { features } = getAppConfig();

    // When orgs are disabled, always use 'default' as the slug
    const orgSlug = features.organizations 
        ? (currentOrganization?.slug || 'default')
        : 'default';

    // Always use org-based link
    const orgLink = `/${orgSlug}`;

    // todo: should launch org switcher, not link to dashboard

    return (
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href={orgLink}>
                <div className="flex items-center gap-2 m-1 cursor-pointer rounded-lg p-2 pl-0 ml-0 hover:bg-accent hover:text-accent-foreground transition-colors w-full">
                  <Avatar className="size-9 rounded-md border">
                    <AvatarImage 
                      src={currentOrganization?.imageUrl} 
                      alt={currentOrganization?.name}
                    />
                    <AvatarFallback className="rounded-md">
                      {currentOrganization?.name?.charAt(0)?.toUpperCase() || 'P'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">
                      {currentOrganization?.name || 'Personal'}
                    </span>
                    <span className="truncate text-xs">
                      {currentOrganization ? 'Organization' : 'Workspace'}
                    </span>
                  </div>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
    )    
}
