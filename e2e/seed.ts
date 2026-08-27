/**
 * E2E Test Database Seeder
 *
 * Seeds the LOCAL test database with realistic fixture data for E2E testing.
 *
 * SAFETY: the database URL (see fixtures.ts) is hardcoded to localhost to
 * prevent accidentally running this against a production database (it DELETEs
 * all data).
 *
 * Usage: tsx seed.ts
 */
import { createHash } from "node:crypto";
import pg from "pg";
import {
  API_KEYS,
  type ApiKeyFixture,
  CAPPED_BRAND_ID,
  CAPPED_ENTITLEMENT_OVERRIDES,
  CAPPED_ORG_ID,
  CAPPED_PROMPT_COUNT,
  COMPETITOR_IDS,
  DATABASE_URL,
  NIKE_BRAND_ID,
  NIKE_COMPETITOR_IDS,
  NIKE_ORG_ID,
  NIKE_PROMPT_IDS,
  NIKE_SECOND_BRAND_ID,
  PROMPT_IDS,
  REPORT_IDS,
  TEST_BRAND_ID,
  TEST_BRAND_NAME,
  TEST_BRAND_WEBSITE,
  UNPAID_BRAND_ID,
  UNPAID_ORG_ID,
} from "./fixtures";

const RUN_IDS = [
  "00000000-0000-0000-0000-200000000001",
  "00000000-0000-0000-0000-200000000002",
  "00000000-0000-0000-0000-200000000003",
  "00000000-0000-0000-0000-200000000004",
  "00000000-0000-0000-0000-200000000005",
  "00000000-0000-0000-0000-200000000006",
  "00000000-0000-0000-0000-200000000007",
  "00000000-0000-0000-0000-200000000008",
];


/**
 * How better-auth's api-key plugin stores a key: unpadded base64url of the
 * SHA-256 digest. Reproduced here so the suite can seed keys straight into the
 * table without a session or a running app.
 */
