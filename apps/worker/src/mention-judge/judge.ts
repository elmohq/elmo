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

/** What the tokenizer produces; exporters keep or prune token_type_ids, so a graph may declare fewer. */
const ENCODED_INPUTS = ["input_ids", "attention_mask", "token_type_ids"];

/** Temperature-scales a probability vector: softmax(log p / T). */
function calibrate(probs: Float32Array, temperature = 1): number[] {
	const scaled = Array.from(probs, (p) => Math.log(Math.max(p, 1e-12)) / temperature);
	const max = Math.max(...scaled);
	const exp = scaled.map((v) => Math.exp(v - max));
	const sum = exp.reduce((a, b) => a + b, 0);
	return exp.map((v) => v / sum);
}

/** Matches the training format exactly; the model has never seen any other layout. */
function formatEntity(entity: JudgedEntity): string {
	const parts = [entity.name];
	if (entity.aliases?.length) parts.push(`aka ${entity.aliases.join(", ")}`);
	if (entity.domains?.length) parts.push(`site ${entity.domains.join(", ")}`);
	if (entity.competitors?.length) parts.push(`competitors ${entity.competitors.join(", ")}`);
	return parts.join(" | ");
}

/**
 * The entity as the model reads it: its name, then as many aliases, domains and (up to five)
 * competitors as `fits`, in that order. The passage shares the model's input, and a company with
 * dozens of aliases would otherwise leave no room for the text being judged.
 */
export function entityText(entity: JudgedEntity, fits: (text: string) => boolean = () => true): string {
	const kept = { name: entity.name, aliases: [] as string[], domains: [] as string[], competitors: [] as string[] };
	const extras = [
		...(entity.aliases ?? []).map((value) => ["aliases", value] as const),
		...(entity.domains ?? []).map((value) => ["domains", value] as const),
		...(entity.competitors ?? []).slice(0, 5).map((value) => ["competitors", value] as const),
	];
	for (const [field, value] of extras) {
		kept[field].push(value);
		if (fits(formatEntity(kept))) continue;
		kept[field].pop();
		break;
	}
	return formatEntity(kept);
}

/** Kept for the passage: windows put the match up to about 100 tokens in, and it must stay in view. */
const PASSAGE_TOKENS = 160;

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
	const unknownInputs = session.inputNames.filter((name) => !ENCODED_INPUTS.includes(name));
	if (unknownInputs.length > 0)
		throw new Error(`mention judge ${config.version} expects inputs ${unknownInputs.join(", ")}`);

	return {
		version: config.version,
		async judge(entity, passage) {
			const fits = (text: string) => tokenizer.encode(text).length <= config.max_len - PASSAGE_TOKENS;
			const encoded = tokenizer.encodePair(entityText(entity, fits), passage, config.max_len);
			const shape = [1, encoded.inputIds.length];
			const columns: Record<string, number[]> = {
				input_ids: encoded.inputIds,
				attention_mask: encoded.attentionMask,
				token_type_ids: encoded.tokenTypeIds,
			};
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
