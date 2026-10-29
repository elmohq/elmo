import type { AnalyticsReader } from "@/lib/analytics/reader";

export function bindReader<A extends unknown[], R>(
	reader: AnalyticsReader,
	fn: (reader: AnalyticsReader, ...args: A) => R,
) {
	return (...args: A): R => fn(reader, ...args);
}
