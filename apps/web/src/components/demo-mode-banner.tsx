"use client";

import { getDeploymentMode } from "@/lib/config.client";
import { IconInfoCircle } from "@tabler/icons-react";

/**
 * Banner that displays when the application is running in demo mode
 * Shows a message indicating that write operations are disabled
 */
export function DemoModeBanner() {
  const mode = getDeploymentMode();
  
  // Only show in demo mode
  if (mode !== "demo") {
    return null;
  }
  
  return (
    <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2">
      <div className="container mx-auto flex items-center justify-center gap-2 text-sm text-amber-700 dark:text-amber-400">
        <IconInfoCircle className="h-4 w-4" />
        <span>
          <strong>Demo Mode</strong> — This is a read-only demo. Write operations are disabled.
        </span>
      </div>
    </div>
  );
}
