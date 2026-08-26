/**
 * A `<ul>` that still reads as a list to a screen reader.
 *
 * Tailwind's preflight resets `list-style` on every `ul`, and Safari drops list
 * semantics from a list styled that way — so `role="list"` here is doing work
 * rather than repeating what the element already says. Going through one
 * component keeps that explanation in one place instead of at every list.
 */
export function List({ children, ...props }: React.ComponentProps<"ul">) {
	return (
		// biome-ignore lint/a11y/noRedundantRoles: restores the semantics Tailwind's list-style reset costs in Safari
		<ul role="list" {...props}>
			{children}
		</ul>
	);
}
