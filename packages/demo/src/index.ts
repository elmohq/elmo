/**
 * @workspace/demo - Demo deployment package
 * 
 * This is the main entry point for the demo deployment package.
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
  DEFAULT_DEMO_FEATURES,
  DEFAULT_DEMO_ANALYTICS,
  
  // Legacy API
  createDemoConfig,
} from "./config";

export { DemoAuthProvider } from "./auth-provider";

// Re-export the deployment package as default
export { deploymentPackage as default } from "./config";
