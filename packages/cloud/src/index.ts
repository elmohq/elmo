/**
 * @workspace/cloud - Elmo Cloud deployment package
 *
 * Provides the cloud-mode implementation:
 * - createCloudDeployment() factory (Elmo branding, self-serve signup,
 *   multi-org, Stripe billing on, report generation off)
 *
 * Auth is handled by better-auth; this only provides static config. The
 * OptimizeButton stub is reused from @workspace/local via the client mapping
 * in @workspace/deployment/client.
 */

export { createCloudDeployment } from "./deployment";
