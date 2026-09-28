# PMT-10K R1 Scalable prompt catalog — production closeout

Status: **PRODUCTION REAL-LIFE ACCEPTANCE PASS / CLOSED** 2026-09-28. Raw evidence (driver reports, screenshots, worker logs, dump checksums): operator-private `~/.elmo-task-evidence/pmt-10k/r1/` (`BASELINE.md`, `RELEASE-PLAN.md`, `PR-BODY.md`, `scale/`, `release/` with `rehearsal/`, `prod/`, `raw/`).

## What changed

A brand's prompt catalog holds up to **10 000 prompts** (enabled and disabled together) while every path stays bounded:

- **Capacity.** `MAX_PROMPTS = 10 000`, reserved under a per-brand transaction-scoped advisory lock inside the inserting transaction on every creation path (settings save, import commit, onboarding / `POST /api/v1/brands`, `POST /api/v1/prompts`). Concurrent saves at 9 999 get exactly one winner. Cloud plan limits are unchanged and checked under the same lock. One prompt identity everywhere (trim, collapse internal whitespace, lowercase) in TypeScript and SQL; the public API answers 409 on a duplicate and caps `limit` at 100.
- **Catalog.** Settings → Prompts is a paged catalog: 50 rows per page, URL state `page` / `q` / `tag` / `status`, case-insensitive text search, one normalized tag filter, status filter, counts that follow the filter, total order (`value, enabled desc, id`), tag suggestions capped at 50. Save sends only changed rows. Leaving with unsaved edits asks Save / Discard / Cancel. The brand layout carries a prompt count instead of every row.
- **Import.** `prompt;tag1;tag2` lines → **Review** (server-side totals plus at most 100 examples per skip reason, nothing written) → **Commit** (same text and status re-checked under the brand lock against a catalog fingerprint; stale review refused; chunked inserts in one transaction; failure anywhere leaves zero rows; textarea keeps its text). F-04 rules kept; duplicates never merge tags. Imports create **disabled** prompts unless "Add as enabled" is chosen.
- **Jobs and cost.** `RUNS_PER_PROMPT` falls back to `1`. A disabled prompt's chain ends at the worker (no paid call, no successor); disabled inserts and imports queue nothing. Enabling starts a chain idempotently; mass starts are spread over the brand cadence in bounded batches. Maintenance reads only the columns it needs, carries each pending job's `start_after`, leaves a never-run prompt's spread first job alone, and spreads mass starts above 50 prompts.

Not in R1: delete UI, cross-page selection, mass enable/disable, global tag delete (R2); the 10 000-fresh-answers/24 h throughput goal (separate, after POLL-COST-01). No migration, dependency, provider, model, `tool_choice`, `service_tier` or sentiment-contract change.

## Identities

