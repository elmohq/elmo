import { readFileSync } from "node:fs";

/**
 * The subset of Hugging Face's `tokenizers` pipeline the judge model was trained with:
 * whitespace-collapsing + NFC normalisation, Metaspace pre-tokenisation and a Unigram
 * model, with `[CLS] A [SEP] B [SEP]` pairs truncated on the second segment.
 * Any other tokenizer.json is rejected rather than silently tokenised differently.
 */

const UNK_PENALTY = 10;
const METASPACE = "▁";

interface UnigramFile {
	normalizer: { type: string; normalizers: { type: string }[] };
	pre_tokenizer: { type: string; pretokenizers: { type: string; prepend_scheme?: string; split?: boolean }[] };
	model: { type: string; unk_id: number; byte_fallback: boolean; vocab: [string, number][] };
	added_tokens: { id: number; content: string }[];
}

export interface EncodedPair {
	inputIds: number[];
	attentionMask: number[];
	tokenTypeIds: number[];
}

export class UnigramTokenizer {
	private readonly pieces = new Map<string, { id: number; score: number }>();
	private readonly maxPieceLength: number;
	private readonly unkId: number;
	private readonly unkScore: number;
	private readonly clsId: number;
	private readonly sepId: number;

	constructor(file: UnigramFile) {
		const norm = file.normalizer.normalizers.map((n) => n.type).join(",");
		const pre = file.pre_tokenizer.pretokenizers[0];
		if (
			file.model.type !== "Unigram" ||
			file.model.byte_fallback ||
			norm !== "Replace,NFC,Strip" ||
			pre?.type !== "Metaspace" ||
			pre.prepend_scheme !== "always" ||
			!pre.split
		) {
			throw new Error("Unsupported tokenizer.json: expected the DeBERTa-v3 Unigram pipeline");
		}
		let maxLength = 0;
		let minScore = Number.POSITIVE_INFINITY;
		file.model.vocab.forEach(([piece, score], id) => {
			this.pieces.set(piece, { id, score });
			maxLength = Math.max(maxLength, [...piece].length);
			minScore = Math.min(minScore, score);
		});
		this.maxPieceLength = maxLength;
		this.unkId = file.model.unk_id;
		this.unkScore = minScore - UNK_PENALTY;
		const special = new Map(file.added_tokens.map((t) => [t.content, t.id]));
		this.clsId = special.get("[CLS]") ?? 1;
		this.sepId = special.get("[SEP]") ?? 2;
	}

	static fromFile(path: string): UnigramTokenizer {
		return new UnigramTokenizer(JSON.parse(readFileSync(path, "utf8")));
	}

	encode(text: string): number[] {
		const normalized = text
			.replace(/\s{2,}|[\n\r\t]/g, " ")
			.normalize("NFC")
			.trimEnd();
		if (!normalized) return [];
		let spaced = normalized.replaceAll(" ", METASPACE);
		if (!spaced.startsWith(METASPACE)) spaced = METASPACE + spaced;
		const ids: number[] = [];
		for (const word of spaced.split(new RegExp(`(?=${METASPACE})`, "u"))) {
			if (word) ids.push(...this.viterbi([...word]));
		}
		return ids;
	}

	/** `[CLS] a [SEP] b [SEP]`, dropping tokens from the end of `b` to fit `maxLength`. */
	encodePair(a: string, b: string, maxLength: number): EncodedPair {
		const first = this.encode(a);
		const second = this.encode(b).slice(0, Math.max(0, maxLength - first.length - 3));
		const inputIds = [this.clsId, ...first, this.sepId, ...second, this.sepId];
		const tokenTypeIds = inputIds.map((_, i) => (i < first.length + 2 ? 0 : 1));
		return { inputIds, attentionMask: inputIds.map(() => 1), tokenTypeIds };
	}

	private viterbi(chars: string[]): number[] {
		const n = chars.length;
		const lattice: Lattice = {
			best: new Float64Array(n + 1).fill(Number.NEGATIVE_INFINITY),
			from: new Int32Array(n + 1).fill(-1),
			token: new Int32Array(n + 1).fill(-1),
		};
		lattice.best[0] = 0;
		for (let start = 0; start < n; start++) {
			if (lattice.best[start] !== Number.NEGATIVE_INFINITY) this.extend(lattice, chars, start);
		}
		const out: number[] = [];
		for (let end = n; end > 0; end = lattice.from[end]) out.push(lattice.token[end]);
		out.reverse();
		// Consecutive unknown characters collapse into one [UNK], as the Unigram model fuses them.
		return out.filter((id, i) => !(id === this.unkId && out[i - 1] === this.unkId));
	}

	/** Relaxes every vocabulary piece starting at `start`, or an [UNK] if no single character matches. */
	private extend(lattice: Lattice, chars: string[], start: number): void {
		const limit = Math.min(chars.length, start + this.maxPieceLength);
		let piece = "";
		let singleCharMatched = false;
		for (let end = start + 1; end <= limit; end++) {
			piece += chars[end - 1];
			const hit = this.pieces.get(piece);
			if (!hit) continue;
			if (end === start + 1) singleCharMatched = true;
			relax(lattice, start, end, hit.id, hit.score);
		}
		if (!singleCharMatched) relax(lattice, start, start + 1, this.unkId, this.unkScore);
	}
}

interface Lattice {
	best: Float64Array;
	from: Int32Array;
	token: Int32Array;
}

function relax(lattice: Lattice, start: number, end: number, id: number, score: number): void {
	const total = lattice.best[start] + score;
	if (total > lattice.best[end]) {
		lattice.best[end] = total;
		lattice.from[end] = start;
		lattice.token[end] = id;
	}
}