function hashApiKey(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

/** better-auth stores permissions as `{ resource: [action] }`. */
function toPermissions(scopes: readonly string[]): Record<string, string[]> {
  const permissions: Record<string, string[]> = {};
  for (const scope of scopes) {
    const [resource, action] = scope.split(":");
    (permissions[resource] ??= []).push(action);
  }
  return permissions;
}

/**
 * Seed the API keys the Bruno suite authenticates as.
 *
 * The rate limit matches what the plugin issues in production rather than an
 * inflated test value: the busiest key makes fewer than a hundred requests
 * across the whole suite, so the real ceiling never gets in the way, and the
 * suite exercises the limit callers actually get.
 *
 * `reference_id` is the organization, not a user: the plugin is configured with
 * `references: "organization"`, which is what makes a key outlive whoever
 * issued it. Only the brand narrowing lives in metadata, because metadata is
 * writable by anyone with a session and so may never grant anything.
 *
 * Skipped when the `apikey` table isn't there yet: organization keys are still
 * being built, and the seeder has to keep working — and keep every other suite
 * working — until the migration lands. The Bruno cases that need these keys
 * fail until then, which is the point of having written them first.
 */
async function seedApiKeys(client: pg.Client): Promise<void> {
  const [{ exists }] = (
    await client.query<{ exists: boolean }>(
      "SELECT to_regclass('public.apikey') IS NOT NULL AS exists",
    )
  ).rows;
  if (!exists) {
    console.log("  Skipped API keys: the apikey table does not exist yet");
    return;
  }

  await client.query("DELETE FROM apikey WHERE name LIKE 'E2E %'");

  const keys = Object.values(API_KEYS) as ApiKeyFixture[];
  for (const [index, key] of keys.entries()) {
    await client.query(
      `INSERT INTO apikey (
         id, name, start, prefix, key, reference_id, enabled,
         rate_limit_enabled, rate_limit_time_window, rate_limit_max,
         request_count, expires_at, permissions, metadata, created_at, updated_at
       ) VALUES ($1, $2, $3, 'elmo', $4, $5, $6, true, 60000, 1000, 0, $7, $8, $9, NOW(), NOW())`,
      [
        `e2e-apikey-${index + 1}`,
        key.name,
        key.token.slice(0, 12),
        hashApiKey(key.token),
        key.organizationId,
        key.enabled !== false,
        key.expiresInMs === undefined ? null : new Date(Date.now() + key.expiresInMs),
        JSON.stringify(toPermissions(key.scopes)),
        key.brandIds === null ? null : JSON.stringify({ brandIds: key.brandIds }),
      ],
    );
  }
  console.log(`  Created ${keys.length} API keys`);
}


/**
 * Two tenants that only mean anything in cloud mode: one on a custom plan with
 * tiny limits, one with no subscription at all. Both are inert everywhere else,
 * where entitlements resolve to unlimited regardless of what is stored here.
 */
async function seedBillingTenants(client: pg.Client): Promise<void> {
  for (const [orgId, brandId, name, website] of [
    [CAPPED_ORG_ID, CAPPED_BRAND_ID, "Capped Co", "https://capped.example.com"],
    [UNPAID_ORG_ID, UNPAID_BRAND_ID, "Unpaid Co", "https://unpaid.example.com"],
  ] as const) {
    await client.query(
      `INSERT INTO organization (id, name, slug, created_at)
       VALUES ($1, $2, $1, NOW()) ON CONFLICT (id) DO NOTHING`,
      [orgId, name],
    );
    await client.query(
      `INSERT INTO brands (id, organization_id, name, website, enabled, onboarded, created_at, updated_at)
       VALUES ($1, $2, $3, $4, true, true, NOW(), NOW())`,
      [brandId, orgId, name, website],
    );
  }

  await client.query("DELETE FROM organization_settings WHERE organization_id = ANY($1)", [
    [CAPPED_ORG_ID, UNPAID_ORG_ID],
  ]);
  await client.query(
    `INSERT INTO organization_settings (organization_id, entitlement_overrides, premium_addon_quantity, created_at, updated_at)
     VALUES ($1, $2, 0, NOW(), NOW())`,
    [CAPPED_ORG_ID, JSON.stringify(CAPPED_ENTITLEMENT_OVERRIDES)],
  );

  for (let i = 0; i < CAPPED_PROMPT_COUNT; i++) {
    await client.query(
      `INSERT INTO prompts (brand_id, value, enabled, tags, system_tags, created_at, updated_at)
       VALUES ($1, $2, true, '{}', '{}', NOW(), NOW())`,
      [CAPPED_BRAND_ID, `Capped tenant prompt ${i + 1}`],
    );
  }
  console.log(
    `  Created billing tenants: ${CAPPED_ORG_ID} (${CAPPED_PROMPT_COUNT}/${CAPPED_ENTITLEMENT_OVERRIDES.maxPrompts} prompts) and ${UNPAID_ORG_ID} (no plan)`,
  );
}

/**
 * One stored Opportunities report for the default brand, so the API test for it
 * exercises the populated path rather than only the "nothing generated yet" one.
 * Shaped like what the generator persists: the model's own output, enriched with
 * resolved prompt ids and the pages already cited for them.
 */
async function seedOpportunities(client: pg.Client): Promise<void> {
  const report = {
    summary: [
      "Competitor Alpha is named in comparison answers you are absent from.",
      "Assistants build monitoring answers from example.com and techblog.io.",
      "Branded prompts are covered; unbranded discovery is where the gap is.",
    ],
    risks: [
      "Comparison roundups rotate slowly, so placements take time to land.",
      "Do not chase prompts where every assistant cites the same locked-in source.",
    ],
    opportunities: [
      {
        category: "creation",
        title: "Publish a monitoring-tool comparison for unbranded discovery",
        why: "Assistants answer 'best AI monitoring tool' from third-party roundups, and the brand is named in none of them.",
        relatedPrompts: [
          {
            text: "What is the best AI monitoring tool for tracking brand visibility?",
            promptId: PROMPT_IDS.branded1,
          },
        ],
        yourCitations: [
          { title: "AI Monitoring Guide", domain: "example.com", url: "https://example.com/blog/ai-monitoring" },
        ],
        competitorCitations: [
          { title: "Competitor Alpha Features", domain: "competitor-alpha.com", url: "https://competitor-alpha.com/features" },
        ],
      },
      {
        category: "outreach",
        title: "Get into the techblog.io tools roundup",
        why: "It is cited in answers where the brand is absent, and its list rotates often enough to break into.",
        relatedPrompts: [{ text: "Compare AI visibility platforms and their features", promptId: PROMPT_IDS.branded2 }],
        yourCitations: [],
        competitorCitations: [
          { title: "Best AI Tools 2025", domain: "techblog.io", url: "https://techblog.io/ai-tools-2025" },
        ],
      },
    ],
  };

  await client.query(
    `INSERT INTO brand_opportunities (brand_id, report, model, created_at)
     VALUES ($1, $2, $3, NOW())`,
    [TEST_BRAND_ID, JSON.stringify(report), "claude-sonnet-5"],
  );
  console.log(`  Created 1 opportunities report (${report.opportunities.length} opportunities)`);
}

async function seed() {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    console.log("Seeding E2E test database...");

    await client.query("DELETE FROM brand_opportunities");
    await client.query("DELETE FROM citations");
    await client.query("DELETE FROM prompt_runs");
    await client.query("DELETE FROM prompts");
    await client.query("DELETE FROM competitors");
    await client.query("DELETE FROM reports");
    await client.query("DELETE FROM brands");

    // Signup provisions the "default" org as well, but the seed re-creates the
    // brand independently — ensure the org exists for the NOT NULL FK.
    await client.query(
      `INSERT INTO organization (id, name, slug, created_at)
       VALUES ($1, $2, $1, NOW()) ON CONFLICT (id) DO NOTHING`,
      [TEST_BRAND_ID, TEST_BRAND_NAME]
    );
    await client.query(
      `INSERT INTO brands (id, organization_id, name, website, enabled, onboarded, created_at, updated_at)
       VALUES ($1, $1, $2, $3, true, true, NOW(), NOW())`,
      [TEST_BRAND_ID, TEST_BRAND_NAME, TEST_BRAND_WEBSITE]
    );
    console.log("  Created brand:", TEST_BRAND_ID);

    const promptData = [
      {
        id: PROMPT_IDS.branded1,
        value: "What is the best AI monitoring tool for tracking brand visibility?",
        tags: ["monitoring"],
        systemTags: ["branded"],
      },
      {
        id: PROMPT_IDS.branded2,
        value: "Compare AI visibility platforms and their features",
        tags: ["comparison"],
        systemTags: ["branded"],
      },
      {
        id: PROMPT_IDS.unbranded1,
        value: "How do I optimize content for LLM citations?",
        tags: ["optimization"],
        systemTags: ["unbranded"],
      },
      {
        id: PROMPT_IDS.branded3,
        value: "What tools can track AI search results and brand mentions?",
        tags: ["monitoring", "tools"],
        systemTags: ["branded"],
      },
      {
        id: PROMPT_IDS.unbranded2,
        value: "Best practices for generative AI SEO and content strategy",
        tags: ["seo"],
        systemTags: ["unbranded"],
      },
    ];

    for (const p of promptData) {
      await client.query(
        `INSERT INTO prompts (id, brand_id, value, enabled, tags, system_tags, created_at, updated_at)
         VALUES ($1, $2, $3, true, $4, $5, NOW(), NOW())`,
        [p.id, TEST_BRAND_ID, p.value, p.tags, p.systemTags]
      );
    }
    console.log(`  Created ${promptData.length} prompts`);

    const competitorData = [
      { id: COMPETITOR_IDS.competitorA, name: "Competitor Alpha", domains: ["competitor-alpha.com"] },
      { id: COMPETITOR_IDS.competitorB, name: "Competitor Beta", domains: ["competitor-beta.com"] },
    ];

    for (const c of competitorData) {
      await client.query(
        `INSERT INTO competitors (id, brand_id, name, domains, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())`,
        [c.id, TEST_BRAND_ID, c.name, c.domains]
      );
    }
    console.log(`  Created ${competitorData.length} competitors`);

    const now = new Date();
    const promptRuns = [
      {
        id: RUN_IDS[0],
        promptId: PROMPT_IDS.branded1,
        model: "chatgpt",
        version: "gpt-4o",
        webSearchEnabled: false,
        rawOutput: {
          response:
            "Based on my analysis, Test Organization offers a comprehensive AI monitoring platform that tracks brand visibility across major LLMs. Their tool provides real-time insights into how AI models reference and cite your brand.",
        },
        textContent:
          "Based on my analysis, Test Organization offers a comprehensive AI monitoring platform that tracks brand visibility across major LLMs. Their tool provides real-time insights into how AI models reference and cite your brand.",
        webQueries: [] as string[],
        brandMentioned: true,
        competitorsMentioned: [] as string[],
        citations: [
          { url: "https://example.com/blog/ai-monitoring", domain: "example.com", title: "AI Monitoring Guide" },
          { url: "https://docs.example.com/api", domain: "docs.example.com", title: "API Documentation" },
        ],
        createdAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
      },
      {
        id: RUN_IDS[1],
        promptId: PROMPT_IDS.branded1,
        model: "claude",
        version: "claude-sonnet-5",
        webSearchEnabled: false,
        rawOutput: {
          response:
            "There are several AI monitoring tools available. Competitor Alpha provides basic tracking, while Test Organization offers more advanced visibility metrics and citation analysis.",
        },
        textContent:
          "There are several AI monitoring tools available. Competitor Alpha provides basic tracking, while Test Organization offers more advanced visibility metrics and citation analysis.",
        webQueries: [] as string[],
        brandMentioned: true,
        competitorsMentioned: ["Competitor Alpha"],
        citations: [
          { url: "https://competitor-alpha.com/features", domain: "competitor-alpha.com", title: "Competitor Alpha Features" },
          { url: "https://example.com/comparison", domain: "example.com", title: "Tool Comparison" },
        ],
        createdAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
      },
      {
        id: RUN_IDS[2],
        promptId: PROMPT_IDS.branded1,
        model: "google-ai-mode",
        version: "gemini-2.5-pro",
        webSearchEnabled: true,
        rawOutput: {
          response:
            "For AI monitoring, you might consider tools like Competitor Beta or Test Organization. Both offer features for tracking brand mentions in AI-generated content.",
        },
        textContent:
          "For AI monitoring, you might consider tools like Competitor Beta or Test Organization. Both offer features for tracking brand mentions in AI-generated content.",
        webQueries: ["best AI monitoring tools 2025", "brand visibility AI tracking"],
        brandMentioned: true,
        competitorsMentioned: ["Competitor Beta"],
        citations: [
          { url: "https://competitor-beta.com/pricing", domain: "competitor-beta.com", title: "Competitor Beta Pricing" },
          { url: "https://example.com/blog/ai-monitoring", domain: "example.com", title: "AI Monitoring Guide" },
          { url: "https://techblog.io/ai-tools-2025", domain: "techblog.io", title: "Best AI Tools 2025" },
        ],
        createdAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
      },
      {
        id: RUN_IDS[3],
        promptId: PROMPT_IDS.branded1,
        model: "chatgpt",
        version: "gpt-4o",
        webSearchEnabled: true,
        rawOutput: {
          response:
            "I'd recommend looking into various AI monitoring platforms. Some popular options include dedicated brand tracking tools that monitor how LLMs reference your brand.",
        },
        textContent:
          "I'd recommend looking into various AI monitoring platforms. Some popular options include dedicated brand tracking tools that monitor how LLMs reference your brand.",
        webQueries: ["AI brand monitoring platforms"],
        brandMentioned: false,
        competitorsMentioned: [] as string[],
        citations: [] as { url: string; domain: string; title: string }[],
        createdAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
      },
      {
        id: RUN_IDS[4],
        promptId: PROMPT_IDS.branded2,
        model: "chatgpt",
        version: "gpt-4o",
        webSearchEnabled: false,
        rawOutput: {
          response:
            "When comparing AI visibility platforms, Test Organization stands out with its comprehensive prompt tracking and multi-model analysis capabilities.",
        },
        textContent:
          "When comparing AI visibility platforms, Test Organization stands out with its comprehensive prompt tracking and multi-model analysis capabilities.",
        webQueries: [] as string[],
        brandMentioned: true,
        competitorsMentioned: [] as string[],
        citations: [
          { url: "https://example.com/features", domain: "example.com", title: "Test Organization Features" },
        ],
        createdAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
      },
      {
        id: RUN_IDS[5],
        promptId: PROMPT_IDS.branded2,
        model: "claude",
        version: "claude-sonnet-5",
        webSearchEnabled: false,
        rawOutput: {
          response:
            "Several platforms offer AI visibility tracking. Competitor Alpha and Competitor Beta are well-known options, each with different strengths in citation tracking.",
        },
        textContent:
          "Several platforms offer AI visibility tracking. Competitor Alpha and Competitor Beta are well-known options, each with different strengths in citation tracking.",
        webQueries: [] as string[],
        brandMentioned: false,
        competitorsMentioned: ["Competitor Alpha", "Competitor Beta"],
        citations: [
          { url: "https://competitor-alpha.com/about", domain: "competitor-alpha.com", title: "About Competitor Alpha" },
          { url: "https://competitor-beta.com/features", domain: "competitor-beta.com", title: "Competitor Beta Features" },
        ],
        createdAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
      },
      {
        id: RUN_IDS[6],
        promptId: PROMPT_IDS.unbranded1,
        model: "chatgpt",
        version: "gpt-4o-mini",
        webSearchEnabled: false,
        rawOutput: {
          response:
            "To optimize content for LLM citations, focus on creating authoritative, well-structured content with clear data points and references.",
        },
        textContent:
          "To optimize content for LLM citations, focus on creating authoritative, well-structured content with clear data points and references.",
        webQueries: [] as string[],
        brandMentioned: false,
        competitorsMentioned: [] as string[],
        citations: [
          { url: "https://searchenginejournal.com/llm-seo", domain: "searchenginejournal.com", title: "LLM SEO Guide" },
        ],
        createdAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
      },
      {
        id: RUN_IDS[7],
        promptId: PROMPT_IDS.unbranded1,
        model: "claude",
        version: "claude-sonnet-5",
        webSearchEnabled: true,
        rawOutput: {
          response:
            "Optimizing for LLM citations involves several strategies including structured data markup, authoritative backlinks, and consistent brand messaging across your digital presence.",
        },
        textContent:
          "Optimizing for LLM citations involves several strategies including structured data markup, authoritative backlinks, and consistent brand messaging across your digital presence.",
        webQueries: ["how to get cited by AI models", "LLM citation optimization"],
        brandMentioned: false,
        competitorsMentioned: [] as string[],
        citations: [
          { url: "https://searchenginejournal.com/llm-seo", domain: "searchenginejournal.com", title: "LLM SEO Guide" },
          { url: "https://moz.com/blog/ai-citations", domain: "moz.com", title: "AI Citation Strategies" },
        ],
        createdAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
      },
    ];

    for (const run of promptRuns) {
      await client.query(
        `INSERT INTO prompt_runs (id, prompt_id, brand_id, model, version, web_search_enabled, raw_output, web_queries, brand_mentioned, competitors_mentioned, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          run.id,
          run.promptId,
          TEST_BRAND_ID,
          run.model,
          run.version,
          run.webSearchEnabled,
          JSON.stringify(run.rawOutput),
          run.webQueries,
          run.brandMentioned,
          run.competitorsMentioned,
          run.createdAt,
        ]
      );
    }
    console.log(`  Created ${promptRuns.length} prompt runs (Postgres)`);

    let citationCount = 0;
    for (const run of promptRuns) {
      for (let i = 0; i < run.citations.length; i++) {
        const c = run.citations[i];
        await client.query(
          `INSERT INTO citations (prompt_run_id, prompt_id, brand_id, model, url, domain, title, citation_index, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            run.id,
            run.promptId,
            TEST_BRAND_ID,
            run.model,
            c.url,
            c.domain,
            c.title,
            i,
            run.createdAt,
          ]
        );
        citationCount++;
      }
    }
    console.log(`  Created ${citationCount} citations (Postgres)`);

    const completedReportRawOutput = {
      competitors: [
        { name: "Competitor Alpha", domain: "competitor-alpha.com" },
        { name: "Competitor Beta", domain: "competitor-beta.com" },
      ],
      prompts: [
        { brandId: REPORT_IDS.completed, value: "What is the best AI monitoring tool for tracking brand visibility?", enabled: true, tags: [], systemTags: ["branded"] },
        { brandId: REPORT_IDS.completed, value: "Compare AI visibility platforms and their features", enabled: true, tags: [], systemTags: ["unbranded"] },
      ],
      promptRuns: [
        {
          promptValue: "What is the best AI monitoring tool for tracking brand visibility?",
          runs: [
            { model: "chatgpt", version: "gpt-4o", webSearchEnabled: true, rawOutput: {}, webQueries: [], textContent: "Test Organization leads for AI brand monitoring.", brandMentioned: true, competitorsMentioned: ["Competitor Alpha"] },
            { model: "claude", version: "claude-sonnet-5", webSearchEnabled: false, rawOutput: {}, webQueries: [], textContent: "Test Organization is a strong option.", brandMentioned: true, competitorsMentioned: [] },
            { model: "google-ai-mode", version: "gemini-2.5-pro", webSearchEnabled: true, rawOutput: {}, webQueries: [], textContent: "Options include Competitor Alpha and Competitor Beta.", brandMentioned: false, competitorsMentioned: ["Competitor Alpha", "Competitor Beta"] },
          ],
        },
        {
          promptValue: "Compare AI visibility platforms and their features",
          runs: [
            { model: "chatgpt", version: "gpt-4o", webSearchEnabled: false, rawOutput: {}, webQueries: [], textContent: "Test Organization stands out.", brandMentioned: true, competitorsMentioned: [] },
          ],
        },
      ],
    };

    await client.query(
      `INSERT INTO reports (id, brand_name, brand_website, status, progress, raw_output, created_at, completed_at, updated_at)
       VALUES ($1, $2, $3, 'completed', 100, $4, NOW(), NOW(), NOW())`,
      [REPORT_IDS.completed, TEST_BRAND_NAME, TEST_BRAND_WEBSITE, JSON.stringify(completedReportRawOutput)],
    );

    // Non-completed rows: exercise the status-only branch and list pagination.
    for (const [id, status, progress] of [
      [REPORT_IDS.pending, "pending", 0],
      [REPORT_IDS.processing, "processing", 45],
      [REPORT_IDS.failed, "failed", 20],
    ] as const) {
      await client.query(
        `INSERT INTO reports (id, brand_name, brand_website, status, progress, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
        [id, TEST_BRAND_NAME, TEST_BRAND_WEBSITE, status, progress],
      );
    }
    console.log("  Created 4 reports (1 completed, 1 pending, 1 processing, 1 failed)");

    // The E2E user is not a member of this tenant. It must remain hidden from
    // org-scoped views while still being visible through the admin API key.
    await client.query(
      `INSERT INTO organization (id, name, slug, created_at)
       VALUES ($1, 'Nike', $1, NOW()) ON CONFLICT (id) DO NOTHING`,
      [NIKE_ORG_ID],
    );
    await client.query(
      `INSERT INTO brands (id, organization_id, name, website, additional_domains, aliases, enabled, onboarded, created_at, updated_at)
       VALUES ($1, $2, 'Nike', 'https://nike.com', $3, $4, true, true, NOW(), NOW())`,
      [NIKE_BRAND_ID, NIKE_ORG_ID, ["jordan.com", "converse.com"], ["Just Do It", "Swoosh", "Air Jordan"]],
    );

    const nikePrompts = [
      { id: NIKE_PROMPT_IDS.training, value: "Best weightlifting shoes for squats and deadlifts", tags: ["training"] },
      { id: NIKE_PROMPT_IDS.lifestyle, value: "Best white leather sneakers for everyday wear", tags: ["lifestyle"] },
    ];
    for (const p of nikePrompts) {
      await client.query(
        `INSERT INTO prompts (id, brand_id, value, enabled, tags, system_tags, created_at, updated_at)
         VALUES ($1, $2, $3, true, $4, '{}', NOW(), NOW())`,
        [p.id, NIKE_BRAND_ID, p.value, p.tags],
      );
    }

    const nikeCompetitors = [
      { id: NIKE_COMPETITOR_IDS.adidas, name: "Adidas", domains: ["adidas.com"], aliases: ["Three Stripes"] },
      { id: NIKE_COMPETITOR_IDS.puma, name: "Puma", domains: ["puma.com"], aliases: ["Puma SE"] },
    ];
    for (const c of nikeCompetitors) {
      await client.query(
        `INSERT INTO competitors (id, brand_id, name, domains, aliases, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
        [c.id, NIKE_BRAND_ID, c.name, c.domains, c.aliases],
      );
    }

    const nikeRunId = "00000000-0000-0000-0000-420000000001";
    await client.query(
      `INSERT INTO prompt_runs (id, prompt_id, brand_id, model, provider, version, web_search_enabled, raw_output, web_queries, brand_mentioned, competitors_mentioned, created_at)
       VALUES ($1, $2, $3, 'chatgpt', 'brightdata', 'gpt-5-5', true, $4, $5, true, $6, NOW())`,
      [nikeRunId, NIKE_PROMPT_IDS.training, NIKE_BRAND_ID, JSON.stringify({ response: "Nike Metcon and Romaleos are top picks; Adidas Powerlift is an alternative." }), ["best weightlifting shoes"], ["Adidas"]],
    );
    for (const [i, cite] of [
      { url: "https://runrepeat.com/best-weightlifting-shoes", domain: "runrepeat.com", title: "Best Weightlifting Shoes" },
      { url: "https://www.nike.com/training", domain: "nike.com", title: "Nike Training" },
    ].entries()) {
      await client.query(
        `INSERT INTO citations (prompt_run_id, prompt_id, brand_id, model, url, domain, title, citation_index, created_at)
         VALUES ($1, $2, $3, 'chatgpt', $4, $5, $6, $7, NOW())`,
        [nikeRunId, NIKE_PROMPT_IDS.training, NIKE_BRAND_ID, cite.url, cite.domain, cite.title, i],
      );
    }
    // A second brand in the same org, so a key narrowed to one brand has
    // something inside its own organization that it must not reach.
    await client.query(
      `INSERT INTO brands (id, organization_id, name, website, enabled, onboarded, created_at, updated_at)
       VALUES ($1, $2, 'Jordan', 'https://jordan.com', true, true, NOW(), NOW())`,
      [NIKE_SECOND_BRAND_ID, NIKE_ORG_ID],
    );
    console.log("  Created second tenant: Nike (2 brands, 2 prompts, 2 competitors, 1 run, 2 citations)");

    await seedOpportunities(client);
    await seedBillingTenants(client);
    await seedApiKeys(client);

    console.log("\nE2E database seeding complete!");
    console.log(`  Brand: ${TEST_BRAND_ID} (${TEST_BRAND_NAME})`);
    console.log(`  Prompts: ${promptData.length}`);
    console.log(`  Competitors: ${competitorData.length}`);
    console.log(`  Prompt Runs: ${promptRuns.length}`);
  } finally {
    await client.end();
  }
}

seed().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
