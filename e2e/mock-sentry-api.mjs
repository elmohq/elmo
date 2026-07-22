import { createServer } from "node:http";

const port = Number(process.env.PORT ?? 7331);
const requests = [];

function sendJson(response, body, status = 200) {
	response.writeHead(status, { "content-type": "application/json" });
	response.end(JSON.stringify(body));
}

function release(version = "e2e-build") {
	return {
		dateReleased: null,
		newGroups: 0,
		commitCount: 0,
		url: null,
		data: {},
		lastDeploy: null,
		deployCount: 0,
		dateCreated: "2026-01-01T00:00:00Z",
		lastEvent: null,
		version,
		firstEvent: null,
		lastCommit: null,
		shortVersion: version,
		authors: [],
		owner: null,
		versionInfo: {
			buildHash: null,
			version: { raw: version },
			description: version,
			package: null,
		},
		ref: null,
		projects: [{ id: 1, name: "web", slug: "web", platform: "javascript", platforms: ["javascript"] }],
	};
}

function count(method, suffix) {
	return requests.filter((request) => request.method === method && request.url.endsWith(suffix)).length;
}

const server = createServer((request, response) => {
	const chunks = [];
	request.on("data", (chunk) => chunks.push(chunk));
	request.on("end", () => {
		const body = Buffer.concat(chunks);
		const url = request.url ?? "/";

		if (url === "/health") {
			return sendJson(response, { ok: true });
		}

		if (url === "/__assert") {
			const result = {
				releases: count("POST", "/releases/"),
				chunkOptions: count("GET", "/chunk-upload/"),
				chunkUploads: count("POST", "/chunk-upload/"),
				artifactBundles: count("POST", "/artifactbundle/assemble/"),
			};
			const complete = Object.values(result).every((value) => value > 0);
			return sendJson(response, result, complete ? 200 : 503);
		}

		requests.push({ method: request.method ?? "", url, size: body.length });
		console.log(`${request.method} ${url} ${body.length}`);

		if (request.method === "GET" && url.endsWith("/chunk-upload/")) {
			return sendJson(response, {
				url: `http://${request.headers.host}${url}`,
				chunkSize: 8388608,
				chunksPerRequest: 64,
				maxRequestSize: 33554432,
				maxFileSize: 1073741824,
				concurrency: 8,
				hashAlgorithm: "sha1",
				compression: ["gzip"],
				accept: ["release_files", "artifact_bundles"],
			});
		}

		if (request.method === "POST" && url.endsWith("/chunk-upload/")) {
			return sendJson(response, []);
		}

		if (request.method === "POST" && url.endsWith("/artifactbundle/assemble/")) {
			return sendJson(response, { state: "created", missingChunks: [] });
		}

		if (request.method === "POST" && url.endsWith("/releases/")) {
			let version;
			try {
				version = JSON.parse(body.toString()).version;
			} catch {}
			return sendJson(response, release(version));
		}

		const releaseMatch = url.match(/\/releases\/([^/]+)\/?/);
		if (releaseMatch) {
			return sendJson(response, release(decodeURIComponent(releaseMatch[1])));
		}

		if (request.method === "GET" && url.includes("/repos/")) {
			return sendJson(response, []);
		}

		return sendJson(response, { version: "e2e" });
	});
});

server.listen(port, "127.0.0.1", () => {
	console.log(`Mock Sentry API listening on http://127.0.0.1:${port}`);
});
