import { join } from "node:path";
import {
	judgedSubject,
	type MentionAssessment,
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
	/** Part of the mentions stamp. */
	judgeVersion: string;
	/**
	 * `previous` is what the run already has; subjects judged under an unchanged fingerprint keep
	 * their verdicts. Pass it only when the text is the one those verdicts were judged on.
	 */
	analyze(text: string | null, config: MentionConfig, previous?: RunMentionAssessments | null): Promise<RunMentions>;
}

type Subject = MentionConfig["brand"];

function entity(subject: Subject, rivals: string[]): JudgedEntity {
	return { ...judgedSubject(subject), competitors: rivals.filter((name) => name !== subject.name) };
}

/** Ranks the companies an answer names by where it first mentions each. */
function rank(records: (MentionAssessment | undefined)[]): void {
	const placed = records.filter(
		(record): record is MentionAssessment & { firstMention: number } =>
			!!record?.mentioned && record.firstMention !== undefined,
	);
	placed.sort((a, b) => a.firstMention - b.firstMention);
	placed.forEach((record, i) => {
		record.position = i + 1;
	});
}

export function judgeAnalyzer(judge: MentionJudge): MentionAnalyzer {
	return {
		judgeVersion: judge.version,
		async analyze(text, config, previous) {
			const answer = text ?? "";
			const rivals = [config.brand.name, ...config.competitors.map((competitor) => competitor.name)];
			/** Keeps the verdict judged under the same fingerprint, a copy since `rank` rewrites positions. */
			const judgeSubject = async (subject: Subject, judgedAs?: string, kept?: MentionAssessment) => {
				const fingerprint = subjectFingerprint(subject, judge.version);
				const record =
					judgedAs === fingerprint
						? kept && { ...kept }
						: ((await assessMention(judge, entity(subject, rivals), answer)) ?? undefined);
				return { fingerprint, record };
			};

			const brand = await judgeSubject(config.brand, previous?.judged.brand, previous?.brand);
			const competitors: { name: string; fingerprint: string; record?: MentionAssessment }[] = [];
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
				brandMentioned: !!assessments.brand?.mentioned,
				competitorsMentioned: competitors.filter((c) => c.record?.mentioned).map((c) => c.name),
				assessments,
			};
		},
	};
}

/** Where the worker image puts the model; a checkout gets it with `pnpm --filter @workspace/worker judge:pull`. */
export const MENTION_JUDGE_DIR = join(__dirname, "../../mention-judge");

let current: MentionAnalyzer | undefined;

export async function loadMentionAnalyzer(dir = MENTION_JUDGE_DIR): Promise<MentionAnalyzer> {
	current = judgeAnalyzer(await loadMentionJudge(dir));
	return current;
}

export function mentionJudgeLoaded(): boolean {
	return current !== undefined;
}

export function mentionAnalyzer(): MentionAnalyzer {
	if (!current) throw new Error("the mention judge isn't loaded");
	return current;
}
