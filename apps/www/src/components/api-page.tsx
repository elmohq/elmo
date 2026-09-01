import { createClientAPIPage } from "fumadocs-openapi/ui/create-client";

export const ClientAPIPage = createClientAPIPage({
	content: {
		// Same layout fumadocs ships, with the description moved above the
		// playground: it is the page's opening prose and reads as a caption
		// stranded under the widget when it follows it.
		renderOperationLayout: (slots) => (
			<div className="flex flex-col gap-x-6 gap-y-4 @4xl:flex-row @4xl:items-start">
				<div className="min-w-0 flex-1">
					{slots.header}
					{slots.description}
					{slots.apiPlayground}
					{slots.authSchemes}
					{slots.parameters}
					{slots.body}
					{slots.responses}
					{slots.callbacks}
				</div>
				<div className="@4xl:sticky @4xl:top-[calc(var(--fd-docs-row-1,2rem)+1rem)] @4xl:w-[400px]">
					{slots.apiExample}
				</div>
			</div>
		),
	},
});
