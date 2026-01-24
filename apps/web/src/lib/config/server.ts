/**
 * Server-side deployment configuration
 */
import { deployment } from "@workspace/deployment";
import type { ServerConfig } from "@workspace/config/types";

let _cached: ServerConfig;

function getConfig(): ServerConfig {
  return _cached ??= deployment().createServerConfig();
}

/**
 * Server configuration singleton (lazy-initialized)
 */
export const serverConfig: ServerConfig = new Proxy({} as ServerConfig, {
  get(_, prop) {
    return getConfig()[prop as keyof ServerConfig];
  },
});

export type { ServerConfig, AuthProvider, Session, Organization, BrandingConfig, FeaturesConfig, DeploymentMode } from "@workspace/config/types";
