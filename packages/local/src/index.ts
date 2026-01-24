/**
 * @workspace/local - Local development deployment package
 * 
 * This is the main entry point for the local deployment package.
 * It exports the DeploymentPackage interface for build-time swapping.
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
  DEFAULT_LOCAL_FEATURES,
  DEFAULT_LOCAL_ANALYTICS,
  
  // Legacy API
  createLocalConfig,
} from "./config";

export { LocalAuthProvider } from "./auth-provider";

// Re-export the deployment package as default
export { deploymentPackage as default } from "./config";
