// Pure helpers for the Docker image tags + version header that elmo writes into
// the generated compose / env files. Kept side-effect-free (no fs) so the
// upgrade re-pin path stays unit-testable; index.ts wraps these with file I/O.

// The Postgres major that `elmo init` renders. Bumping this only affects new
// deployments — see `repinImages` for why existing ones stay where they are.
export const POSTGRES_MAJOR = 18;

// From 18 on, the official image puts PGDATA in a version-specific subdirectory
// (/var/lib/postgresql/<major>/docker) and declares its VOLUME one level up, so
// the mount has to be the parent. Mounting the old .../data path against an 18
// image leaves the real cluster in an anonymous volume and no error is raised:
// the deployment comes up with an empty database that disappears on recreate.
export const POSTGRES_DATA_DIR = "/var/lib/postgresql";

export function renderedByHeader(version: string): string {
	return [
		`# Rendered by elmo ${version} on ${new Date().toISOString()}`,
		"# Run `elmo upgrade` after upgrading the CLI to refresh this file.",
	].join("\n");
}

// Reads the version recorded in a `# Rendered by elmo <version> on ...` header,
// or null when the file has no such header (e.g. a legacy, pre-header install).
export function parseRenderedVersion(contents: string): string | null {
	const match = contents.match(/^# Rendered by elmo (\S+) on /m);
	return match ? match[1] : null;
}

// Refreshes the `# Rendered by elmo <version> on ...` header, adding one at the
// top if the file doesn't have it yet (e.g. a legacy install rendered before
// the header existed) so future `elmo upgrade` runs can detect the version.
export function refreshHeaderVersion(contents: string, version: string): string {
	if (!/^# Rendered by elmo \S+ on /m.test(contents)) {
		return `${renderedByHeader(version)}\n${contents}`;
	}
	return contents.replace(
		/^# Rendered by elmo \S+ on .*$/m,
		`# Rendered by elmo ${version} on ${new Date().toISOString()}`,
	);
}

// Re-pins `elmohq/elmo-*:<tag>` image tags to `version`, leaving third-party
// images untouched. Postgres especially: a major bump needs the cluster dumped
// and restored, so rolling the tag here would break the deployment rather than
// upgrade it. `elmo upgrade` reports the drift instead and lets the operator
// drive it.
export function repinImages(contents: string, version: string): string {
	return contents.replace(/(image:\s*elmohq\/elmo-[a-z-]+):\S+/g, `$1:${version}`);
}

// The Postgres major a rendered compose file pins, or null when it manages no
// Postgres container (external-database deployments).
export function parsePostgresMajor(contents: string): number | null {
	const match = contents.match(/^\s*image:\s*postgres:(\d+)/m);
	return match ? Number(match[1]) : null;
}
