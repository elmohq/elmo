import type { Decorator } from "@storybook/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "../src/styles.css";

const queryClients = new Map<string, QueryClient>();

function queryClientFor(storyId: string): QueryClient {
	const existing = queryClients.get(storyId);
	if (existing) return existing;

	const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
	queryClients.set(storyId, client);
	return client;
}

const withQueryClient: Decorator = (Story, context) => (
	<QueryClientProvider client={queryClientFor(context.id)}>
		<Story />
	</QueryClientProvider>
);

export const decorators: Decorator[] = [withQueryClient];
