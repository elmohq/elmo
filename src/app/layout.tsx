import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { WHITE_LABEL_CONFIG } from "@/lib/white-label";

const geistSans = Geist({
	variable: "--font-geist-sans",
	subsets: ["latin"],
});

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
});

export const metadata: Metadata = {
	title: {
		template: `%s - ${WHITE_LABEL_CONFIG.name}`,
		default: `${WHITE_LABEL_CONFIG.name} - Generative AI Optimization`,
	},
	icons: {
		icon: WHITE_LABEL_CONFIG.icon,
	},
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en">
			<body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>{children}</body>
		</html>
	);
}
