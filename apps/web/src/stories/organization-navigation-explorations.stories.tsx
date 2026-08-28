/**
 * Design sketches for telling an organization apart from a brand, in the three
 * places the distinction currently reads poorly: the breadcrumb, the account
 * menu, and `/app`.
 *
 * Nothing here is wired to the app. These are throwaway mocks to look at side
 * by side and choose from — no router, no hooks, no server functions. Whatever
 * wins gets built properly in the real components and this file goes away.
 */

import type { Meta, StoryObj } from "@storybook/react";
import {
	IconBuilding,
	IconCheck,
	IconChevronRight,
	IconPlus,
	IconSelector,
	IconSettings,
	IconWorld,
} from "@tabler/icons-react";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Separator } from "@workspace/ui/components/separator";
import { cn } from "@workspace/ui/lib/utils";
import type { ReactNode } from "react";

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
	slug: string;
	brands: MockBrand[];
	canCreateBrand: boolean;
}

const ORGS: MockOrg[] = [
	{
		id: "o1",
		name: "Nike",
		slug: "nike",
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
		slug: "acme",
		canCreateBrand: false,
		brands: [{ id: "b4", name: "Acme Cloud" }],
	},
	{
		id: "o3",
		name: "Umbrella Holdings",
		slug: "umbrella",
		canCreateBrand: true,
		brands: [],
	},
];

const CURRENT_ORG = ORGS[0];

// ---------------------------------------------------------------------------
// Layout chrome for the comparison page
// ---------------------------------------------------------------------------

function Section({ title, note, children }: { title: string; note: string; children: ReactNode }) {
	return (
		<section className="space-y-4">
			<div>
				<h2 className="text-2xl font-semibold">{title}</h2>
				<p className="text-sm text-muted-foreground">{note}</p>
			</div>
			<div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">{children}</div>
		</section>
	);
}

