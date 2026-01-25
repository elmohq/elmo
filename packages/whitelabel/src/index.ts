/**
 * @workspace/whitelabel - Whitelabel deployment package
 * 
 * This is the main entry point for the whitelabel deployment package.
 * It exports the DeploymentPackage interface for build-time swapping.
 * 
 * NOTE: This package contains proprietary code and may be licensed differently.
 */

export {
  // Deployment package interface
  deploymentPackage,
  
  // Config factories
  createClientConfig,
  createServerConfig,
  
  // Environment
  getEnvRequirements,
  
  // Constants
  MODE,
  DEFAULT_WHITELABEL_FEATURES,
  
  // Helper functions
  generateOptimizationUrl,
  
  // Legacy API
  createWhitelabelConfig,
  type WhitelabelConfigOptions,
} from "./config";

export {
  Auth0AuthProvider,
  type Auth0AppMetadata,
  type Auth0SessionWithMetadata,
  APP_METADATA_CACHE_TTL,
} from "./auth-provider";

// Re-export the deployment package as default
export { deploymentPackage as default } from "./config";
