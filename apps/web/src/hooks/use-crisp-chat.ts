import { useSyncExternalStore } from "react";
import { type CrispChatState, getCrispChatState, getServerCrispChatState, subscribeCrispChat } from "@/lib/crisp";

export function useCrispChat(): CrispChatState {
	return useSyncExternalStore(subscribeCrispChat, getCrispChatState, getServerCrispChatState);
}
