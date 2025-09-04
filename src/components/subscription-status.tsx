'use client';

import { getAppConfig } from '@/lib/adapters';
import { SidebarGroup } from '@/components/ui/sidebar';

export function SubscriptionStatus() {
  const { features } = getAppConfig();

  // Only show subscription status if billing is enabled
  if (!features.billing) {
    return null;
  }

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      {/* Subscription status will be implemented when billing is added */}
    </SidebarGroup>
  );
}
