import { IconMessageCircle } from "@tabler/icons-react";
import { Button } from "@workspace/ui/components/button";
import { useCrispChat } from "@/hooks/use-crisp-chat";
import { openCrispChat } from "@/lib/crisp";

export function SupportChatButton() {
	const { launcher, unread } = useCrispChat();

	if (launcher !== "header") return null;

	return (
		<Button
			variant="ghost"
			size="sm"
			onClick={openCrispChat}
			aria-label={unread > 0 ? `Support chat, ${unread} unread` : "Support chat"}
			className="relative cursor-pointer text-muted-foreground hover:text-foreground"
		>
			<IconMessageCircle />
			<span className="hidden sm:inline">Support</span>
			{unread > 0 && (
				<span className="absolute top-1 right-1 size-2 rounded-full bg-primary ring-2 ring-background" aria-hidden />
			)}
		</Button>
	);
}
