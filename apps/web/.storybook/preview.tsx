import { useState } from "react";
import type { Preview } from "@storybook/react-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import "../src/styles.css";

const preview: Preview = {
	decorators: [
		(Story) => {
			const [client] = useState(
				() =>
					new QueryClient({
						defaultOptions: { queries: { retry: false } },
					}),
			);
			return (
				<QueryClientProvider client={client}>
					<Story />
				</QueryClientProvider>
			);
		},
	],
};

export default preview;
