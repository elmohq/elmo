/**
 * Client-safe deployment configuration for TanStack Start
 *
 * Re-exports types used by client components.
 * The actual config is loaded via a server function in the root route's loader
 * and passed down through route context.
 */
import type {
	AnalyticsConfig,
	BrandingConfig,
	ClientConfig,
	DeploymentMode,
	FeaturesConfig,
} from "@workspace/config/types";

export type { ClientConfig, BrandingConfig, FeaturesConfig, AnalyticsConfig, DeploymentMode };
