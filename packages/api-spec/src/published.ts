/**
 * The spec as it is served and rendered: only the operations the running app
 * actually answers.
 *
 * openapi.json is written ahead of the code — an operation is authored with
 * `x-elmo-stability: planned` and flipped to `beta` by the change that
 * implements it (see DESIGN.md). Publishing a planned operation would document
 * an endpoint that 404s, so they are filtered out here rather than kept in a
 * second document that would drift from this one.
 */
import document from "./openapi.json";

type Document = typeof document;
type Operations = Record<string, unknown>;

const HTTP_METHODS = new Set(["get", "put", "post", "delete", "options", "head", "patch", "trace"]);

function isPlanned(operation: unknown): boolean {
	return (
		typeof operation === "object" &&
		operation !== null &&
		(operation as Record<string, unknown>)["x-elmo-stability"] === "planned"
	);
}

/**
 * Drop every planned operation, then every path and tag left with nothing to
 * show. Orphaned component schemas are left alone: they cost a few bytes and
 * render nowhere, and pruning them would mean walking `$ref`s to find out which
 * ones the surviving operations still reach.
 *
 * `info.description` describes the API as specified, including auth that isn't
 * built; while anything is still planned, the shorter
 * `x-elmo-published-description` stands in. Once the last planned operation
 * ships, nothing is stripped, the full description is published, and the
 * stand-in can be deleted.
 */
export function withoutPlannedOperations(source: Document): Document {
	const paths: Record<string, Operations> = {};
	let stripped = 0;
	for (const [path, operations] of Object.entries(source.paths as Record<string, Operations>)) {
		const kept = Object.fromEntries(
			Object.entries(operations).filter(([key, value]) => {
				if (!HTTP_METHODS.has(key) || !isPlanned(value)) return true;
				stripped++;
				return false;
			}),
		);
		if (Object.keys(kept).some((key) => HTTP_METHODS.has(key))) paths[path] = kept;
	}

	const publishedTags = new Set(
		Object.values(paths).flatMap((operations) =>
			Object.entries(operations)
				.filter(([key]) => HTTP_METHODS.has(key))
				.flatMap(([, operation]) => ((operation as { tags?: string[] }).tags ?? []) as string[]),
		),
	);

	const { "x-elmo-published-description": standIn, ...info } = source.info as typeof source.info & {
		"x-elmo-published-description"?: string;
	};

	return {
		...source,
		info: stripped > 0 && standIn ? { ...info, description: standIn } : info,
		paths,
		tags: (source.tags as { name: string }[]).filter((tag) => publishedTags.has(tag.name)),
	} as Document;
}

export const publishedSpec = withoutPlannedOperations(document);

export default publishedSpec;
