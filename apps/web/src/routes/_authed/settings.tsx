import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { IconArrowLeft, IconLanguage, IconSettings } from "@tabler/icons-react";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Label } from "@workspace/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@workspace/ui/components/select";
import { SidebarInset, SidebarProvider } from "@workspace/ui/components/sidebar";
import type { Locale, LocalePreference } from "@workspace/lib/locale";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import {
	getLocaleSettingsFn,
	updateMyLocalePreferenceFn,
	updateSystemDefaultLocaleFn,
} from "@/server/locale-settings";
import * as m from "@/paraglide/messages.js";

export const Route = createFileRoute("/_authed/settings")({
	loader: () => getLocaleSettingsFn(),
	head: () => ({ meta: [{ title: m.settings_page_title() }] }),
	component: SettingsPage,
});

const localeNames: Record<Locale, () => string> = {
	en: m.settings_language_english,
	es: m.settings_language_spanish,
	ja: m.settings_language_japanese,
	"zh-CN": m.settings_language_chinese,
	"zh-TW": m.settings_language_traditional_chinese,
};

function LanguageSelect({
	value,
	onValueChange,
	disabled,
	includeAuto,
	label,
}: {
	value: LocalePreference;
	onValueChange: (value: LocalePreference) => void;
	disabled: boolean;
	includeAuto: boolean;
	label: string;
}) {
	return (
		<div className="space-y-2">
			<Label>{label}</Label>
			<Select value={value} onValueChange={(next) => onValueChange(next as LocalePreference)} disabled={disabled}>
				<SelectTrigger className="w-full sm:w-72" aria-label={label}>
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{includeAuto && <SelectItem value="auto">{m.settings_language_auto()}</SelectItem>}
					<SelectItem value="en">{m.settings_language_english()}</SelectItem>
					<SelectItem value="es">{m.settings_language_spanish()}</SelectItem>
					<SelectItem value="ja">{m.settings_language_japanese()}</SelectItem>
					<SelectItem value="zh-CN">{m.settings_language_chinese()}</SelectItem>
					<SelectItem value="zh-TW">{m.settings_language_traditional_chinese()}</SelectItem>
				</SelectContent>
			</Select>
		</div>
	);
}

function SettingsPage() {
	const settings = Route.useLoaderData();
	const [preference, setPreference] = useState<LocalePreference>(settings.localePreference);
	const [systemDefault, setSystemDefault] = useState<Locale>(settings.systemDefaultLocale);
	const [savingPreference, setSavingPreference] = useState(false);
	const [savingSystem, setSavingSystem] = useState(false);
	const [preferenceStatus, setPreferenceStatus] = useState<"idle" | "saved" | "error">("idle");
	const [systemStatus, setSystemStatus] = useState<"idle" | "saved" | "error">("idle");

	async function savePreference() {
		setSavingPreference(true);
		setPreferenceStatus("idle");
		try {
			await updateMyLocalePreferenceFn({ data: { localePreference: preference } });
			setPreferenceStatus("saved");
			window.location.reload();
		} catch {
			setPreferenceStatus("error");
			setSavingPreference(false);
		}
	}

	async function saveSystemDefault() {
		setSavingSystem(true);
		setSystemStatus("idle");
		try {
			await updateSystemDefaultLocaleFn({ data: { defaultLocale: systemDefault } });
			setSystemStatus("saved");
		} catch {
			setSystemStatus("error");
		} finally {
			setSavingSystem(false);
		}
	}

	return (
		<SidebarProvider>
			<AppSidebar isAdmin={settings.isAdmin} hasReportAccess={settings.hasReportAccess} />
			<SidebarInset className="md:border md:border-border/60 md:rounded-xl overflow-hidden">
				<SiteHeader />
				<main className="flex flex-1 flex-col gap-6 p-4 md:p-6">
					<div className="space-y-2">
						<div className="flex items-center gap-3">
							<div className="rounded-lg bg-primary/10 p-2 text-primary">
								<IconSettings className="size-5" />
							</div>
							<h1 className="text-3xl font-bold">{m.settings_page_title()}</h1>
						</div>
						<p className="text-muted-foreground">{m.settings_page_description()}</p>
					</div>

					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<IconLanguage className="size-5" />
								{m.settings_language_title()}
							</CardTitle>
							<CardDescription>{m.settings_language_description()}</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<LanguageSelect
								value={preference}
								onValueChange={setPreference}
								disabled={settings.readOnly || savingPreference}
								includeAuto
								label={m.settings_display_language()}
							/>
							<p className="text-sm text-muted-foreground">
								{m.settings_current_language({ language: localeNames[settings.resolvedLocale]() })}
							</p>
							{settings.readOnly && (
								<Alert>
									<AlertDescription>{m.settings_demo_read_only()}</AlertDescription>
								</Alert>
							)}
							{preferenceStatus === "error" && (
								<p role="alert" className="text-sm text-destructive">
									{m.settings_language_save_error()}
								</p>
							)}
							<Button
								onClick={savePreference}
								disabled={settings.readOnly || savingPreference || preference === settings.localePreference}
							>
								{savingPreference ? m.common_saving() : m.common_save()}
							</Button>
						</CardContent>
					</Card>

					{settings.isAdmin && (
						<Card>
							<CardHeader>
								<CardTitle>{m.settings_system_language_title()}</CardTitle>
								<CardDescription>{m.settings_system_language_description()}</CardDescription>
							</CardHeader>
							<CardContent className="space-y-4">
								<LanguageSelect
									value={systemDefault}
									onValueChange={(value) => setSystemDefault(value as Locale)}
									disabled={settings.readOnly || savingSystem}
									includeAuto={false}
									label={m.settings_system_default()}
								/>
								{systemStatus === "saved" && <p className="text-sm">{m.settings_system_language_saved()}</p>}
								{systemStatus === "error" && (
									<p role="alert" className="text-sm text-destructive">
										{m.settings_system_language_save_error()}
									</p>
								)}
								<Button
									onClick={saveSystemDefault}
									disabled={settings.readOnly || savingSystem || systemDefault === settings.systemDefaultLocale}
								>
									{savingSystem ? m.common_saving() : m.common_save()}
								</Button>
							</CardContent>
						</Card>
					)}

					<Button asChild variant="ghost" className="w-fit">
						<Link to="/app">
							<IconArrowLeft />
							{m.settings_back_to_brands()}
						</Link>
					</Button>
				</main>
			</SidebarInset>
		</SidebarProvider>
	);
}
