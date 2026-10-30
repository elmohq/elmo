import type { Meta, StoryObj } from "@storybook/react";
import { TooltipProvider } from "@workspace/ui/components/tooltip";
import type { ComponentType, ReactNode } from "react";
import { expect, userEvent, within } from "storybook/test";
import { Route } from "@/routes/_authed/app/org/$org/brand/$brand/settings/brand";
import { setMockBrand } from "./_mocks/use-brands";

const BrandSettingsPage = (Route as unknown as { options: { component: ComponentType } }).options.component;

// Stable identity: the page reseeds its fields whenever `updatedAt` changes.
const MOCK_BRAND = {
	id: "mock-brand-id",
	name: "Acme Corp",
	slug: "acme-corp",
	website: "https://acme.com",
	additionalDomains: ["acme.co.uk", "acme.de"],
	aliases: ["Acme Inc", "Acme Corporation"],
	updatedAt: new Date("2026-09-01T00:00:00Z"),
};

function Shell({ children }: { children: ReactNode }) {
	return (
		<TooltipProvider>
			<div className="bg-background text-foreground antialiased min-h-svh p-4 md:p-6">{children}</div>
		</TooltipProvider>
	);
}

const meta = {
	title: "Settings/Brand",
	component: BrandSettingsPage,
	parameters: { layout: "fullscreen" },
	decorators: [
		(Story) => (
			<Shell>
				<Story />
			</Shell>
		),
	],
} satisfies Meta<typeof BrandSettingsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	render: () => {
		setMockBrand(MOCK_BRAND);
		return <BrandSettingsPage />;
	},
};

async function openDomains(canvasElement: HTMLElement) {
	const canvas = within(canvasElement);
	await canvas.findByText("Additional Domains");
	// Brand name, slug, and website are plain inputs, so domains is the first combobox.
	const [domains] = canvas.getAllByRole("combobox");
	await userEvent.click(domains);
	return within(canvasElement.ownerDocument.body);
}

export const RejectsCoveredDomain: Story = {
	render: () => {
		setMockBrand(MOCK_BRAND);
		return <BrandSettingsPage />;
	},
	play: async ({ canvasElement }) => {
		const documentBody = await openDomains(canvasElement);

		await userEvent.type(await documentBody.findByPlaceholderText("Add domain..."), "blog.acme.com");
		await userEvent.keyboard("{Enter}");

		await expect(documentBody.findByText(/already covered by acme\.com/i)).resolves.toBeVisible();
		expect(within(canvasElement).queryByText("blog.acme.com")).toBeNull();
	},
};

export const RejectsTheWebsite: Story = {
	render: () => {
		setMockBrand(MOCK_BRAND);
		return <BrandSettingsPage />;
	},
	play: async ({ canvasElement }) => {
		const documentBody = await openDomains(canvasElement);

		await userEvent.type(await documentBody.findByPlaceholderText("Add domain..."), "acme.com");
		await userEvent.keyboard("{Enter}");

		await expect(documentBody.findByText(/is already tracked/i)).resolves.toBeVisible();
	},
};