function Option({ label, note, children }: { label: string; note: string; children: ReactNode }) {
	return (
		<div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
			<div>
				<p className="text-sm font-semibold">{label}</p>
				<p className="text-xs text-muted-foreground">{note}</p>
			</div>
			<div className="flex flex-1 items-start rounded-lg bg-muted/40 p-4">{children}</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Breadcrumb options
// ---------------------------------------------------------------------------

/** A. Today: the word appended to the name. */
function CrumbAppendedWord() {
	return (
		<nav className="flex items-center gap-2 text-sm">
			<span className="text-muted-foreground">Nike Organization</span>
			<IconChevronRight className="size-3.5 text-muted-foreground/60" />
			<span className="text-muted-foreground">Nike Running</span>
			<IconChevronRight className="size-3.5 text-muted-foreground/60" />
			<span className="font-medium">Citations</span>
		</nav>
	);
}

/** B. An eyebrow above each name says what kind of thing it is. */
function CrumbEyebrow() {
	return (
		<nav className="flex items-end gap-3 text-sm">
			<div className="leading-tight">
				<p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">Organization</p>
				<p className="text-muted-foreground">Nike</p>
			</div>
			<IconChevronRight className="size-3.5 pb-0.5 text-muted-foreground/60" />
			<div className="leading-tight">
				<p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">Brand</p>
				<p className="text-muted-foreground">Nike Running</p>
			</div>
			<IconChevronRight className="size-3.5 pb-0.5 text-muted-foreground/60" />
			<span className="pb-px font-medium">Citations</span>
		</nav>
	);
}

/** C. A small badge in front of each name. */
function CrumbBadge() {
	return (
		<nav className="flex items-center gap-2 text-sm">
			<Badge variant="outline" className="gap-1 font-normal">
				<IconBuilding className="size-3" />
				Nike
			</Badge>
			<IconChevronRight className="size-3.5 text-muted-foreground/60" />
			<Badge variant="secondary" className="gap-1 font-normal">
				<IconWorld className="size-3" />
				Nike Running
			</Badge>
			<IconChevronRight className="size-3.5 text-muted-foreground/60" />
			<span className="font-medium">Citations</span>
		</nav>
	);
}

/** D. An icon alone carries the kind; the trail stays one line of text. */
function CrumbIconOnly() {
	return (
		<nav className="flex items-center gap-2 text-sm">
			<span className="flex items-center gap-1.5 text-muted-foreground">
				<IconBuilding className="size-3.5" />
				Nike
			</span>
			<IconChevronRight className="size-3.5 text-muted-foreground/60" />
			<span className="flex items-center gap-1.5 text-muted-foreground">
				<IconWorld className="size-3.5" />
				Nike Running
			</span>
			<IconChevronRight className="size-3.5 text-muted-foreground/60" />
			<span className="font-medium">Citations</span>
		</nav>
	);
}

/** E. The organization is a boxed prefix, outside the trail entirely. */
function CrumbBoxedOrg() {
	return (
		<div className="flex items-center gap-3">
			<div className="flex items-center gap-2 rounded-md border bg-background px-2 py-1">
				<span className="flex size-5 items-center justify-center rounded bg-primary/10 text-[9px] font-semibold text-primary">
					NI
				</span>
				<span className="text-xs font-medium">Nike</span>
			</div>
			<nav className="flex items-center gap-2 text-sm">
				<span className="text-muted-foreground">Nike Running</span>
				<IconChevronRight className="size-3.5 text-muted-foreground/60" />
				<span className="font-medium">Citations</span>
			</nav>
		</div>
	);
}

/** F. Two lines: the organization sits over the page's own trail. */
function CrumbStacked() {
	return (
		<div className="leading-tight">
			<p className="text-[11px] text-muted-foreground/80">Nike</p>
			<nav className="flex items-center gap-2 text-sm">
				<span className="text-muted-foreground">Nike Running</span>
				<IconChevronRight className="size-3.5 text-muted-foreground/60" />
				<span className="font-medium">Citations</span>
			</nav>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Account-menu options
// ---------------------------------------------------------------------------

function MenuFrame({ children }: { children: ReactNode }) {
	return <div className="w-72 rounded-lg border bg-popover p-1 shadow-md">{children}</div>;
}

function MenuRow({
	children,
	muted = false,
	current = false,
}: {
	children: ReactNode;
	muted?: boolean;
	current?: boolean;
}) {
	return (
		<div
			className={cn(
				"flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm",
				muted && "text-muted-foreground",
				current && "bg-accent",
			)}
		>
			{children}
		</div>
	);
}

/** A. Today: a muted heading, brands flat under it. */
function MenuFlatHeading() {
	return (
		<MenuFrame>
			{ORGS.slice(0, 2).map((org) => (
				<div key={org.id}>
					<div className="flex items-center justify-between px-2 py-1.5">
						<span className="text-sm font-medium text-muted-foreground">{org.name} Organization</span>
						<IconSettings className="size-4 text-muted-foreground" />
					</div>
					{org.brands.map((brand) => (
						<MenuRow key={brand.id} current={brand.current}>
							<span className="truncate">{brand.name}</span>
							{brand.current && <IconCheck className="ml-auto size-3.5" />}
						</MenuRow>
					))}
					<Separator className="my-1" />
				</div>
			))}
		</MenuFrame>
	);
}

/** B. A tree: the organization is a root, its brands hang off it. */
function MenuTree() {
	return (
		<MenuFrame>
			{ORGS.map((org) => (
				<div key={org.id}>
					<div className="flex items-center justify-between rounded-sm px-2 py-1.5">
						<span className="flex min-w-0 items-center gap-2">
							<IconBuilding className="size-4 shrink-0 text-muted-foreground" />
							<span className="truncate text-sm font-medium">{org.name}</span>
						</span>
						<IconSettings className="size-4 shrink-0 text-muted-foreground" />
					</div>
					<div className="ml-4 border-l pl-1">
						{org.brands.map((brand) => (
							<MenuRow key={brand.id} current={brand.current}>
								<IconWorld className="size-3.5 shrink-0 text-muted-foreground" />
								<span className="truncate">{brand.name}</span>
								{brand.current && <IconCheck className="ml-auto size-3.5" />}
							</MenuRow>
						))}
						{org.brands.length === 0 && (
							<MenuRow muted>
								<span className="text-xs">No brands yet</span>
							</MenuRow>
						)}
						{org.canCreateBrand && (
							<MenuRow muted>
								<IconPlus className="size-3.5" />
								<span className="text-xs">New brand</span>
							</MenuRow>
						)}
					</div>
				</div>
			))}
		</MenuFrame>
	);
}

/** C. Kind labels as eyebrows, repeated per group. */
function MenuLabelled() {
	return (
		<MenuFrame>
			{ORGS.slice(0, 2).map((org) => (
				<div key={org.id} className="mb-1">
					<div className="flex items-center justify-between px-2 pt-2">
						<span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
							Organization
						</span>
						<IconSettings className="size-3.5 text-muted-foreground" />
					</div>
					<div className="px-2 pb-1 text-sm font-semibold">{org.name}</div>
					<p className="px-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">Brands</p>
					{org.brands.map((brand) => (
						<MenuRow key={brand.id} current={brand.current}>
							<span className="truncate">{brand.name}</span>
							{brand.current && <IconCheck className="ml-auto size-3.5" />}
						</MenuRow>
					))}
					<Separator className="my-1" />
				</div>
			))}
		</MenuFrame>
	);
}

/** D. Two panes: pick the organization on the left, its brands on the right. */
function MenuTwoPane() {
	return (
		<div className="flex w-[26rem] rounded-lg border bg-popover shadow-md">
			<div className="w-40 border-r p-1">
				<p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
					Organizations
				</p>
				{ORGS.map((org) => (
					<MenuRow key={org.id} current={org.id === CURRENT_ORG.id}>
						<span className="truncate text-sm">{org.name}</span>
						{org.id === CURRENT_ORG.id && <IconChevronRight className="ml-auto size-3.5" />}
					</MenuRow>
				))}
			</div>
			<div className="flex-1 p-1">
				<div className="flex items-center justify-between px-2 py-1">
					<p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
						Brands in {CURRENT_ORG.name}
					</p>
					<IconSettings className="size-3.5 text-muted-foreground" />
				</div>
				{CURRENT_ORG.brands.map((brand) => (
					<MenuRow key={brand.id} current={brand.current}>
						<span className="truncate text-sm">{brand.name}</span>
						{brand.current && <IconCheck className="ml-auto size-3.5" />}
					</MenuRow>
				))}
				<MenuRow muted>
					<IconPlus className="size-3.5" />
					<span className="text-xs">New brand</span>
				</MenuRow>
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// /app options
// ---------------------------------------------------------------------------

function OrgAvatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
	const initials = name
		.split(/\s+/)
		.slice(0, 2)
		.map((w) => w[0])
		.join("")
		.toUpperCase();
	return (
		<span
			className={cn(
				"flex shrink-0 items-center justify-center rounded-md bg-primary/10 font-semibold text-primary",
				size === "sm" ? "size-6 text-[10px]" : "size-9 text-xs",
			)}
		>
			{initials}
		</span>
	);
}

/** A. Today: a bare name, brands as stacked buttons. */
function AppFlatList() {
	return (
		<div className="w-full max-w-sm space-y-6">
			{ORGS.slice(0, 2).map((org) => (
				<div key={org.id} className="space-y-2">
					<div className="flex items-center justify-between">
						<span className="font-medium">{org.name} Organization</span>
						<IconSettings className="size-4 text-muted-foreground" />
					</div>
					<div className="flex flex-col gap-2">
						{org.brands.map((brand) => (
							<div key={brand.id} className="rounded-md bg-secondary px-3 py-2 text-sm">
								{brand.name}
							</div>
						))}
					</div>
				</div>
			))}
		</div>
	);
}

/** B. A card per organization, its brands inside it. */
function AppCards() {
	return (
		<div className="w-full space-y-4">
			{ORGS.map((org) => (
				<div key={org.id} className="overflow-hidden rounded-xl border bg-background">
					<div className="flex items-center gap-3 border-b bg-muted/30 px-4 py-3">
						<OrgAvatar name={org.name} />
						<div className="min-w-0 flex-1">
							<p className="truncate font-medium leading-tight">{org.name}</p>
							<p className="text-xs text-muted-foreground">
								{org.brands.length === 0
									? "No brands"
									: `${org.brands.length} brand${org.brands.length === 1 ? "" : "s"}`}
							</p>
						</div>
						<Button variant="ghost" size="sm" className="gap-1.5">
							<IconSettings className="size-4" />
							Settings
						</Button>
					</div>
					<div className="divide-y">
						{org.brands.map((brand) => (
							<div key={brand.id} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-accent/50">
								<IconWorld className="size-4 text-muted-foreground" />
								<span className="flex-1 truncate">{brand.name}</span>
								<IconChevronRight className="size-4 text-muted-foreground/60" />
							</div>
						))}
						{org.brands.length === 0 && (
							<p className="px-4 py-3 text-sm text-muted-foreground">Nothing tracked here yet.</p>
						)}
						{org.canCreateBrand && (
							<div className="flex items-center gap-3 px-4 py-2.5 text-sm text-muted-foreground hover:bg-accent/50">
								<IconPlus className="size-4" />
								New brand
							</div>
						)}
					</div>
				</div>
			))}
			<Button variant="outline" className="w-full gap-1.5">
				<IconPlus className="size-4" />
				New organization
			</Button>
		</div>
	);
}

/** C. A tree, with the same shape the menu would use. */
function AppTree() {
	return (
		<div className="w-full space-y-1">
			{ORGS.map((org) => (
				<div key={org.id} className="py-1">
					<div className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent/50">
						<IconBuilding className="size-4 shrink-0 text-muted-foreground" />
						<span className="flex-1 truncate font-medium">{org.name}</span>
						<Badge variant="outline" className="font-normal text-[10px]">
							Organization
						</Badge>
						<IconSettings className="size-4 text-muted-foreground" />
					</div>
					<div className="ml-[1.4rem] border-l pl-3">
						{org.brands.map((brand) => (
							<div key={brand.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent/50">
								<IconWorld className="size-3.5 shrink-0 text-muted-foreground" />
								<span className="flex-1 truncate">{brand.name}</span>
								<IconChevronRight className="size-3.5 text-muted-foreground/60" />
							</div>
						))}
						{org.brands.length === 0 && <p className="px-2 py-1.5 text-sm text-muted-foreground">No brands yet</p>}
						{org.canCreateBrand && (
							<div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent/50">
								<IconPlus className="size-3.5" />
								New brand
							</div>
						)}
					</div>
				</div>
			))}
			<Separator className="my-2" />
			<div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent/50">
				<IconPlus className="size-4" />
				New organization
			</div>
		</div>
	);
}

/** D. Brands as tiles under an organization header. */
function AppTiles() {
	return (
		<div className="w-full space-y-6">
			{ORGS.slice(0, 2).map((org) => (
				<div key={org.id} className="space-y-3">
					<div className="flex items-center gap-2">
						<OrgAvatar name={org.name} size="sm" />
						<span className="text-sm font-semibold">{org.name}</span>
						<span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
							Organization
						</span>
						<Button variant="ghost" size="icon" className="ml-auto size-7">
							<IconSettings className="size-4" />
						</Button>
					</div>
					<div className="grid grid-cols-2 gap-2">
						{org.brands.map((brand) => (
							<div key={brand.id} className="rounded-lg border bg-background p-3 hover:bg-accent/50">
								<IconWorld className="mb-2 size-4 text-muted-foreground" />
								<p className="truncate text-sm font-medium">{brand.name}</p>
								<p className="text-xs text-muted-foreground">Brand</p>
							</div>
						))}
						{org.canCreateBrand && (
							<div className="flex items-center justify-center rounded-lg border border-dashed p-3 text-sm text-muted-foreground hover:bg-accent/50">
								<IconPlus className="mr-1.5 size-4" />
								New brand
							</div>
						)}
					</div>
				</div>
			))}
		</div>
	);
}

/** E. One organization at a time, chosen from a switcher above its brands. */
function AppSingleOrg() {
	return (
		<div className="w-full max-w-md space-y-4">
			<button
				type="button"
				className="flex w-full items-center gap-3 rounded-lg border bg-background px-3 py-2.5 text-left hover:bg-accent/50"
			>
				<OrgAvatar name={CURRENT_ORG.name} />
				<span className="min-w-0 flex-1">
					<span className="block text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
						Organization
					</span>
					<span className="block truncate font-medium leading-tight">{CURRENT_ORG.name}</span>
				</span>
				<IconSelector className="size-4 text-muted-foreground" />
			</button>

			<div className="space-y-2">
				<p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">Brands</p>
				{CURRENT_ORG.brands.map((brand) => (
					<div
						key={brand.id}
						className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2.5 hover:bg-accent/50"
					>
						<IconWorld className="size-4 text-muted-foreground" />
						<span className="flex-1 truncate text-sm">{brand.name}</span>
						<IconChevronRight className="size-4 text-muted-foreground/60" />
					</div>
				))}
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Story
// ---------------------------------------------------------------------------

function Explorations() {
	return (
		<div className="min-h-svh bg-background p-8 text-foreground antialiased">
			<div className="mx-auto max-w-7xl space-y-12">
				<header>
					<h1 className="text-3xl font-bold">Organization vs brand — design options</h1>
					<p className="text-muted-foreground">
						Current behaviour is option A in each row. Mock markup only; nothing here is wired to the app.
					</p>
				</header>

				<Section title="Breadcrumbs" note="The page currently reads “Nike Organization › Nike Running › Citations”.">
					<Option label="A. Appended word (today)" note="Long, and repeats a word on every page.">
						<CrumbAppendedWord />
					</Option>
					<Option label="B. Eyebrow labels" note="Each name says what kind of thing it is, above it.">
						<CrumbEyebrow />
					</Option>
					<Option label="C. Badges" note="Kind carried by badge shape and icon.">
						<CrumbBadge />
					</Option>
					<Option label="D. Icons only" note="Lightest touch; relies on the icon being learned.">
						<CrumbIconOnly />
					</Option>
					<Option label="E. Boxed organization" note="Organization sits outside the trail, as context.">
						<CrumbBoxedOrg />
					</Option>
					<Option label="F. Stacked" note="Organization on its own line above the page trail.">
						<CrumbStacked />
					</Option>
				</Section>

				<Section title="Account menu" note="Reached from the rail's footer; holds every organization and brand.">
					<Option label="A. Flat heading (today)" note="Heading, then brands at the same indent.">
						<MenuFlatHeading />
					</Option>
					<Option label="B. Tree" note="Brands hang off their organization on a rule.">
						<MenuTree />
					</Option>
					<Option label="C. Eyebrow labels" note="Says “Organization” and “Brands” outright.">
						<MenuLabelled />
					</Option>
					<Option label="D. Two panes" note="Organizations left, that one's brands right.">
						<MenuTwoPane />
					</Option>
				</Section>

				<Section title="/app directory" note="The landing page, and where the mark leads back to.">
					<Option label="A. Flat list (today)" note="Name, then brand buttons. Little hierarchy.">
						<AppFlatList />
					</Option>
					<Option label="B. Cards" note="One card per organization, brands as rows inside it.">
						<AppCards />
					</Option>
					<Option label="C. Tree" note="Same shape as menu option B, at page scale.">
						<AppTree />
					</Option>
					<Option label="D. Tiles" note="Brands as a grid under an organization header.">
						<AppTiles />
					</Option>
					<Option label="E. One at a time" note="Switch organization above; only its brands listed.">
						<AppSingleOrg />
					</Option>
				</Section>
			</div>
		</div>
	);
}

const meta = {
	title: "Explorations/Organization vs Brand",
	component: Explorations,
	parameters: { layout: "fullscreen" },
} satisfies Meta<typeof Explorations>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Every option for all three surfaces, on one page. */
export const AllOptions: Story = {};
