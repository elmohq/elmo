/**
 * @workspace/cloud - Elmo Cloud deployment package
 *
 * Provides the managed deployment configuration, cloud auth/email behavior,
 * and the Stripe billing control plane used by the shared applications.
 */

export { createCloudDeployment } from "./deployment";
export { CLAUDE_NATIVE_WEB_TARGET_KEY, validateCloudTrackingTargets } from "./tracking-targets";
