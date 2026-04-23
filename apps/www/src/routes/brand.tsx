import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Copy, Download } from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { ogMeta, canonicalUrl, breadcrumbJsonLd } from "@/lib/seo";

const title = "Brand · Elmo";
const description =
	"Download Elmo logos, icons, and brand assets. Everything you need to represent the Elmo brand.";

export const Route = createFileRoute("/brand")({
	head: () => ({
		meta: [
			{ title },
			{ name: "description", content: description },
			...ogMeta({ title, description, path: "/brand" }),
		],
		links: [{ rel: "canonical", href: canonicalUrl("/brand") }],
		scripts: [
			breadcrumbJsonLd([
				{ name: "Home", path: "/" },
				{ name: "Brand", path: "/brand" },
			]),
		],
	}),
	component: BrandPage,
});

const BRAND_COLOR = "#2563eb";

interface BrandAsset {
	label: string;
	filename: string;
	path: string;
	svgPath?: string;
	transparent?: boolean;
	preview: {
		bg: string;
		padding?: string;
	};
}

const icons: BrandAsset[] = [
	{
		label: "Icon",
		filename: "elmo-icon-512.png",
		path: "/brand/icons/elmo-icon-512.png",
		svgPath: "/icons/elmo-icon.svg",
		transparent: true,
		preview: { bg: "#ffffff" },
	},
	{
		label: "Icon — Dark",
		filename: "elmo-icon-dark-512.png",
		path: "/brand/icons/elmo-icon-dark-512.png",
		preview: { bg: "#111827" },
	},
	{
		label: "Icon — White",
		filename: "elmo-icon-white-512.png",
		path: "/brand/icons/elmo-icon-white-512.png",
		preview: { bg: "#ffffff" },
	},
];

const logos: BrandAsset[] = [
	{
		label: "Logo",
		filename: "elmo-logo-xl.png",
		path: "/brand/logos/elmo-logo-xl.png",
		transparent: true,
		preview: { bg: "#ffffff", padding: "p-8" },
	},
	{
		label: "Logo — Dark",
		filename: "elmo-logo-dark-xl.png",
		path: "/brand/logos/elmo-logo-dark-xl.png",
		preview: { bg: "#111827", padding: "p-8" },
	},
	{
		label: "Logo — White",
		filename: "elmo-logo-white-xl.png",
		path: "/brand/logos/elmo-logo-white-xl.png",
		preview: { bg: "#ffffff", padding: "p-8" },
	},
];

function DownloadButton({
	href,
	label,
}: {
	href: string;
	label: string;
}) {
	return (
		<a
			href={href}
			download
			className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
		>
			<Download className="size-3" />
			{label}
		</a>
	);
}

const CHECKERED_BG = {
	backgroundImage:
		"linear-gradient(45deg, #f0f0f0 25%, transparent 25%), linear-gradient(-45deg, #f0f0f0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #f0f0f0 75%), linear-gradient(-45deg, transparent 75%, #f0f0f0 75%)",
	backgroundSize: "16px 16px",
	backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0",
};

function AssetCard({ asset }: { asset: BrandAsset }) {
	return (
		<div className="group overflow-hidden rounded-xl border transition-shadow hover:shadow-md">
			<div
				className={`relative flex items-center justify-center overflow-hidden ${asset.preview.padding ?? "p-6"}`}
				style={{
					backgroundColor: asset.preview.bg,
					minHeight: 180,
					...(asset.transparent ? CHECKERED_BG : {}),
				}}
			>
				<img
					src={asset.path}
					alt={asset.label}
					className="max-h-28 max-w-full object-contain"
					loading="lazy"
				/>
			</div>
			<div className="flex items-center justify-between border-t px-4 py-3">
				<span className="text-sm font-medium">{asset.label}</span>
				<div className="flex items-center gap-1.5">
					<DownloadButton href={asset.path} label="PNG" />
					{asset.svgPath && (
						<DownloadButton href={asset.svgPath} label="SVG" />
					)}
				</div>
			</div>
		</div>
	);
}

function ColorSwatch({
	color,
	label,
	value,
}: {
	color: string;
	label: string;
	value: string;
}) {
	const [copied, setCopied] = useState(false);

	function handleCopy() {
		navigator.clipboard.writeText(value).then(() => {
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		});
	}

	return (
		<button
			type="button"
			onClick={handleCopy}
			className="group flex cursor-pointer items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-muted/50"
		>
			<div
				className="size-12 shrink-0 rounded-lg border shadow-sm"
				style={{ backgroundColor: color }}
			/>
			<div className="min-w-0 flex-1">
				<p className="text-sm font-medium">{label}</p>
				<p className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
					{value}
					{copied ? (
						<Check className="size-3 text-emerald-500" />
					) : (
						<Copy className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />
					)}
				</p>
			</div>
		</button>
	);
}

