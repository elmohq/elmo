// Satori (via `@workspace/og/rasterize`) reads a `tw` prop of Tailwind classes
// off host elements to style them. React's JSX types don't include it, so add it
// here for the brand-asset scripts and any callers that use `tw`.
import "react";

declare module "react" {
	interface HTMLAttributes<T> {
		tw?: string;
	}
}
