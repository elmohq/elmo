/**
 * @workspace/deployment - Deployment facade package
 * 
 * This package acts as a facade that provides the correct deployment
 * implementation based on the DEPLOYMENT_MODE env var.
 */

import type { DeploymentMode } from "@workspace/config/types";

const VALID_MODES: DeploymentMode[] = ["local", "demo", "whitelabel", "cloud"];

/**
 * Get the deployment mode from environment
 */
export function getDeploymentMode(): DeploymentMode {
  const envVar = typeof window !== "undefined"
    ? "NEXT_PUBLIC_DEPLOYMENT_MODE"
    : "DEPLOYMENT_MODE";
  
  const mode = process.env[envVar]?.toLowerCase();

  if (!mode) {
    throw new Error(`${envVar} environment variable is required`);
  }

  if (!VALID_MODES.includes(mode as DeploymentMode)) {
    throw new Error(`Invalid ${envVar}: "${mode}". Must be one of: ${VALID_MODES.join(", ")}`);
  }

  return mode as DeploymentMode;
}

/**
 * Get the deployment package for the current mode
 */
export function getDeployment() {
  const mode = getDeploymentMode();
  switch (mode) {
    case "whitelabel":
      return require("@workspace/whitelabel");
    case "demo":
      return require("@workspace/demo");
    case "local":
      return require("@workspace/local");
    case "cloud":
      // TODO: implement cloud deployment
      throw new Error("Cloud deployment mode is not yet implemented");
  }
}

// For convenience, also export a cached version
let _deployment: ReturnType<typeof getDeployment> | null = null;

export function deployment() {
  if (!_deployment) {
    _deployment = getDeployment();
  }
  return _deployment;
}