function BrandPage() {
	return (
		<div className="min-h-screen">
			<Navbar />
			<main className="mx-auto max-w-4xl px-4 py-12 md:px-6 lg:py-20">
				<header className="mb-16 space-y-4">
					<h1 className="font-heading text-4xl lg:text-5xl">
						Brand Assets
					</h1>
					<p className="max-w-2xl text-lg text-muted-foreground text-balance">
						Writing about Elmo or building an integration? Download
						official logos and icons to use in blog posts, videos,
						partner pages, or anywhere you reference Elmo.
					</p>
				</header>

				{/* Guidelines */}
				<section className="mb-16">
					<h2 className="mb-6 text-xl font-semibold">Guidelines</h2>
					<div className="rounded-xl border p-6">
						<div className="grid gap-6 sm:grid-cols-2">
							<div className="space-y-1">
								<p className="text-sm font-medium">Do</p>
								<ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground">
									<li>Use the provided assets without modification</li>
									<li>Maintain clear space around the logo</li>
									<li>Use on solid backgrounds with good contrast</li>
								</ul>
							</div>
							<div className="space-y-1">
								<p className="text-sm font-medium">Don't</p>
								<ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground">
									<li>Alter the colors, proportions, or orientation</li>
									<li>Add effects like shadows, outlines, or gradients</li>
									<li>Use the logo to imply endorsement without permission</li>
								</ul>
							</div>
						</div>
					</div>
				</section>

				{/* Colors */}
				<section className="mb-16">
					<h2 className="mb-6 text-xl font-semibold">Colors</h2>
					<div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
						<ColorSwatch
							color={BRAND_COLOR}
							label="Brand Blue"
							value="#2563eb"
						/>
						<ColorSwatch
							color="#f4d35e"
							label="Accent Yellow"
							value="#f4d35e"
						/>
						<ColorSwatch
							color="#ee964b"
							label="Accent Orange"
							value="#ee964b"
						/>
						<ColorSwatch
							color="#f95738"
							label="Accent Red"
							value="#f95738"
						/>
					</div>
				</section>

				{/* Icons */}
				<section className="mb-16">
					<div className="mb-6 flex items-center justify-between">
						<h2 className="text-xl font-semibold">Icons</h2>
						<span className="text-xs text-muted-foreground">512 × 512px</span>
					</div>
					<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{icons.map((asset) => (
							<AssetCard key={asset.filename} asset={asset} />
						))}
					</div>
				</section>

				{/* Logos */}
				<section className="mb-16">
					<div className="mb-6 flex items-center justify-between">
						<h2 className="text-xl font-semibold">Wordmark</h2>
						<span className="text-xs text-muted-foreground">700 × 330px</span>
					</div>
					<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{logos.map((asset) => (
							<AssetCard key={asset.filename} asset={asset} />
						))}
					</div>
				</section>

				{/* Typography */}
				<section className="mb-16">
					<h2 className="mb-6 text-xl font-semibold">Typography</h2>
					<div className="grid gap-6 sm:grid-cols-2">
						<a
							href="https://fonts.google.com/specimen/Titan+One"
							target="_blank"
							rel="noopener noreferrer"
							className="group rounded-xl border p-6 transition-colors hover:bg-muted/30"
						>
							<p className="font-titan-one text-4xl lowercase text-blue-600">
								elmo
							</p>
							<p className="mt-3 text-sm font-medium group-hover:text-primary">Titan One</p>
							<p className="text-xs text-muted-foreground">
								Used for the logo wordmark and icon glyph
							</p>
						</a>
						<a
							href="https://vercel.com/font"
							target="_blank"
							rel="noopener noreferrer"
							className="group rounded-xl border p-6 transition-colors hover:bg-muted/30"
						>
							<p className="text-4xl font-semibold tracking-tight">
								Geist Sans
							</p>
							<p className="mt-3 text-sm font-medium group-hover:text-primary">Geist Sans</p>
							<p className="text-xs text-muted-foreground">
								Used for body text, headings, and UI elements
							</p>
						</a>
					</div>
				</section>

				{/* CTA */}
				<div className="rounded-xl border border-dashed p-8 text-center">
					<h3 className="text-lg font-semibold">Need something else?</h3>
					<p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
						If you need assets in a different format or size, or have
						questions about brand usage, reach out on Discord or open a
						GitHub issue.
					</p>
					<div className="mt-4 flex flex-wrap items-center justify-center gap-3">
						<Button asChild variant="outline" size="sm">
							<a
								href="https://discord.gg/s24nubCtKz"
								target="_blank"
								rel="noopener noreferrer"
							>
								Ask on Discord
							</a>
						</Button>
						<Button asChild variant="outline" size="sm">
							<a
								href="https://github.com/elmohq/elmo/issues/new"
								target="_blank"
								rel="noopener noreferrer"
							>
								Open an Issue
							</a>
						</Button>
					</div>
				</div>
			</main>
			<Footer />
		</div>
	);
}
