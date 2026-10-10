import { readFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { join } from "node:path";
import { UnigramTokenizer } from "./tokenizer";

export interface JudgedEntity {
	name: string;
	aliases?: string[];
	domains?: string[];
	competitors?: string[];
}

export interface Judgment {
	reference: Record<string, number>;
	sentiment: Record<string, number>;
}

interface JudgeConfig {
	version: string;
	references: string[];
	sentiments: string[];
	max_len: number;
}

/** Matches the training format exactly; the model has never seen any other layout. */
export function entityText(entity: JudgedEntity): string {
	const parts = [entity.name];
	if (entity.aliases?.length) parts.push(`aka ${entity.aliases.join(", ")}`);
	if (entity.domains?.length) parts.push(`site ${entity.domains.join(", ")}`);
	if (entity.competitors?.length) parts.push(`competitors ${entity.competitors.slice(0, 5).join(", ")}`);
	return parts.join(" | ");
}

export interface MentionJudge {
	version: string;
	judge(entity: JudgedEntity, passage: string): Promise<Judgment>;
}

export async function loadMentionJudge(dir: string, threads = availableParallelism()): Promise<MentionJudge> {
	const config: JudgeConfig = JSON.parse(readFileSync(join(dir, "config.json"), "utf8"));
	const tokenizer = UnigramTokenizer.fromFile(join(dir, "tokenizer.json"));
	// ONNX Runtime uploads usage telemetry unless this is set before the library loads.
	process.env.ORT_DISABLE_TELEMETRY ??= "1";
	const ort = await import("onnxruntime-node");
	const session = await ort.InferenceSession.create(join(dir, "model.onnx"), { intraOpNumThreads: threads });

	return {
		version: config.version,
		async judge(entity, passage) {
			const encoded = tokenizer.encodePair(entityText(entity), passage, config.max_len);
			const shape = [1, encoded.inputIds.length];
			const columns: Record<string, number[]> = {
				input_ids: encoded.inputIds,
				attention_mask: encoded.attentionMask,
				token_type_ids: encoded.tokenTypeIds,
			};
			// Exporters keep or prune token_type_ids depending on the model config, so feed what the graph declares.
			const feeds = Object.fromEntries(
				session.inputNames.map((name) => [
					name,
					new ort.Tensor("int64", BigInt64Array.from(columns[name], BigInt), shape),
				]),
			);
			const out = await session.run(feeds);
			const probs = (name: string, labels: string[]) => {
				const data = out[name].data as Float32Array;
				return Object.fromEntries(labels.map((label, i) => [label, data[i]]));
			};
			return { reference: probs("reference", config.references), sentiment: probs("sentiment", config.sentiments) };
		},
	};
}
