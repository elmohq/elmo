import {
	analyzeRunMentions,
	type MentionAssessmentRecord,
	type MentionConfig,
	normalizeDomain,
	type RunMentionAssessments,
	subjectFingerprint,
} from "@workspace/lib/mentions";
import { assessMention, type MentionAssessment } from "./assess";
import { type JudgedEntity, loadMentionJudge, type MentionJudge } from "./judge";

export interface RunMentions {
	brandMentioned: boolean;
	competitorsMentioned: string[];
	mentionAssessments: RunMentionAssessments | null;
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

const substringAnalyzer: MentionAnalyzer = {
	judgeVersion: null,
	analyze: async (text, config) => ({ ...analyzeRunMentions(text, config), mentionAssessments: null }),
};

type Subject = MentionConfig["brand"];

const present = (values: string[]) => values.map((value) => value.trim()).filter(Boolean);

function entity(subject: Subject, rivals: string[]): JudgedEntity {
	return {
		name: subject.name.trim(),
		aliases: present(subject.aliases),
		domains: present(subject.domains).map(normalizeDomain),
		competitors: rivals.filter((name) => name !== subject.name),
	};
}

function toRecord(assessment: MentionAssessment): MentionAssessmentRecord {
	const { mention, mentionProbability, reason, sentiment, sentimentProbabilities, evidence } = assessment;
	return {
		mention,
		probability: mentionProbability,
		...(reason ? { reason } : {}),
		...(sentiment ? { sentiment, sentimentProbabilities } : {}),
		...(evidence ? { evidence: { start: evidence.start, end: evidence.end } } : {}),
		...(assessment.firstMention === undefined
			? {}
			: { firstMention: assessment.firstMention, mentionCount: assessment.mentionCount }),
	};
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
			const competitorNames = config.competitors.map((competitor) => competitor.name);
			const rivals = [config.brand.name, ...competitorNames];
			const judgeSubject = async (
				subject: MentionConfig["brand"],
				fingerprint: string,
				before: { fingerprint?: string; record?: MentionAssessmentRecord },
				rivalNames: string[],
			): Promise<MentionAssessmentRecord | undefined> => {
				if (before.fingerprint === fingerprint) return before.record && { ...before.record };
				const assessment = await assessMention(judge, entity(subject, rivalNames), answer);
				return assessment ? toRecord(assessment) : undefined;
			};

			const brandFingerprint = subjectFingerprint(config.brand, judge.version);
			const judgedCompetitors: Record<string, string> = {};
			const assessments: RunMentionAssessments = {
				judged: { brand: brandFingerprint, competitors: judgedCompetitors },
			};
			const brand = await judgeSubject(
				config.brand,
				brandFingerprint,
				{ fingerprint: previous?.judged?.brand, record: previous?.brand },
				competitorNames,
			);
			if (brand) assessments.brand = brand;
			const competitors: Record<string, MentionAssessmentRecord> = {};
			for (const competitor of config.competitors) {
				const fingerprint = subjectFingerprint(competitor, judge.version);
				judgedCompetitors[competitor.name] = fingerprint;
				const record = await judgeSubject(
					competitor,
					fingerprint,
					{
						fingerprint: previous?.judged?.competitors?.[competitor.name],
						record: previous?.competitors?.[competitor.name],
					},
					rivals,
				);
				if (record) competitors[competitor.name] = record;
			}
			if (Object.keys(competitors).length > 0) assessments.competitors = competitors;
			// Recomputed every time from the stored first-mention offsets, so a new competitor
			// reorders everyone without re-judging them.
			rank([assessments.brand, ...Object.values(competitors)]);
			return {
				brandMentioned: counts(assessments.brand),
				competitorsMentioned: competitorNames.filter((name) => counts(assessments.competitors?.[name])),
				mentionAssessments: assessments,
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
