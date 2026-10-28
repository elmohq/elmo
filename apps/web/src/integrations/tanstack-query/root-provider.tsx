import { QueryClient } from "@tanstack/react-query";

let browserQueryClient: QueryClient | undefined;

export function getContext() {
	if (typeof window === "undefined") return { queryClient: new QueryClient() };
	browserQueryClient ??= new QueryClient();
	return { queryClient: browserQueryClient };
}
