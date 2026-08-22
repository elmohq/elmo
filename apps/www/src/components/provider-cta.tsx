// Affiliate sign-up button for a scraping provider, used from blog MDX. It
// renders its own anchor rather than a markdown link so the styling survives
// Tailwind's source scanning, which covers src/ but not the MDX content dir.
export function ProviderCTA({ href, name, children }: { href: string; name: string; children?: React.ReactNode }) {
	return (
		<a
			href={href}
			target="_blank"
			rel="sponsored nofollow noopener noreferrer"
			className="not-prose my-6 inline-flex h-10 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-medium leading-none text-white no-underline ring-1 ring-blue-600 hover:bg-blue-700"
		>
			{children ?? `Get started with ${name}`}
			<span aria-hidden="true">→</span>
		</a>
	);
}
