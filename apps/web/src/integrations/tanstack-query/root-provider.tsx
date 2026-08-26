import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

let browserQueryClient: QueryClient | undefined;

export function getContext() {
	// The server gets a fresh client per request; the browser reuses one so a
	// navigation doesn't discard the cache.
	if (typeof window === "undefined") return { queryClient: new QueryClient() };
	browserQueryClient ??= new QueryClient();
	return { queryClient: browserQueryClient };
}

export function Provider({ children, queryClient }: { children: React.ReactNode; queryClient: QueryClient }) {
	return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
