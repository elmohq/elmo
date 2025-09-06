'use client';

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@workspace/ui/components/breadcrumb';
import { usePathname } from 'next/navigation';
import React from 'react';

// Helper function to format breadcrumb labels
function formatBreadcrumbLabel(segment: string): string {
  // Handle special cases
  if (segment === 'default') return 'Dashboard';
  if (segment === 'organization-members') return 'Members';
  if (segment === 'organization-billing') return 'Billing';

  // Convert kebab-case or snake_case to Title Case
  return segment.replace(/[-_]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

// Helper function to build breadcrumb items
function buildBreadcrumbItems(pathname: string, listName?: string, userName?: string) {
  const segments = pathname.split('/').filter(Boolean);
  const items = [];

  // Build path segments
  let currentPath = '';
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];

    currentPath += `/${segment}`;
    const isLast = i === segments.length - 1;

    let label: string;
    let href = currentPath;

    label = formatBreadcrumbLabel(segment || '');

    items.push({
      label,
      href,
      isCurrent: isLast,
    });
  }

  return items;
}

export function DynamicBreadcrumbs() {
  const pathname = usePathname();
  const breadcrumbItems = buildBreadcrumbItems(pathname);

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {breadcrumbItems.map((item, index) => (
          <React.Fragment key={item.href}>
            <BreadcrumbItem className="hidden md:block">
              {item.isCurrent ? (
                <BreadcrumbPage>{item.label}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink href={item.href}>{item.label}</BreadcrumbLink>
              )}
            </BreadcrumbItem>
            {index < breadcrumbItems.length - 1 && (
              <BreadcrumbSeparator className="hidden md:block" />
            )}
          </React.Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
