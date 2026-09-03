/**
 * Kept in its own module so the route can import it lazily: Scalar carries its
 * own Vue runtime and a stylesheet, and neither belongs in the bundle every
 * other page pays for.
 *
 * The caller passes the instance's own spec URL rather than a bundled copy, so
 * the title, servers and operations are the ones the deployment actually
 * serves.
 */
import { ApiReferenceReact } from "@scalar/api-reference-react";
import "@scalar/api-reference-react/style.css";

export default function ApiReference({ url, darkMode }: { url: string; darkMode: boolean }) {
	return (
		<ApiReferenceReact
			configuration={{
				url,
				darkMode,
				// Everything below strips Scalar's own chrome: the toolbar, the
				// hosted agent and MCP-generator buttons, and the phone-home. This is
				// a page of ours, not a window onto somebody else's product.
				showDeveloperTools: "never",
				agent: { disabled: true },
				mcp: { disabled: true },
				telemetry: false,
				hideClientButton: true,
				hideDarkModeToggle: true,
				withDefaultFonts: false,
				// The spec already has a `Models` tag — the answer engines — so
				// Scalar's schema section needs the other name.
				modelsSectionLabel: "Schemas",
			}}
		/>
	);
}
