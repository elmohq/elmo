import ClaritySDK from "@microsoft/clarity";

let initialized = false;

export function initClarity(projectId: string): void {
	if (initialized || typeof window === "undefined") return;
	if (!import.meta.env.PROD) return;

	ClaritySDK.init(projectId);
	initialized = true;
}
