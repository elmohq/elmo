/**
 * @workspace/whitelabel - Whitelabel deployment package
 *
 * Provides whitelabel-mode implementation:
 * - createWhitelabelDeployment() factory for static config
 * - OptimizeButton component
 * - Auth hooks (exported via ./auth-hooks subpath) for better-auth integration
 *
 * NOTE: This package contains proprietary code and may be licensed differently.
 */

export {
	createWhitelabelDeployment,
	type CreateWhitelabelDeploymentOptions,
} from "./deployment";

export {
	OptimizeButton,
	type OptimizeButtonProps,
} from "./components/optimize-button";
