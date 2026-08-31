/**
 * Better-auth Drizzle schema — tables and relations.
 *
 * Generated via:  pnpm run generate:auth-schema
 *
 * The generator emits tables, columns, and relations implied by the plugins
 * in the auth config (the _cli-helper.ts wrapper). Indexes created by the
 * generator are included here; additional indexes added by hand in
 * migrations (e.g. subscription index in 0012) are NOT represented in this
 * file — drizzle-kit snapshots don't see them and would try to drop them on
 * `drizzle-kit push`. They are maintained by their migration files instead.
 *
 * DO NOT EDIT BY HAND. If you add a better-auth plugin that introduces new
 * tables or columns, re-run the generation script and commit the diff. If the
 * new table needs indexes beyond what the generator emits, add them in a new
 * migration — not in this file.
 *
 * One column deserves a warning the generator can't carry: `apikey.metadata` is
 * writable by anyone with a session, by plugin design. Never store anything
 * there that grants access — see readBrandRestriction in
 * apps/web/src/lib/auth/api-auth.ts.
 */
import { relations } from "drizzle-orm";
import { boolean, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const user = pgTable("user", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	email: text("email").notNull().unique(),
	emailVerified: boolean("email_verified").default(false).notNull(),
	image: text("image"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at")
		.defaultNow()
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull(),
	role: text("role"),
	banned: boolean("banned").default(false),
	banReason: text("ban_reason"),
	banExpires: timestamp("ban_expires"),
	stripeCustomerId: text("stripe_customer_id"),
	hasReportGeneratorAccess: boolean("has_report_generator_access").default(false),
});

export const session = pgTable(
	"session",
	{
		id: text("id").primaryKey(),
		expiresAt: timestamp("expires_at").notNull(),
		token: text("token").notNull().unique(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
		ipAddress: text("ip_address"),
		userAgent: text("user_agent"),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		activeOrganizationId: text("active_organization_id"),
		impersonatedBy: text("impersonated_by"),
	},
	(table) => [index("session_userId_idx").on(table.userId)],
);

export const account = pgTable(
	"account",
	{
		id: text("id").primaryKey(),
		accountId: text("account_id").notNull(),
		providerId: text("provider_id").notNull(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		accessToken: text("access_token"),
		refreshToken: text("refresh_token"),
		idToken: text("id_token"),
		accessTokenExpiresAt: timestamp("access_token_expires_at"),
		refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
		scope: text("scope"),
		password: text("password"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = pgTable(
	"verification",
	{
		id: text("id").primaryKey(),
		identifier: text("identifier").notNull(),
		value: text("value").notNull(),
		expiresAt: timestamp("expires_at").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const organization = pgTable("organization", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	slug: text("slug").notNull().unique(),
	logo: text("logo"),
	createdAt: timestamp("created_at").notNull(),
	metadata: text("metadata"),
	stripeCustomerId: text("stripe_customer_id"),
});

export const member = pgTable(
	"member",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		role: text("role").default("member").notNull(),
		createdAt: timestamp("created_at").notNull(),
	},
	(table) => [index("member_organizationId_idx").on(table.organizationId), index("member_userId_idx").on(table.userId)],
);

export const invitation = pgTable(
	"invitation",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		email: text("email").notNull(),
		role: text("role"),
		status: text("status").default("pending").notNull(),
		expiresAt: timestamp("expires_at").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		inviterId: text("inviter_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
	},
	(table) => [
		index("invitation_organizationId_idx").on(table.organizationId),
		index("invitation_email_idx").on(table.email),
	],
);

export const apikey = pgTable(
	"apikey",
	{
		id: text("id").primaryKey(),
		configId: text("config_id").default("default").notNull(),
		name: text("name"),
		start: text("start"),
		referenceId: text("reference_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		prefix: text("prefix"),
		key: text("key").notNull(),
		refillInterval: integer("refill_interval"),
		refillAmount: integer("refill_amount"),
		lastRefillAt: timestamp("last_refill_at"),
		enabled: boolean("enabled").default(true),
		rateLimitEnabled: boolean("rate_limit_enabled").default(true),
		rateLimitTimeWindow: integer("rate_limit_time_window").default(60000),
		rateLimitMax: integer("rate_limit_max").default(1000),
		requestCount: integer("request_count").default(0),
		remaining: integer("remaining"),
		lastRequest: timestamp("last_request"),
		expiresAt: timestamp("expires_at"),
		createdAt: timestamp("created_at").notNull(),
		updatedAt: timestamp("updated_at").notNull(),
		permissions: text("permissions"),
		metadata: text("metadata"),
	},
	(table) => [
		index("apikey_configId_idx").on(table.configId),
		index("apikey_referenceId_idx").on(table.referenceId),
		index("apikey_key_idx").on(table.key),
	],
);

export const oauthApplication = pgTable(
	"oauth_application",
	{
		id: text("id").primaryKey(),
		name: text("name").notNull(),
		icon: text("icon"),
		metadata: text("metadata"),
		clientId: text("client_id").notNull().unique(),
		clientSecret: text("client_secret"),
		redirectUrls: text("redirect_urls").notNull(),
		type: text("type").notNull(),
		disabled: boolean("disabled").default(false),
		userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at").notNull(),
		updatedAt: timestamp("updated_at").notNull(),
	},
	(table) => [index("oauthApplication_userId_idx").on(table.userId)],
);

export const oauthAccessToken = pgTable(
	"oauth_access_token",
	{
		id: text("id").primaryKey(),
		accessToken: text("access_token").notNull().unique(),
		refreshToken: text("refresh_token").notNull().unique(),
		accessTokenExpiresAt: timestamp("access_token_expires_at").notNull(),
		refreshTokenExpiresAt: timestamp("refresh_token_expires_at").notNull(),
		clientId: text("client_id")
			.notNull()
			.references(() => oauthApplication.clientId, { onDelete: "cascade" }),
		userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
		scopes: text("scopes").notNull(),
		createdAt: timestamp("created_at").notNull(),
		updatedAt: timestamp("updated_at").notNull(),
	},
	(table) => [
		index("oauthAccessToken_clientId_idx").on(table.clientId),
		index("oauthAccessToken_userId_idx").on(table.userId),
	],
);

export const oauthConsent = pgTable(
	"oauth_consent",
	{
		id: text("id").primaryKey(),
		clientId: text("client_id")
			.notNull()
			.references(() => oauthApplication.clientId, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		scopes: text("scopes").notNull(),
		createdAt: timestamp("created_at").notNull(),
		updatedAt: timestamp("updated_at").notNull(),
		consentGiven: boolean("consent_given").notNull(),
	},
	(table) => [index("oauthConsent_clientId_idx").on(table.clientId), index("oauthConsent_userId_idx").on(table.userId)],
);

export const ssoProvider = pgTable("sso_provider", {
	id: text("id").primaryKey(),
	issuer: text("issuer").notNull(),
	oidcConfig: text("oidc_config"),
	samlConfig: text("saml_config"),
	userId: text("user_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	providerId: text("provider_id").notNull().unique(),
	organizationId: text("organization_id"),
	domain: text("domain").notNull(),
});

export const subscription = pgTable("subscription", {
	id: text("id").primaryKey(),
	plan: text("plan").notNull(),
	referenceId: text("reference_id").notNull(),
	stripeCustomerId: text("stripe_customer_id"),
	stripeSubscriptionId: text("stripe_subscription_id"),
	status: text("status").default("incomplete").notNull(),
	periodStart: timestamp("period_start"),
	periodEnd: timestamp("period_end"),
	trialStart: timestamp("trial_start"),
	trialEnd: timestamp("trial_end"),
	cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false),
	cancelAt: timestamp("cancel_at"),
	canceledAt: timestamp("canceled_at"),
	endedAt: timestamp("ended_at"),
	seats: integer("seats"),
	billingInterval: text("billing_interval"),
	stripeScheduleId: text("stripe_schedule_id"),
});

export const userRelations = relations(user, ({ many }) => ({
	sessions: many(session),
	accounts: many(account),
	members: many(member),
	invitations: many(invitation),
	oauthApplications: many(oauthApplication),
	oauthAccessTokens: many(oauthAccessToken),
	oauthConsents: many(oauthConsent),
	ssoProviders: many(ssoProvider),
}));

export const sessionRelations = relations(session, ({ one }) => ({
	user: one(user, {
		fields: [session.userId],
		references: [user.id],
	}),
}));

export const accountRelations = relations(account, ({ one }) => ({
	user: one(user, {
		fields: [account.userId],
		references: [user.id],
	}),
}));

export const organizationRelations = relations(organization, ({ many }) => ({
	members: many(member),
	invitations: many(invitation),
}));

export const memberRelations = relations(member, ({ one }) => ({
	organization: one(organization, {
		fields: [member.organizationId],
		references: [organization.id],
	}),
	user: one(user, {
		fields: [member.userId],
		references: [user.id],
	}),
}));

export const invitationRelations = relations(invitation, ({ one }) => ({
	organization: one(organization, {
		fields: [invitation.organizationId],
		references: [organization.id],
	}),
	user: one(user, {
		fields: [invitation.inviterId],
		references: [user.id],
	}),
}));

export const oauthApplicationRelations = relations(oauthApplication, ({ one, many }) => ({
	user: one(user, {
		fields: [oauthApplication.userId],
		references: [user.id],
	}),
	oauthAccessTokens: many(oauthAccessToken),
	oauthConsents: many(oauthConsent),
}));

export const oauthAccessTokenRelations = relations(oauthAccessToken, ({ one }) => ({
	oauthApplication: one(oauthApplication, {
		fields: [oauthAccessToken.clientId],
		references: [oauthApplication.clientId],
	}),
	user: one(user, {
		fields: [oauthAccessToken.userId],
		references: [user.id],
	}),
}));

export const oauthConsentRelations = relations(oauthConsent, ({ one }) => ({
	oauthApplication: one(oauthApplication, {
		fields: [oauthConsent.clientId],
		references: [oauthApplication.clientId],
	}),
	user: one(user, {
		fields: [oauthConsent.userId],
		references: [user.id],
	}),
}));

export const ssoProviderRelations = relations(ssoProvider, ({ one }) => ({
	user: one(user, {
		fields: [ssoProvider.userId],
		references: [user.id],
	}),
}));
