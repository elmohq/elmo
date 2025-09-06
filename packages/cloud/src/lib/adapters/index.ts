import type { AppConfig } from "@elmo/shared/lib/adapters/types";
import { ClerkAuthAdapter } from "./clerk-auth";
import { ClerkAuthProvider } from "./clerk-provider";
import { ClerkOrgAdapter } from "./clerk-org-adapter";

export function getAppConfig(): AppConfig {
  return {
    features: {
      auth: true,
      billing: false, // TODO: Add billing later
      organizations: true, // Enable organizations with Clerk
    },
    navigation: {
      showLinks: false, // Don't show links in cloud version
      links: [],
    },
    adapters: {
      auth: new ClerkAuthAdapter(),
      organization: new ClerkOrgAdapter(),
    },
    providers: {
      auth: ClerkAuthProvider,
    },
  };
}
