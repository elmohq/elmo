import { describe, expect, it } from "vitest";
import { invitationEmail, passwordResetEmail, verificationEmail } from "./email-templates";

const URL = "https://app.example.com/verify?token=abc123";

describe("verificationEmail", () => {
	it("includes the url in html and text with a non-empty subject", () => {
		const email = verificationEmail({ url: URL });
		expect(email.subject.length).toBeGreaterThan(0);
		expect(email.html).toContain(URL);
		expect(email.text).toContain(URL);
	});
});

describe("passwordResetEmail", () => {
	it("includes the url in html and text with a non-empty subject", () => {
		const email = passwordResetEmail({ url: URL });
		expect(email.subject.length).toBeGreaterThan(0);
		expect(email.html).toContain(URL);
		expect(email.text).toContain(URL);
	});
});

describe("invitationEmail", () => {
	it("includes the url in html and text with a non-empty subject", () => {
		const email = invitationEmail({ inviterName: "Ana", orgName: "Acme", url: URL });
		expect(email.subject.length).toBeGreaterThan(0);
		expect(email.html).toContain(URL);
		expect(email.text).toContain(URL);
	});

	it("escapes user-controlled strings in the html body", () => {
		const email = invitationEmail({
			inviterName: "<script>alert(1)</script>",
			orgName: "Acme & Co",
			url: "https://x",
		});
		expect(email.html).toContain("&lt;script&gt;");
		expect(email.html).not.toContain("<script>alert");
		expect(email.html).toContain("Acme &amp; Co");
	});
});
