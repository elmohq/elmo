/**
 * The three chosen designs for telling an organization apart from a brand, plus
 * the one thing still open: which icon carries "organization".
 *
 * Nothing here is wired to the app. These are throwaway mocks to look at and
 * sign off on — no router, no hooks, no server functions. Once the icon is
 * picked, these get built in the real components and this file goes away.
 */

import type { Meta, StoryObj } from "@storybook/react";
import {
	IconArchive,
	IconBox,
	IconBriefcase,
	IconBuildingCommunity,
	IconBuildingSkyscraper,
	IconBuildingWarehouse,
	IconCheck,
	IconChevronRight,
	IconFolders,
	IconPlus,
	IconSettings,
	IconStack2,
	IconUsersGroup,
	IconWorld,
} from "@tabler/icons-react";
import { Button } from "@workspace/ui/components/button";
import { Separator } from "@workspace/ui/components/separator";
import { cn } from "@workspace/ui/lib/utils";
import type { ComponentType, ReactNode } from "react";

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

interface MockBrand {
	id: string;
	name: string;
	current?: boolean;
}

interface MockOrg {
	id: string;
	name: string;
	brands: MockBrand[];
	canCreateBrand: boolean;
}

const ORGS: MockOrg[] = [
	{
		id: "o1",
		name: "Nike",
		canCreateBrand: true,
		brands: [
			{ id: "b1", name: "Nike Running", current: true },
			{ id: "b2", name: "Jordan" },
			{ id: "b3", name: "Nike SB" },
		],
	},
	{
		id: "o2",
		name: "Acme Workspace",
		canCreateBrand: false,
		brands: [{ id: "b4", name: "Acme Cloud" }],
	},
	// Nothing in it and nothing to add, so both empty-state lines are gone: this
	// is what a bare organization looks like now.
	{ id: "o3", name: "Umbrella Holdings", canCreateBrand: false, brands: [] },
];

type IconType = ComponentType<{ className?: string }>;

/**
 * `IconBuilding` and `IconBuildings` are missing on purpose — the sidebar spends
 * them on a brand's own settings and on competitors, and a second meaning for
 * either is the confusion this is undoing.
 */
const ORG_ICONS: { icon: IconType; name: string; note: string }[] = [
	{ icon: IconBriefcase, name: "IconBriefcase", note: "Recommended. Says business account; nothing else uses it." },
	{ icon: IconFolders, name: "IconFolders", note: "Says container-of-brands. Furthest from anything brand-shaped." },
	{ icon: IconBuildingSkyscraper, name: "IconBuildingSkyscraper", note: "What the Organization nav item uses today." },
	{
		icon: IconBuildingCommunity,
		name: "IconBuildingCommunity",
		note: "A cluster — but close to the competitors icon.",
	},
	{ icon: IconUsersGroup, name: "IconUsersGroup", note: "People. Reads like Team, which has its own nav entry." },
	{ icon: IconBuildingWarehouse, name: "IconBuildingWarehouse", note: "Distinct, but an odd metaphor." },
	{ icon: IconStack2, name: "IconStack2", note: "Abstract grouping, no real-world baggage." },
	{ icon: IconBox, name: "IconBox", note: "Neutral container." },
	{ icon: IconArchive, name: "IconArchive", note: "Reads as storage, or as 'archived'." },
];

/** What the chosen-designs story renders, so one change previews all of it. */
const OrgIcon: IconType = IconBriefcase;

// ---------------------------------------------------------------------------
// Page chrome
// ---------------------------------------------------------------------------

function Section({ title, note, children }: { title: string; note: string; children: ReactNode }) {
	return (
		<section className="space-y-4">
			<div>
				<h2 className="text-2xl font-semibold">{title}</h2>
				<p className="text-sm text-muted-foreground">{note}</p>
			</div>
			{children}
		</section>
	);
}

function Frame({ children, className }: { children: ReactNode; className?: string }) {
	return <div className={cn("rounded-lg bg-muted/40 p-5", className)}>{children}</div>;
}

// ---------------------------------------------------------------------------
// Breadcrumb — eyebrow labels
// ---------------------------------------------------------------------------

function Crumb({ kind, name }: { kind: string; name: string }) {
	return (
		<div className="leading-tight">
			<p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">{kind}</p>
			<p className="text-muted-foreground">{name}</p>
		</div>
	);
}

function BreadcrumbEyebrow() {
	return (
		<nav className="flex items-end gap-3 text-sm">
			<Crumb kind="Organization" name="Nike" />
			<IconChevronRight className="size-3.5 pb-0.5 text-muted-foreground/60" />
			<Crumb kind="Brand" name="Nike Running" />
			<IconChevronRight className="size-3.5 pb-0.5 text-muted-foreground/60" />
			<span className="pb-px font-medium">Citations</span>
		</nav>
	);
}

/** An organization's own pages have no brand between it and the page. */
function BreadcrumbEyebrowOrgPage() {
	return (
		<nav className="flex items-end gap-3 text-sm">
			<Crumb kind="Organization" name="Nike" />
			<IconChevronRight className="size-3.5 pb-0.5 text-muted-foreground/60" />
			<span className="pb-px font-medium">Billing</span>
		</nav>
	);
}

// ---------------------------------------------------------------------------
// Account menu — tree
// ---------------------------------------------------------------------------

