import { PgBoss } from "pg-boss";

const DATABASE_URL = process.env.DATABASE_URL || "postgres://elmo:elmo@localhost:5432/elmo";
const PROMPT_ID = process.env.PROMPT_ID || "00000000-0000-0000-0000-000000000001";

async function main() {
	const boss = new PgBoss({
		connectionString: DATABASE_URL,
		schema: "pgboss",
		supervise: false,
	});

	await boss.start();
	await boss.createQueue("process-prompt");

	await boss.send(
		"process-prompt",
		{ promptId: PROMPT_ID, cadenceHours: 6 },
		{
			startAfter: 3 * 60 * 60,
			singletonKey: `prompt-${PROMPT_ID}`,
			singletonSeconds: 3 * 60 * 60,
		},
	);

	await boss.stop();
	console.log("Scheduled next run for prompt:", PROMPT_ID);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
