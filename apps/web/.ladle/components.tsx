import type { GlobalProvider } from "@ladle/react";
import "../src/styles.css";

/**
 * Global provider wrapping all Ladle stories.
 * Imports the app stylesheet so Tailwind theme variables are available.
 */
export const Provider: GlobalProvider = ({ children }) => {
	return <>{children}</>;
};