function MenuTree({ icon: Icon = OrgIcon }: { icon?: IconType }) {
	return (
		<div className="w-72 rounded-lg border bg-popover p-1 shadow-md">
			{ORGS.map((org) => (
				<div key={org.id}>
					<div className="flex items-center justify-between rounded-sm px-2 py-1.5">
						<span className="flex min-w-0 items-center gap-2">
							<Icon className="size-4 shrink-0 text-muted-foreground" />
							<span className="truncate text-sm font-medium">{org.name}</span>
						</span>
						<IconSettings className="size-4 shrink-0 text-muted-foreground" />
					</div>
					{(org.brands.length > 0 || org.canCreateBrand) && (
						<div className="ml-4 border-l pl-1">
							{org.brands.map((brand) => (
								<div
									key={brand.id}
									className={cn("flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm", brand.current && "bg-accent")}
								>
									<IconWorld className="size-3.5 shrink-0 text-muted-foreground" />
									<span className="truncate">{brand.name}</span>
									{brand.current && <IconCheck className="ml-auto size-3.5 shrink-0" />}
								</div>
							))}
							{org.canCreateBrand && (
								<div className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-muted-foreground">
									<IconPlus className="size-3.5" />
									<span className="text-xs">New brand</span>
								</div>
							)}
						</div>
					)}
				</div>
			))}
			<Separator className="my-1" />
			<div className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-muted-foreground">
				<IconPlus className="size-4" />
				New organization
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// /app — cards
// ---------------------------------------------------------------------------

function AppCards({ icon: Icon = OrgIcon }: { icon?: IconType }) {
	return (
		<div className="w-full max-w-lg space-y-4">
			{ORGS.map((org) => (
				<div key={org.id} className="overflow-hidden rounded-xl border bg-background">
					<div className="flex items-center gap-3 border-b bg-muted/30 px-4 py-3">
						<span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
							<Icon className="size-5" />
						</span>
						<p className="min-w-0 flex-1 truncate font-medium">{org.name}</p>
						<Button variant="ghost" size="icon" aria-label={`${org.name} settings`}>
							<IconSettings className="size-4" />
						</Button>
					</div>
					{(org.brands.length > 0 || org.canCreateBrand) && (
						<div className="divide-y">
							{org.brands.map((brand) => (
								<div key={brand.id} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-accent/50">
									<IconWorld className="size-4 text-muted-foreground" />
									<span className="flex-1 truncate">{brand.name}</span>
									<IconChevronRight className="size-4 text-muted-foreground/60" />
								</div>
							))}
							{org.canCreateBrand && (
								<div className="flex items-center gap-3 px-4 py-2.5 text-sm text-muted-foreground hover:bg-accent/50">
									<IconPlus className="size-4" />
									New brand
								</div>
							)}
						</div>
					)}
				</div>
			))}
			<Button variant="outline" className="w-full gap-1.5">
				<IconPlus className="size-4" />
				New organization
			</Button>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

function Chosen() {
	return (
		<div className="min-h-svh bg-background p-8 text-foreground antialiased">
			<div className="mx-auto max-w-5xl space-y-12">
				<header>
					<h1 className="text-3xl font-bold">Organization vs brand — chosen designs</h1>
					<p className="text-muted-foreground">
						Drawn with the recommended organization mark. The other story compares the alternatives.
					</p>
				</header>

				<Section title="Breadcrumbs" note="An eyebrow over each name says what kind of thing it is.">
					<div className="space-y-3">
						<Frame>
							<BreadcrumbEyebrow />
						</Frame>
						<Frame>
							<BreadcrumbEyebrowOrgPage />
						</Frame>
					</div>
				</Section>

				<Section
					title="Account menu"
					note="Brands hang off their organization on a rule. An organization with no brands and no way to add one shows nothing beneath it."
				>
					<Frame className="w-fit">
						<MenuTree />
					</Frame>
				</Section>

				<Section
					title="/app directory"
					note="A card per organization. Settings is the icon alone, there is no brand count, and an empty organization is just its header."
				>
					<Frame>
						<AppCards />
					</Frame>
				</Section>
			</div>
		</div>
	);
}

function IconOptions() {
	return (
		<div className="min-h-svh bg-background p-8 text-foreground antialiased">
			<div className="mx-auto max-w-6xl space-y-6">
				<header>
					<h1 className="text-3xl font-bold">Which mark means "organization"?</h1>
					<p className="text-muted-foreground">
						The same tree, once per candidate. Brand rows keep the globe, so the contrast between the two levels is what
						to judge.
					</p>
				</header>

				<div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
					{ORG_ICONS.map(({ icon: Icon, name, note }) => (
						<div key={name} className="space-y-2 rounded-xl border bg-card p-4">
							<div className="flex items-center gap-2">
								<Icon className="size-5 text-primary" />
								<code className="font-mono text-xs font-semibold">{name}</code>
							</div>
							<p className="text-xs text-muted-foreground">{note}</p>
							<Frame className="w-fit">
								<MenuTree icon={Icon} />
							</Frame>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}

const meta = {
	title: "Explorations/Organization vs Brand",
	parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;

/** Breadcrumb, account menu and /app as chosen, refined. */
export const ChosenDesigns: StoryObj = { render: () => <Chosen /> };

/** The same menu, once per candidate organization icon. */
export const OrganizationIcon: StoryObj = { render: () => <IconOptions /> };
