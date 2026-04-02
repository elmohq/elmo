import ClaritySDK from "@microsoft/clarity";

export function initClarity(projectId: string): void {
	if (typeof window === "undefined") return;
	ClaritySDK.init(projectId);
}