| Item | Value |
|---|---|
| Starting baseline | main `7c765840`, production `g17c6124c` (web `04e4f444f37c`, worker `5d766f58b4a7`, db-migrate `9070d9b80692`), journal 27, brand `arag` 33 prompts (33 enabled), dispatch open epoch 16 |
| Feature PR | [#62](https://github.com/e-orlov/aitrckr/pull/62), head `51d45786af2549b510d0479128311145757d426e`, required checks Build / E2E Integration Tests / Scheduling Policy Verification / smoke / Dependency License Audit all success |
| Application source | `239505b5ab4eb93b1853f169b02f1a6429b49531` — squash merge of #62 |
| Images (built once, detached worktree at the source commit) | `elmo-web:g239505b5` `e80b265ed8d6`; `elmo-worker:g239505b5` `8489dc86e609`; `elmo-db-migrate:g239505b5` `74a645ddff7c`; same IDs in rehearsal and production |
| Migration journal | 27 before and after (db-migrate from the release image was a no-op in rehearsal and production) |
| Immediate rollback target | `g17c6124c` trio above (present locally); rollback = repin the three image lines + `docker compose up -d --no-build`; rehearsed on the restored copy: the old build reads and writes the 38-row catalog |
| JIT rehearsal dump | `elmo-prod-pre-pmt10k-rehearsal-20260928-083122.dump` sha256 `e066e1a3…970f4`, control counts identical after restore (brands 1 / prompts 33 / prompt_runs 1585 / citations 4368 / sentiment_analyses 777 / pgboss.job 5508 / journal 27) |
| Pre-cutover dump | `elmo-prod-pre-pmt10k-r1-cutover-20260928-084132.dump` sha256 `b06b6c30…aa32`, copied with counts and config backup to `D:\ELMO-Recovery\PMT10K-R1-Release-20260928-084132\` |
| Cutover | 2026-09-28 08:42:00–08:43:05Z from `../aitrckr-build-pmt10k`: dispatch open→held (epoch 17), zero work in flight, old worker stopped and removed, three image lines repinned, db-migrate no-op, web HTTP 200 at 08:42:45Z (≈10 s), exactly one new worker started last; postgres container not recreated; `.env` sha256 unchanged (`51555781…`); dispatch reopened → epoch 18 |
| Real-life acceptance | 2026-09-28 08:44Z (below) |
| Runtime invariant | first natural run after cutover 09:02:16Z (below) |
| Closeout commit | the commit carrying this file — documentation only, not an image source |

## Verification summary

- Local (worktree, Windows VM): lib 1 212 tests, web unit 544 + new, Storybook 177/177, `turbo check-types` 13/13, lint 0, `pnpm build` incl. server-bundle check.
- Integration on a seeded disposable Postgres: 9 999→10 000 allowed, 10 000→10 001 refused, 6 concurrent savers → 1 winner, tenant isolation, smaller plan limit kept; 200 pages with no repeated or skipped id, server p95 62 ms; import of 9 995 lines review 59 ms / commit 2.2 s, stale review refused, mid-transaction trigger failure → 0 rows, 120 enabled → 120 spread chains and no second chain on re-run.
- Isolated 10K stack (`elmo-pmt10k-test`, this branch's images, stub provider, worker off then on): 10 000 disabled import through the real UI — paste 0.3 s, Review 0.4 s, Commit 2.1 s, no long task > 500 ms, 0 jobs; over-capacity line refused; page 200 correct, DOM 100 prompt inputs; filters exact; keyboard search + paging; one-row delta save; 10 000 enabled import → 10 000 chain jobs (0 duplicate keys) spread over 24 h; maintenance with 10 007 enabled prompts 0.4 s, 0 expedites; stub worker 1 run per prompt, 0 failed, 0 external calls. Playwright `local` 123 passed, `worker` 1/1, Bruno 62/62 requests 131/131 assertions, `verify-scheduling.ts` local and cloud PASS.
- Rehearsal (`elmo-pmt10k-rehearsal`, own config dir/volume/network, web 127.0.0.1:1516, pg 127.0.0.1:5434, fresh secrets, `SCRAPE_TARGETS=stub:stub`): restored JIT dump with identical counts; `g239505b5` booted `--no-build`, journal 27; the full acceptance script below PASSED on the copy (minted session, deleted afterwards); stub worker: one expedited natural job → exactly one `[stub_1]` run and one successor 12 h later; a job for a disabled prompt completed with "disabled, skipping (no reschedule)" and no successor; rollback boot `g17c6124c` read the 38-row catalog and wrote a tag; switched back; project removed with `down -v` (that project only).

## Real-life acceptance (production, metadata only)

Driven end-to-end in headless Chromium on `http://127.0.0.1:1515` with the operator's existing session (reused in-process; nothing minted, printed or written), brand `arag`, 08:43:49–08:44:20Z:

| Step | Observation |
|---|---|
| Open catalog | `Showing 1–33 of 33 prompts`, `33/10,000 prompts in this brand · 33 enabled` |
| Review of 5 new real ARAG formulations (`;topic-tag;pmt10k-r1-acceptance`) | `5 prompts will be added as disabled out of 5 lines. The brand holds 33 prompts and has room for 9,967 more.`; DB unchanged (33 prompts, 33 pending chains) |
| Commit (disabled) | 5 rows, all `enabled=false`, one `created_at` (08:43:49.105Z), tags exactly as pasted + temp tag, `system_tags` computed (`branded` ×2, `unbranded` ×3); 33→38 prompts, enabled 33; **0 `process-prompt` jobs, 0 runs for these ids** |
| Catalog after import | `38/10,000 … 33 enabled`; `?tag=pmt10k-r1-acceptance` → `1–5 of 5 matching`; `?status=disabled` → `1–5 of 5 matching`; `?q=ÜBERNIMMT DIE` → `1–1 of 1 matching` == SQL |
| Delta edit + Save | one row renamed in place (same id `bbc8e142…`, still disabled), count unchanged, 0 jobs |
| Dirty guard | edit → filter navigation → dialog "Save changes before leaving?": Cancel kept the edit, "Discard and leave" dropped it (DB unchanged) |
| Temp tag removal by normal Save | all five rows lose `pmt10k-r1-acceptance`, keep their topic tag, stay disabled; tag filter → `No prompts match these filters.` |
| Deltas during acceptance | prompt_runs 0, usage_events 0, sentiment jobs 0, pending chains 33→33; console errors 0 |

Imported ids (kept, disabled): `c25e3d24-edd1-48a7-ba8d-65762e8185f3`, `bbc8e142-279f-4c26-8866-c119cfd94c1c`, `aaf91b04-6486-4292-8e63-19a2e4b1369e`, `ce4b203a-49b1-4711-a710-c5832da42d61`, `d6165d81-2df7-4d30-9289-2bf27018dd29`.

**Runtime invariant (first natural run on the new version, 09:02:16Z, prompt `3bca6cf0…` "arag mietrechtsschutz sofort"):** `1/1 targets due`, exactly one `[chatgpt_1]` run (`openai/gpt-5.6-luna` via openrouter, `web_search_requests = 1`), no `[chatgpt_2]`, successor `scheduled` at 21:02Z, pending chains 33 for 33 distinct prompts, imported ids still 0 jobs. Effective `RUNS_PER_PROMPT = 1` confirmed.

**Cost accounting (separate):** the natural prompt run = 1 `prompt_run` usage event; its SENT-01 follow-up = 1 `classify-sentiment` job → analysis `completed`, 4 provider attempts, $0.025062 (ledger). OpenRouter key usage $47.0293 → $47.0668 (Δ $0.0375 = run + classification). R1 itself caused **0 paid calls**; no forced run was used.

## Safety attestations

No direct push, bypass or history rewrite; no migration, schema, dependency, secret, model, tier or sentiment-contract change; no provider call in automated, isolated or rehearsal phases; production volume never replaced; `down -v` only on the disposable rehearsal project; no full prompt text of the operator's catalog in the evidence beyond the five acceptance formulations; previous images remain available for rollback.

## Follow-ups recorded (not R1 defects)

From the PR discussion: (1) `getBrandWithPromptsFromDb` counts a prompt once per premium model when a prompt has several — irrelevant while one model per prompt is used; fix before enabling multiple premium models. (2) Manual settings Save does not reject a normalized duplicate text (Import does) — fix under the existing brand lock before relying on manual Add Prompt at scale. Also observed: an SSR catalog page is ≈644 KB uncompressed (≈11 KB per row across two layouts) — constant per page. R2 (delete with SENT-01 history handling, cross-page selection, mass enable/disable, tag delete) and the 10 000/24 h throughput check remain separate.
