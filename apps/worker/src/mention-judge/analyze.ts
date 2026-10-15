import { availableParallelism } from "node:os";
import {
	analyzeRunMentions,
	type MentionAssessmentRecord,
	type MentionConfig,
	normalizeDomain,
	type RunMentionAssessments,
} from "@workspace/lib/mentions";
import { assessMention, type MentionAssessment } from "./assess";
import type { JudgedEntity, MentionJudge } from "./judge";
import { loadJudgePool } from "./pool";

export interface RunMentions {
	brandMentioned: boolean;
	competitorsMentioned: string[];
	mentionAssessments: RunMentionAssessments | null;
}

export interface MentionAnalyzer {
	/** Null when mentions come from substring matching; part of the mentions stamp otherwise. */
	judgeVersion: string | null;
	/** How many answers to analyze at once: as many as there are model sessions to keep busy. */
	concurrency: number;
	analyze(text: string | null, config: MentionConfig): Promise<RunMentions>;
}

const substringAnalyzer: MentionAnalyzer = {
	judgeVersion: null,
	concurrency: 1,
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
	};
}

/** An uncertain verdict still counts, so a judge that can't tell never hides a real mention. */
const counts = (record: MentionAssessmentRecord | undefined) => !!record && record.mention !== "not_mentioned";

export function judgeAnalyzer(judge: MentionJudge, concurrency = 1): MentionAnalyzer {
	return {
		judgeVersion: judge.version,
		concurrency,
		async analyze(text, config) {
			const answer = text ?? "";
			const competitorNames = config.competitors.map((competitor) => competitor.name);
			const assessments: RunMentionAssessments = {};
			const brand = await assessMention(judge, entity(config.brand, competitorNames), answer);
			if (brand) assessments.brand = toRecord(brand);
			const rivals = [config.brand.name, ...competitorNames];
			const competitors: Record<string, MentionAssessmentRecord> = {};
			for (const competitor of config.competitors) {
				const assessment = await assessMention(judge, entity(competitor, rivals), answer);
				if (assessment) competitors[competitor.name] = toRecord(assessment);
			}
			if (Object.keys(competitors).length > 0) assessments.competitors = competitors;
			return {
				brandMentioned: counts(assessments.brand),
				competitorsMentioned: competitorNames.filter((name) => counts(assessments.competitors?.[name])),
				mentionAssessments: assessments,
			};
		},
	};
}

let current: MentionAnalyzer = substringAnalyzer;

/** One session gets no faster past about four threads; more cores are used by adding sessions. */
const SINGLE_SESSION_THREADS = 4;

/**
 * Loads the judge from `MENTION_JUDGE_DIR` once per process, as `MENTION_JUDGE_WORKERS` sessions
 * (default 1, about 1 GB, plus about 0.5 GB per extra session). The worker image always sets the
 * directory; a checkout without the model falls back to substring matching rather than refusing to run.
 */
export async function loadMentionAnalyzer(env: NodeJS.ProcessEnv = process.env): Promise<MentionAnalyzer> {
	const dir = env.MENTION_JUDGE_DIR;
	if (!dir) {
		current = substringAnalyzer;
		return current;
	}
	const sessions = Math.max(1, Math.floor(Number(env.MENTION_JUDGE_WORKERS) || 1));
	const threads = sessions === 1 ? Math.min(SINGLE_SESSION_THREADS, availableParallelism()) : 1;
	current = judgeAnalyzer(await loadJudgePool(dir, sessions, threads), sessions);
	return current;
}

export function mentionAnalyzer(): MentionAnalyzer {
	return current;
}
