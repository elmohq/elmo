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
	/** Fitted on a held-out calibration set; models released before calibration omit it. */
	temperature?: { reference: number; sentiment: number };
}

/** The label order the integration relies on; a model trained with different labels must not load. */
const REFERENCE_LABELS = ["brand", "other_meaning", "other_company", "link_only", "no_info"];
const SENTIMENT_LABELS = ["positive", "neutral", "negative", "mixed"];

/** Temperature-scales a probability vector: softmax(log p / T). */
function calibrate(probs: Float32Array, temperature = 1): number[] {
	const scaled = Array.from(probs, (p) => Math.log(Math.max(p, 1e-12)) / temperature);
	const max = Math.max(...scaled);
	const exp = scaled.map((v) => Math.exp(v - max));
	const sum = exp.reduce((a, b) => a + b, 0);
	return exp.map((v) => v / sum);
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
	if (config.references.join() !== REFERENCE_LABELS.join() || config.sentiments.join() !== SENTIMENT_LABELS.join()) {
		throw new Error(`mention judge ${config.version} has unexpected labels`);
	}
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
			const probs = (name: "reference" | "sentiment", labels: string[]) => {
				const raw = out[name].data as Float32Array;
				const total = raw.reduce((a, b) => a + b, 0);
				if (!(Math.abs(total - 1) < 1e-3)) throw new Error(`mention judge ${name} probabilities sum to ${total}`);
				const data = calibrate(raw, config.temperature?.[name]);
				return Object.fromEntries(labels.map((label, i) => [label, data[i]]));
			};
			return { reference: probs("reference", config.references), sentiment: probs("sentiment", config.sentiments) };
		},
	};
}
