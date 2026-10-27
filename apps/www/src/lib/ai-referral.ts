import { detectAiAssistant } from "@workspace/config/ai-referral";

const STORAGE_KEY = "elmo:ai-referral";

export type AiReferral = { assistant: string; dismissed: boolean };

function read(): AiReferral | null {
	try {
		const raw = window.sessionStorage.getItem(STORAGE_KEY);
		return raw ? (JSON.parse(raw) as AiReferral) : null;
	} catch {
		return null;
	}
}

export function saveAiReferral(referral: AiReferral): void {
	try {
		window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(referral));
	} catch {}
}

export function loadAiReferral(): AiReferral | null {
	const stored = read();
	if (stored) return stored;
	const assistant = detectAiAssistant({ referrer: document.referrer, search: window.location.search });
	if (!assistant) return null;
	const referral = { assistant, dismissed: false };
	saveAiReferral(referral);
	return referral;
}
