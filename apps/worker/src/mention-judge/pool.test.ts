import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadJudgePool } from "./pool";

const STUB = join(__dirname, "__fixtures__", "stub-pool-worker.ts");
const entity = { name: "Acme" };

describe("judge pool", () => {
	it("fails only the passage a crashed session held, and keeps judging on a replacement", async () => {
		const pool = await loadJudgePool("unused", 1, STUB);
		const crashed = pool.judge(entity, "crash");
		const queued = pool.judge(entity, "Acme is great.");
		await expect(crashed).rejects.toThrow(/exited/);
		await expect(queued).resolves.toMatchObject({ reference: { brand: 1 } });
		await expect(pool.judge(entity, "Acme again.")).resolves.toMatchObject({ reference: { brand: 1 } });
	});

	it("spreads passages across its sessions", async () => {
		const pool = await loadJudgePool("unused", 3, STUB);
		const judgments = await Promise.all(Array.from({ length: 9 }, (_, i) => pool.judge(entity, `passage ${i}`)));
		expect(judgments).toHaveLength(9);
	});
});
