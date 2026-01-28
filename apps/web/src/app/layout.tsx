import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { clientConfig } from "@/lib/config/client";
import { getEnvValidationState } from "@workspace/config/env";
import MissingEnvPage from "@/components/missing-env-page";
import ClarityAnalytics from "@/components/clarity-analytics";
import PlausibleProvider from "next-plausible";
import { NuqsAdapter } from "nuqs/adapters/next/app";

const geistSans = Geist({
	variable: "--font-geist-sans",
	subsets: ["latin"],
});

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
});

const config = clientConfig;
const branding = config.branding;
const analytics = config.analytics;

export const metadata: Metadata = {
	title: {
		template: `%s - ${branding.name}`,
		default: `${branding.name} - Generative AI Optimization`,
	},
	...(config.mode === "whitelabel"
		? {
				icons: {
					icon: branding.icon,
				},
			}
		: {}),
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	const envState = getEnvValidationState();

	if (!envState.isValid) {
		return (
			<html lang="en">
				<body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
					<MissingEnvPage mode={envState.mode} missing={envState.missing} />
				</body>
			</html>
		);
	}

	const isProduction = process.env.VERCEL_ENV === "production";
	const plausibleDomain = analytics.plausibleDomain;

	return (
		<html lang="en">
			<head>
				{plausibleDomain && <PlausibleProvider domain={plausibleDomain} />}
			</head>
			<body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
				{isProduction && <ClarityAnalytics />}
				<NuqsAdapter>{children}</NuqsAdapter>
			</body>
		</html>
	);
}
