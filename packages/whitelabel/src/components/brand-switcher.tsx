/**
 * Brand Switcher component for whitelabel mode
 * 
 * This component displays a list of organizations the user has access to.
 * It relies on Auth0 app_metadata for organization data.
 */

import { Button } from "@workspace/ui/components/button";
import Link from "next/link";

export interface Organization {
  id: string;
  name: string;
}

export interface BrandSwitcherProps {
  /** List of organizations to display */
  organizations: Organization[];
  /** Optional title override */
  title?: string;
  /** Optional subtitle override */
  subtitle?: string;
}

export function BrandSwitcher({ 
  organizations, 
  title = "Brand Switcher", 
  subtitle = "Select a brand to get started" 
}: BrandSwitcherProps) {
  return (
    <div className="flex flex-col space-y-3">
      {organizations.length > 0 ? (
        organizations.map((org) => (
          <Button key={org.id} asChild variant="secondary" className="min-w-[200px]">
            <Link href={`/app/${org.id}`}>{org.name}</Link>
          </Button>
        ))
      ) : (
        <p className="text-muted-foreground text-center">No brands available</p>
      )}
    </div>
  );
}

export default BrandSwitcher;
