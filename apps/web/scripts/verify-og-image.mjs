import { existsSync } from "node:fs";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

const pngMagic = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const isVercelBuild = Boolean(process.env.VERCEL);
const outputDir = resolve(isVercelBuild ? ".vercel/output/functions/__server.func" : ".output/server");
const entryPath = isVercelBuild ? "index.mjs" : "_ssr/ssr.mjs";
const outputPath = join(outputDir, entryPath);

if (!existsSync(outputPath)) {
	throw new Error(`Open Graph image build output was not found: ${outputPath}`);
}

// The full server entry also initializes auth, although this public route does
// not use it. These values are process-local test fixtures, never deployment
// defaults, and let the verifier exercise the emitted handler in Docker.
process.env.DEPLOYMENT_MODE ??= "local";
process.env.DATABASE_URL ??= "postgres://smoke:smoke@127.0.0.1:5432/smoke";
process.env.BETTER_AUTH_SECRET ??= "build-verify-better-auth-secret-0000000000";
process.env.APP_URL ??= "http://localhost";

// A build verification must not emit a real server-side Sentry event if the
// image renderer fails. The browser bundle has already been produced by now.
delete process.env.SENTRY_DSN;
delete process.env.VITE_SENTRY_DSN;

// Run a copy rather than the build directory itself. That prevents Node from
// resolving an accidentally missing dependency from the workspace's
// node_modules and makes this representative of the deployed standalone
// function.
const temporaryDir = await mkdtemp(join(tmpdir(), "elmo-og-image-"));
const isolatedOutputDir = join(temporaryDir, "server");
await cp(outputDir, isolatedOutputDir, { recursive: true });

try {
	const output = await import(pathToFileURL(join(isolatedOutputDir, entryPath)).href);
	const handler = isVercelBuild ? output.default : output.o?.default;

	if (!handler || typeof handler.fetch !== "function") {
		throw new Error(`Open Graph image handler was not exported by ${outputPath}`);
	}

	const response = await handler.fetch(new Request("http://localhost/api/og?defaultBranding=true"));

	if (!response.ok) {
		throw new Error(`Open Graph image request failed with status ${response.status}`);
	}

	if (!response.headers.get("content-type")?.includes("image/png")) {
		throw new Error("Open Graph image request did not return a PNG response");
	}

	const image = new Uint8Array(await response.arrayBuffer());

	if (image.byteLength <= 1000) {
		throw new Error(`Open Graph image was unexpectedly small (${image.byteLength} bytes)`);
	}

	if (!pngMagic.every((byte, index) => image[index] === byte)) {
		throw new Error("Open Graph image response did not have a PNG signature");
	}

	console.log(`✓ Open Graph image rendered successfully: ${outputPath}`);
} finally {
	await rm(temporaryDir, { force: true, recursive: true });
}
