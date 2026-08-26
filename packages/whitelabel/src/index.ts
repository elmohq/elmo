/**
 * @workspace/whitelabel - Whitelabel deployment package
 *
 * Provides whitelabel-mode implementation:
 * - createWhitelabelDeployment() factory for static config
 * - OptimizeButton component
 * - Auth hooks (exported via ./auth-hooks subpath) for better-auth integration
 */

export {
	OptimizeButton,
	type OptimizeButtonProps,
} from "./components/optimize-button";
export {
	type CreateWhitelabelDeploymentOptions,
	createWhitelabelDeployment,
} from "./deployment";
