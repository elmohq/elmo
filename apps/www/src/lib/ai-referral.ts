import { detectAiAssistant } from "@workspace/config/ai-referral";
import { useEffect, useState } from "react";

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
	const assistant = detectAiAssistant({ referrer: document.referrer, search: window.location.search });
	if (!assistant || assistant === stored?.assistant) return stored;
	const referral = { assistant, dismissed: false };
	saveAiReferral(referral);
	return referral;
}

export function useAiReferral(): [AiReferral | null, (referral: AiReferral) => void] {
	const [referral, setReferral] = useState<AiReferral | null>(null);

	useEffect(() => {
		setReferral(loadAiReferral());
	}, []);

	const update = (next: AiReferral) => {
		saveAiReferral(next);
		setReferral(next);
	};

	return [referral, update];
}
