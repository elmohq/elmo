import { cn } from "@workspace/ui/lib/utils";
import { LOCALES, setLocale, useI18n } from "@/lib/i18n";

export function LanguageToggle({ className }: { className?: string }) {
	const { locale, t } = useI18n();

	return (
		<fieldset
			aria-label={t("Language")}
			className={cn("inline-flex items-center rounded-md border bg-background p-0.5 text-xs font-medium", className)}
		>
			{LOCALES.map((option) => (
				<button
					key={option}
					type="button"
					lang={option}
					aria-pressed={option === locale}
					onClick={() => option !== locale && setLocale(option)}
					className={cn(
						"cursor-pointer rounded px-2 py-1 uppercase transition-colors",
						option === locale ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
					)}
				>
					{option}
				</button>
			))}
		</fieldset>
	);
}
