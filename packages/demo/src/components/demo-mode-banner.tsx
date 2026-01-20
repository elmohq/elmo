"use client";

import * as React from "react";

/**
 * Banner that displays when the application is running in demo mode
 * Shows a message indicating that write operations are disabled
 */
export function DemoModeBanner() {
  return (
    <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2">
      <div className="container mx-auto flex items-center justify-center gap-2 text-sm text-amber-700 dark:text-amber-400">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4" />
          <path d="M12 8h.01" />
        </svg>
        <span>
          <strong>Demo Mode</strong> — This is a read-only demo. Write operations are disabled.
        </span>
      </div>
    </div>
  );
}
