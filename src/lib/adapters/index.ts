import { NoAuthAdapter, NoAuthProvider } from "./no-auth";
import type { AppConfig } from "./types";

export function getAppConfig(): AppConfig {
  return {
    features: {
      auth: false,
      billing: false,
      organizations: false,
    },
    adapters: {
      auth: new NoAuthAdapter(),
    },
    providers: {
      auth: NoAuthProvider,
    },
  };
}

export * from "./types";
