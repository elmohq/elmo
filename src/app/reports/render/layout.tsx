import type { Metadata } from "next";

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
		<div>{children}</div>
	);
}
