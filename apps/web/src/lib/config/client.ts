/**
 * Client-safe deployment configuration
 */
import { deployment } from "@workspace/deployment";
import type { ClientConfig } from "@workspace/config/types";

let _cached: ClientConfig;

function getConfig(): ClientConfig {
  return _cached ??= deployment().createClientConfig();
}

/**
 * Client configuration singleton (lazy-initialized)
 */
export const clientConfig: ClientConfig = new Proxy({} as ClientConfig, {
  get(_, prop) {
    return getConfig()[prop as keyof ClientConfig];
  },
});

export type { ClientConfig, BrandingConfig, FeaturesConfig, AnalyticsConfig, DeploymentMode } from "@workspace/config/types";
