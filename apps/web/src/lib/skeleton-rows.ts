export function skeletonRows(count: number): string[] {
	return Array.from({ length: count }, (_, index) => `row-${index}`);
}
