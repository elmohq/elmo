import { NoAuthAdapter, NoAuthProvider } from "./no-auth";
import { NoOrgAdapter } from "./no-org";
import type { AppConfig } from "@elmo/shared/lib/adapters/types";

// Create singleton instances to prevent infinite re-renders
const authAdapter = new NoAuthAdapter();
const organizationAdapter = new NoOrgAdapter();

export function getAppConfig(): AppConfig {
  return {
    features: {
      auth: false,
      billing: false,
      organizations: false,
    },
    navigation: {
      showLinks: true,
      links: [
        {
          title: 'Docs',
          url: 'https://docs.elmohq.com',
          external: true,
        },
        {
          title: 'GitHub',
          url: 'https://github.com/elmohq/elmo',
          external: true,
        },
      ],
    },
    adapters: {
      auth: authAdapter,
      organization: organizationAdapter,
    },
    providers: {
      auth: NoAuthProvider,
    },
  };
}
