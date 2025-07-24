import { Geist, Geist_Mono } from "next/font/google";
import type { Metadata } from "next";
import "@/app/globals.css";

const geistSans = Geist({
	variable: "--font-geist-sans",
	subsets: ["latin"],
	display: 'swap',
	preload: true,
});

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
	display: 'swap',
	preload: true,
});

export const metadata: Metadata = {
	title: "Report Render",
	robots: {
		index: false,
		follow: false,
	},
};

export default function RenderLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
			<head>
				<style
					dangerouslySetInnerHTML={{
						__html: `
							/* Force font loading for PDF generation */
							@font-face {
								font-family: 'GeistFallback';
								src: local('Arial'), local('Helvetica'), local('sans-serif');
								font-display: block;
							}
							
							body {
								font-family: var(--font-geist-sans), 'GeistFallback', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
								margin: 0;
								padding: 0;
								-webkit-font-smoothing: antialiased;
								-moz-osx-font-smoothing: grayscale;
							}
							
							* {
								font-family: inherit;
							}
							
							/* Ensure fonts are loaded before PDF generation */
							.font-sans {
								font-family: var(--font-geist-sans), 'GeistFallback', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
							}
							
							.font-mono {
								font-family: var(--font-geist-mono), ui-monospace, SFMono-Regular, 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
							}
							
							/* Force all text to use the primary font */
							h1, h2, h3, h4, h5, h6, p, span, div, a, button, input, textarea, select {
								font-family: inherit;
							}
						`
					}}
				/>
			</head>
			<body className={`${geistSans.variable} ${geistMono.variable} antialiased font-sans`}>
				{children}
			</body>
		</html>
	);
} 