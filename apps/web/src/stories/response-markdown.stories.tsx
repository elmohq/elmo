/**
 * Stories for <ResponseMarkdown />, the answer body on the prompt detail page.
 *
 * The fixtures are shaped after real answers captured from BrightData's
 * ChatGPT and Google AI Mode collectors: a comparison table, source links,
 * and the favicon chips the engines splice into their prose — including the
 * `data:` ones Google AI Mode inlines.
 */
import type { Meta, StoryObj } from "@storybook/react";
import { expect, within } from "storybook/test";
import { ResponseMarkdown } from "@/components/response-markdown";

const PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==";

const CHATGPT_ANSWER = `If by **AI visibility trackers** you mean tools that track whether your brand is cited in ChatGPT, the 2026 market has a few clear leaders.

### My 2026 shortlist

| Tool | Best for | My take |
| --- | --- | --- |
| **Profound** | Enterprise | Best overall for large teams |
| **Peec AI** | Mid-market | Best balance of depth + usability |
| **Otterly.AI** | SMBs / agencies | Best affordable starting point |

Recent comparisons put [Profound](https://tryprofound.com/) and Peec among the core dedicated platforms. ![](${PIXEL}) Baarely+2

* * *

### What I'd buy

*   **Solo founder:** Otterly
*   **SEO team:** Peec AI
`;

const meta = {
	title: "Components/ResponseMarkdown",
	component: ResponseMarkdown,
	decorators: [
		(Story) => (
			<div className="max-w-3xl rounded-md border bg-muted/30 p-4">
				<Story />
			</div>
		),
	],
} satisfies Meta<typeof ResponseMarkdown>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A ChatGPT answer: the comparison table is the point of the answer. */
export const ChatGptAnswer: Story = {
	args: { children: CHATGPT_ANSWER },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);

		// The table is GFM, which plain CommonMark leaves as literal pipes.
		const table = canvasElement.querySelector("table");
		await expect(table).not.toBeNull();
		await expect(within(table as HTMLElement).getByText("Otterly.AI")).toBeVisible();
		await expect(canvas.queryByText(/\| --- \|/)).toBeNull();

		// Sources are third-party pages; following one must not unload the app.
		const link = canvas.getByRole("link", { name: "Profound" });
		await expect(link).toHaveAttribute("target", "_blank");
		await expect(link).toHaveAttribute("rel", "noopener noreferrer");

		// Engines inline favicons as data URLs, which react-markdown blanks by
		// default — leaving a broken image in the middle of the answer.
		const favicon = canvasElement.querySelector("img");
		await expect(favicon).toHaveAttribute("src", PIXEL);

		await expect(canvas.getByRole("heading", { name: "My 2026 shortlist" })).toBeVisible();
	},
};

/**
 * Answers that run wide: Google AI Mode returns four- and five-column tables
 * and bare URLs as link text, neither of which may push the answer box out of
 * the card.
 */
export const WideContent: Story = {
	args: {
		children: `| Platform | Best For | Platforms Tracked | Starting Price | Notes |
| --- | --- | --- | --- | --- |
| Semrush AI Visibility Toolkit | All-in-one SEO workflows | ChatGPT, Perplexity, Gemini, Copilot, Google AI Mode | $99/mo | Bundled with existing Semrush subscriptions |

Source: [https://www.example.com/blog/the-10-best-ai-visibility-tools-in-2026-a-very-long-slug](https://www.example.com/blog/the-10-best-ai-visibility-tools-in-2026-a-very-long-slug)
`,
	},
};

/**
 * Answer bodies are attacker-reachable: anyone who gets a poisoned page cited
 * by an answer engine chooses part of this markdown. Nothing in it may become
 * live markup, so this story pins the boundary rather than trusting that the
 * next person to touch the renderer knows it exists.
 *
 * The protection is that no `rehype-raw` is configured, so raw HTML stays
 * text, and that link hrefs keep react-markdown's stock scheme allowlist.
 */
export const HostileContent: Story = {
	args: {
		children: `Before <script>alert(document.cookie)</script> after

<img src=x onerror="alert(1)">

[looks harmless](javascript:alert(1)) and [so does this](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)

![](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)
`,
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);

		// Raw HTML renders as the text it is, not as markup.
		await expect(canvasElement.querySelector("script")).toBeNull();
		await expect(canvas.getByText(/<script>alert\(document\.cookie\)<\/script>/)).toBeVisible();
		await expect(canvasElement.querySelector("img[onerror]")).toBeNull();

		// Script-bearing URL schemes are stripped out of hrefs, leaving anchors
		// with nothing to navigate to (and so not even exposed as links).
		const hrefs = [...canvasElement.querySelectorAll("a")].map((a) => a.getAttribute("href"));
		await expect(hrefs).toEqual(["", ""]);
		await expect(canvas.queryAllByRole("link")).toHaveLength(0);

		// Widening image sources to data URLs must not have widened it to
		// `data:text/html`, which is a document, not an image.
		await expect(canvasElement.querySelector("img")).toBeNull();
	},
};
