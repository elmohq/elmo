import type { Meta, StoryObj } from "@storybook/react";
import { cleanAndValidateDomain } from "@workspace/lib/citations/domain-categories";
import { Label } from "@workspace/ui/components/label";
import { TagsInput } from "@workspace/ui/components/tags-input";
import { useMemo, useState } from "react";
import { expect, userEvent, within } from "storybook/test";

const meta = {
	title: "Components/TagsInput",
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

/** Standalone freeform input — each field manages its own values. */
export const Freeform = () => {
	const [values, setValues] = useState<string[]>(["example.com", "blog.example.com"]);

	return (
		<div className="p-8 max-w-xl space-y-6">
			<div className="space-y-2">
				<Label>Domains</Label>
				<TagsInput
					value={values}
					onValueChange={setValues}
					placeholder="Add domain..."
					searchPlaceholder="Add domain..."
					maxItems={10}
				/>
				<p className="text-xs text-muted-foreground">Type a domain and press Enter, or paste a comma-separated list.</p>
			</div>
		</div>
	);
};

const DOMAIN_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

/** Validation — errors shown inside the popover. Try typing "bad" to see it. */
export const WithValidation: Story = {
	render: () => {
		const [values, setValues] = useState<string[]>(["example.com"]);

		return (
			<div className="p-8 max-w-xl space-y-6">
				<div className="space-y-2">
					<Label>Domains (validated)</Label>
					<TagsInput
						value={values}
						onValueChange={setValues}
						placeholder="Add domain..."
						searchPlaceholder="Add domain..."
						maxItems={10}
						onValidate={(val) => (DOMAIN_REGEX.test(val.toLowerCase()) ? true : `"${val}" is not a valid domain`)}
					/>
					<p className="text-xs text-muted-foreground">
						Try adding &ldquo;bad&rdquo; or &ldquo;not a domain!&rdquo; to see inline validation.
					</p>
					<p data-testid="values">{values.join(", ")}</p>
				</div>
			</div>
		);
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const documentBody = within(canvasElement.ownerDocument.body);

		await userEvent.click(canvas.getByRole("combobox"));
		const input = await documentBody.findByPlaceholderText("Add domain...");
		await userEvent.type(input, "bad");
		await userEvent.keyboard("{Enter}");

		await expect(documentBody.findByText('"bad" is not a valid domain')).resolves.toBeVisible();
		expect(canvas.getByTestId("values")).toHaveTextContent(/^example\.com$/);

		await userEvent.clear(input);
		await userEvent.type(input, "acme.io");
		await userEvent.keyboard("{Enter}");

		await expect(canvas.getByTestId("values")).toHaveTextContent(/^example\.com, acme\.io$/);
		expect(documentBody.queryByText(/not a valid domain/)).toBeNull();
	},
};

/** A full URL is normalized to its domain when pasted into a domain field. */
export const UrlPaste: StoryObj = {
	render: () => {
		const [values, setValues] = useState<string[]>([]);

		return (
			<div className="p-8 max-w-xl space-y-6">
				<div className="space-y-2">
					<Label>Domains</Label>
					<TagsInput
						value={values}
						onValueChange={setValues}
						placeholder="Add domain..."
						normalizeValue={(raw) => cleanAndValidateDomain(raw) ?? raw.trim()}
						pasteSplitter={/[\n,\t]+/}
						onValidate={(value) => (cleanAndValidateDomain(value) ? true : `"${value}" is not a valid domain`)}
					/>
				</div>
			</div>
		);
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const documentBody = within(canvasElement.ownerDocument.body);

		await userEvent.click(canvas.getByRole("combobox"));
		await userEvent.click(await documentBody.findByPlaceholderText("Search..."));
		await userEvent.paste("https://www.example.com/pricing?utm_source=ad");

		await expect(canvas.findByText("example.com")).resolves.toBeVisible();
	},
};

/**
 * A pasted list is added in one go: invalid values, duplicates, and values past
 * the limit are skipped, and each value is checked against those pasted before it.
 */
export const PasteList: Story = {
	render: () => {
		const [values, setValues] = useState<string[]>(["example.com"]);

		return (
			<div className="p-8 max-w-xl space-y-2">
				<Label>Domains</Label>
				<TagsInput
					value={values}
					onValueChange={setValues}
					placeholder="Add domain..."
					searchPlaceholder="Add domain..."
					maxItems={4}
					pasteSplitter={/[\n,\t]+/}
					onValidate={(val, current) => {
						if (!DOMAIN_REGEX.test(val)) return `"${val}" is not a valid domain`;
						const parent = current.find((d) => val.endsWith(`.${d}`));
						return parent ? `"${val}" is already covered by ${parent}` : true;
					}}
				/>
				<p data-testid="values">{values.join(", ")}</p>
			</div>
		);
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const documentBody = within(canvasElement.ownerDocument.body);

		await userEvent.click(canvas.getByRole("combobox"));
		await userEvent.click(await documentBody.findByPlaceholderText("Add domain..."));
		await userEvent.paste("acme.io\nshop.acme.io, not a domain, acme.io\tb.com, c.com, d.com");

		await expect(canvas.getByTestId("values")).toHaveTextContent(/^example\.com, acme\.io, b\.com, c\.com$/);
		await expect(documentBody.findByText('"shop.acme.io" is already covered by acme.io')).resolves.toBeVisible();
	},
};

/**
 * Shared options across multiple inputs — like prompt tags where any tag
 * added to one prompt shows up as a suggestion for the others.
 */
export const SharedOptions = () => {
	const [promptA, setPromptA] = useState<string[]>(["seo", "competitor"]);
	const [promptB, setPromptB] = useState<string[]>(["pricing"]);
	const [promptC, setPromptC] = useState<string[]>([]);

	const allTags = useMemo(() => {
		const set = new Set([...promptA, ...promptB, ...promptC]);
		return [...set].sort().map((t) => ({ value: t }));
	}, [promptA, promptB, promptC]);

	return (
		<div className="p-8 max-w-xl space-y-8">
			<div>
				<p className="text-sm text-muted-foreground mb-4">
					Tags added to any prompt appear as suggestions in the others. You can still type new tags that don&apos;t
					exist yet.
				</p>
			</div>

			<div className="space-y-2">
				<Label>Prompt: &ldquo;best CRM for startups&rdquo;</Label>
				<TagsInput
					value={promptA}
					onValueChange={setPromptA}
					options={allTags}
					placeholder="Add tags..."
					searchPlaceholder="Search or create tag..."
					maxItems={8}
				/>
			</div>

			<div className="space-y-2">
				<Label>Prompt: &ldquo;cheapest project management tool&rdquo;</Label>
				<TagsInput
					value={promptB}
					onValueChange={setPromptB}
					options={allTags}
					placeholder="Add tags..."
					searchPlaceholder="Search or create tag..."
					maxItems={8}
				/>
			</div>

			<div className="space-y-2">
				<Label>Prompt: &ldquo;best analytics platform&rdquo;</Label>
				<TagsInput
					value={promptC}
					onValueChange={setPromptC}
					options={allTags}
					placeholder="Add tags..."
					searchPlaceholder="Search or create tag..."
					maxItems={8}
				/>
			</div>
		</div>
	);
};

export const KeyboardSelection: Story = {
	render: () => {
		const [values, setValues] = useState<string[]>([]);

		return (
			<div className="p-8 max-w-xl space-y-2">
				<Label>Prompt tags</Label>
				<TagsInput
					value={values}
					onValueChange={setValues}
					options={[{ value: "marketing" }]}
					placeholder="Add tag..."
					searchPlaceholder="Search tags..."
				/>
				<p data-testid="selected-tags">{values.join(", ")}</p>
			</div>
		);
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);

		await userEvent.click(canvas.getByRole("combobox"));
		const input = await within(document.body).findByPlaceholderText("Search tags...");
		await userEvent.type(input, "mark");
		await userEvent.keyboard("{ArrowDown}{Enter}");

		await expect(canvas.getByTestId("selected-tags")).toHaveTextContent(/^marketing$/);
	},
};
