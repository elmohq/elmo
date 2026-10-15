import {
	analyzeRunMentions,
	judgedSubject,
	type MentionAssessmentRecord,
	type MentionConfig,
	type RunMentionAssessments,
	subjectFingerprint,
} from "@workspace/lib/mentions";
import { assessMention } from "./assess";
import { type JudgedEntity, loadMentionJudge, type MentionJudge } from "./judge";

export interface RunMentions {
	brandMentioned: boolean;
	competitorsMentioned: string[];
	assessments: RunMentionAssessments | null;
}

export interface MentionAnalyzer {
	/** Null when mentions come from substring matching; part of the mentions stamp otherwise. */
	judgeVersion: string | null;
	/**
	 * `previous` is what the run already has; subjects judged under an unchanged fingerprint keep
	 * their verdicts. Pass it only when the text is the one those verdicts were judged on.
	 */
	analyze(text: string | null, config: MentionConfig, previous?: RunMentionAssessments | null): Promise<RunMentions>;
}

export const substringAnalyzer: MentionAnalyzer = {
	judgeVersion: null,
	analyze: async (text, config) => ({ ...analyzeRunMentions(text, config), assessments: null }),
};

type Subject = MentionConfig["brand"];

function entity(subject: Subject, rivals: string[]): JudgedEntity {
	return { ...judgedSubject(subject), competitors: rivals.filter((name) => name !== subject.name) };
}

/** Ranks the companies an answer names by where it first mentions each. */
function rank(records: (MentionAssessmentRecord | undefined)[]): void {
	const placed = records.filter(
		(record): record is MentionAssessmentRecord & { firstMention: number } =>
			!!record && record.mention !== "not_mentioned" && record.firstMention !== undefined,
	);
	placed.sort((a, b) => a.firstMention - b.firstMention);
	placed.forEach((record, i) => {
		record.position = i + 1;
	});
}

/** An uncertain verdict still counts, so a judge that can't tell never hides a real mention. */
const counts = (record: MentionAssessmentRecord | undefined) => !!record && record.mention !== "not_mentioned";

export function judgeAnalyzer(judge: MentionJudge): MentionAnalyzer {
	return {
		judgeVersion: judge.version,
		async analyze(text, config, previous) {
			const answer = text ?? "";
			const rivals = [config.brand.name, ...config.competitors.map((competitor) => competitor.name)];
			/** Keeps the verdict judged under the same fingerprint, a copy since `rank` rewrites positions. */
			const judgeSubject = async (subject: Subject, judgedAs?: string, kept?: MentionAssessmentRecord) => {
				const fingerprint = subjectFingerprint(subject, judge.version);
				const record =
					judgedAs === fingerprint
						? kept && { ...kept }
						: ((await assessMention(judge, entity(subject, rivals), answer)) ?? undefined);
				return { fingerprint, record };
			};

			const brand = await judgeSubject(config.brand, previous?.judged.brand, previous?.brand);
			const competitors: { name: string; fingerprint: string; record?: MentionAssessmentRecord }[] = [];
			for (const competitor of config.competitors) {
				const { name } = competitor;
				competitors.push({
					name,
					...(await judgeSubject(competitor, previous?.judged.competitors[name], previous?.competitors[name])),
				});
			}
			const assessments: RunMentionAssessments = {
				...(brand.record ? { brand: brand.record } : {}),
				competitors: Object.fromEntries(competitors.flatMap((c) => (c.record ? [[c.name, c.record]] : []))),
				judged: {
					brand: brand.fingerprint,
					competitors: Object.fromEntries(competitors.map((c) => [c.name, c.fingerprint])),
				},
			};
			// Recomputed every time from the stored first-mention offsets, so a new competitor
			// reorders everyone without re-judging them.
			rank([assessments.brand, ...Object.values(assessments.competitors)]);
			return {
				brandMentioned: counts(assessments.brand),
				competitorsMentioned: competitors.filter((c) => counts(c.record)).map((c) => c.name),
				assessments,
			};
		},
	};
}

let current: MentionAnalyzer = substringAnalyzer;

/**
 * Loads the judge from `MENTION_JUDGE_DIR` once per process. The worker image always sets it;
 * a checkout without the model falls back to substring matching rather than refusing to run.
 */
export async function loadMentionAnalyzer(dir = process.env.MENTION_JUDGE_DIR): Promise<MentionAnalyzer> {
	current = dir ? judgeAnalyzer(await loadMentionJudge(dir)) : substringAnalyzer;
	return current;
}

export function mentionAnalyzer(): MentionAnalyzer {
	return current;
}
