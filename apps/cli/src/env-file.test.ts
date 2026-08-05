import { chmod, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "dotenv";
import { afterEach, describe, expect, it } from "vitest";
import { appendEnvValue, formatEnvValue, setEnvFileValue } from "./env-file";

const temporaryDirectories: string[] = [];

describe("env file updates", () => {
	afterEach(async () => {
		await Promise.all(
			temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
		);
	});

	it("quotes dollar signs literally for Docker Compose interpolation", () => {
		const secret = `pa$$\${TOKEN}`;
		expect(formatEnvValue(secret)).toBe(`'pa$$\${TOKEN}'`);
		expect(parse(`SECRET=${formatEnvValue(secret)}\n`)).toEqual({ SECRET: secret });
	});

	it("appends one value without rewriting comments, ordering, or existing secrets", async () => {
		const directory = await mkdtemp(join(tmpdir(), "elmo-env-"));
		temporaryDirectories.push(directory);
		const envPath = join(directory, ".env");
		const original = "# operator comment\nSECRET=pa$WORD\nBLANK=\n";
		await writeFile(envPath, original, "utf8");
		await chmod(envPath, 0o600);

		await setEnvFileValue(envPath, "ELMO_ENCRYPTION_KEY", "new-key");

		expect(await readFile(envPath, "utf8")).toBe(`${original}ELMO_ENCRYPTION_KEY=new-key\n`);
		expect((await stat(envPath)).mode & 0o777).toBe(0o600);
	});

	it("rejects names that could inject another assignment", () => {
		expect(() => appendEnvValue("", "KEY\nOTHER", "value")).toThrow("Invalid environment variable name");
	});
});
