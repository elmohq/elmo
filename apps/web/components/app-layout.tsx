'use client';

import { AppSidebar } from '@/components/app-sidebar';
import { DynamicBreadcrumbs } from '@/components/dynamic-breadcrumbs';
import { Separator } from '@workspace/ui/components/separator';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@workspace/ui/components/sidebar';
import { useOrganizations } from '@/hooks/use-organizations';
import { getAppConfig } from '@/lib/adapters';

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { features } = getAppConfig();
  
  // Always call hooks at the top level - never conditionally
  const { hasOrganizations, isLoaded, currentOrganization } = useOrganizations();
  
  // Only use organization logic if organizations are enabled
  if (features.organizations) {
    // Show loading state while checking organizations
    if (!isLoaded) {
      return (
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Loading...</p>
          </div>
        </div>
      );
    }

    // Show organization setup if user has no organizations (only for auth-enabled versions)
    if (!hasOrganizations && features.auth) {
      return (
        <div className="flex min-h-screen items-center justify-center p-4">
          <div className="w-full max-w-lg">
            <div className="text-center">
              <h1 className="text-2xl font-bold mb-4">Create an Organization</h1>
              <p className="text-muted-foreground mb-8">
                You need to create or join an organization to continue.
              </p>
              {/* Organization creation UI would go here */}
              <div className="p-8 border rounded-lg">
                <p>Organization setup UI placeholder</p>
              </div>
            </div>
          </div>
        </div>
      );
    }
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
            <DynamicBreadcrumbs />
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
