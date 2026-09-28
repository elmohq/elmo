# PMT-10K R2 Bulk operations on the prompt catalog — production closeout

Status: **PRODUCTION REAL-LIFE ACCEPTANCE PASS / CLOSED** 2026-09-28. Raw evidence (driver reports, screenshots, cutover log, dump checksums): operator-private `~/.elmo-task-evidence/pmt-10k/r2/` (`RELATIONS.md`, `RELEASE-PLAN.md`, `PR-BODY.md`, `measure/`, `scale/`, `release/` with `rehearsal/`, `prod/`, `raw/`).

## What changed

Bulk operations on one brand's R1 prompt catalog, every one of them previewed first and committed all-or-nothing under the brand lock:

- **Selection.** The header checkbox selects the saved rows on screen; above one page, "Select all N matching" fetches the exact ids of the current `q` / `tag` / `status` filter (ids only, ≤ 10 000). The selection survives paging within the same filter and is dropped by any filter or brand change.
- **Bulk status.** Enable / disable the selected prompts in one transaction; rows already in the target state are left alone (repeat = "Nothing to change"). Disabling cancels the queued chain jobs in the same transaction; a run already in progress finishes once. Enabling starts chains after the commit through the idempotent, cadence-spread R1 chain start.
- **Chain start vs disable / delete.** Every `process-prompt` chain send (enable's chain start, the worker's end-of-run reschedule, maintenance revival) decides and inserts inside one transaction that share-locks the prompt row, so a disable or delete either waits for the insert and cancels it or lands first and the send inserts nothing. A queued chain for a disabled or deleted prompt can no longer be left behind.
- **History delete.** Disabled prompts of the brand only. Preview counts exactly what goes (prompts, runs, citations, entity mentions, every SENT-01 table hanging off the runs with recorded attempt cost, queued jobs to cancel) and what stays (`usage_events`). Commit requires `DELETE <N> PROMPTS`, re-checks ids, state and counts against the preview digest, refuses as a whole on any blocker (enabled, foreign, running prompt job, pending sentiment classification, in-force permit, moved history), then cancels queued chains and deletes citations → runs (FK cascades carry the sentiment graph) → prompts. Cap 5 000 prompts per operation. Kept by decision: `usage_events` (billing) and the global `sentiment_control_events` log.
- **Tag removal.** With a tag filter active, remove that one user tag from every prompt of the brand (`REMOVE <tag>`); system tags refused; prompts and history untouched.
- **Migration 0027** `bulk_delete_fk_indexes`: four additive indexes on the FK columns a cascade walks per parent row (`citations.prompt_run_id`, `sentiment_observations.prompt_run_id`, `sentiment_observations.mention_id`, `sentiment_provider_attempts.permit_id`). Journal 27 → 28.

Not in R2: model, search-policy, tier or SENT-01 contract changes; the 10 000-fresh-answers/24 h throughput goal.

## Identities

| Item | Value |
|---|---|
| Starting baseline | main `4123fc01`, production `g239505b5` (web `e80b265ed8d6`, worker `8489dc86e609`, db-migrate `74a645ddff7c`), journal 27, brand `arag` 38 prompts (33 enabled), 33 pending chains, dispatch open epoch 18 |
| Feature PR | [#64](https://github.com/e-orlov/aitrckr/pull/64), head `0bbc804bf8d8bdcc3cab760afb572df4f5ff7385` (last commit: chain send under the prompt's row lock), required checks Build / E2E Integration Tests / Scheduling Policy Verification / smoke / Dependency License Audit all success, mergeable CLEAN |
| Application source | `bd62a51434fdea67523e7d12d1dcb976ea5bda3e` — squash merge of #64 |
| Images (built once, detached worktree at the source commit) | `elmo-web:gbd62a514` `8c11f16b9db0`; `elmo-worker:gbd62a514` `713a6b536e72`; `elmo-db-migrate:gbd62a514` `0aa302e2768c`; same IDs in rehearsal and production |
| Migration journal | 27 → 28 (0027 applied by db-migrate from the release image, rehearsal and production alike; four indexes present) |
| Immediate rollback target | `g239505b5` trio above (present locally); rollback = repin the three image lines + `docker compose up -d --no-build`; rehearsed on the restored copy after 0027: db-migrate `g239505b5` exit 0, journal stays 28, the R1 build reads the 40-row catalog and saves an edit with the indexes present. A code rollback does not restore history deleted or tags removed through R2 — the pre-cutover dump is the only way back for data |
| JIT rehearsal dump | `elmo-prod-jit-pmt10k-r2-20260928-141202.dump` sha256 `0248fc86…e748b`, counts identical after restore (prompts 38 / prompt_runs 1616 / citations 4451 / usage_events 4561 / sentiment_analyses 788 / sentiment_provider_attempts 2478 / sentiment_control_events 323 / pending chains 33 / journal 27) |
| Pre-cutover dump | `elmo-prod-pre-pmt10k-r2-cutover-20260928-142541.dump` sha256 `75ee55be…d39f6`, copied with counts, config backup and the three images (`images-gbd62a514.tar`) to `D:\ELMO-Recovery\PMT10K-R2-Release-20260928-142541\` (SHA256SUMS.txt) |
| Cutover | 2026-09-28 14:27:24–14:28:18Z from `../aitrckr-build-pmt10k-r2`, watchdog mutex held: dispatch open→held (epoch 19), zero work in flight, old worker stopped and removed, three image lines repinned, db-migrate 27→28 with 4 indexes, web HTTP 200 at 14:27:58Z (≈10 s), exactly one new worker started last; postgres container not recreated; `.env` sha256 unchanged (`51555781…`); dispatch reopened → epoch 20; 33 pending chains for 33 enabled prompts afterwards |
| Real-life acceptance | 2026-09-28 14:29:20–14:31:03Z (below) |
| Closeout commit | the commit carrying this file — documentation only, not an image source |

## Verification summary

- Local (worktree): lib 1 213 tests (run-policy 97 incl. the chain-send outcomes), web unit 544, worker 12, Storybook 178/179 (known Recharts timing flake passes alone), `check-types` 13/13, lint 0, build OK.
- Integration on a seeded disposable Postgres (`prompt-bulk.integration.test.ts`, 8/8, also in CI): exact brand-scoped selection ids; status preview/commit/idempotency, cancelled chains on disable, foreign id refused; **race regression** — a `boss.send` spy starts the disable of the same prompt and continues only once it has settled or is blocked on a lock: on the previous head the disabled prompt kept one `created` chain job, on the released head the disable waits for the insert and cancels it (`{ cancelled: 1 }`, 0 pending); full-graph delete with billing and control log kept, blockers, mid-transaction fault → zero rows and the chain cancellation rolled back; tag removal scope and no-op.
- Restored production copies: deleting the real prompt with the largest SENT-01 graph — earlier on `elmo_r2copy` (50 runs / 67 analyses / 176 attempts) and again in this rehearsal through the real UI (52 runs / 88 citations / 51 mentions / 77 detections / 68 analyses / 63 observations / 89 aspects / 7 filtered claims / 51 review cases / 19 permits / 180 attempts $1.2694) → every history table 0 for it, 254 usage events kept, billing total unchanged ($31.831708), control log unchanged, no orphans, neighbours byte-identical, aggregates recomputed (runs 1649→1597, mention rate 37.30→35.32 %), 404 ms. Delete timings with the indexes: 1 000 ≈ 1.8 s, 5 000 ≈ 7 s (47.6 s without them).
- Isolated 10K stack (branch images, stub provider): select 50 then all 10 000 (0.3 s, 510 KB ids), enable 10 000 → 10 000 chains spread over 24 h, repeat enable "Nothing to change", disable 10 000 → 0 chains, tag removal over 2 500, over-cap delete refused, two 5 000 deletes 2.0 / 1.5 s → 0 rows and 0 pending jobs for deleted ids, other tenant identical, 0 provider calls; worker probe: bulk disable while jobs flow → each due job ran once, 40 cancelled, 0 pending. Playwright `local` 128/128, `worker` 1/1, Bruno 62/62 (131 assertions), `verify-scheduling local` PASS.
- Rehearsal (`elmo-pmt10k-r2-rehearsal`, own config dir / volume / network, web 127.0.0.1:1516, pg 127.0.0.1:5434, `SCRAPE_TARGETS=stub:stub`): restore with identical counts; db-migrate `gbd62a514` 27→28, 4 indexes; the full acceptance script below PASSED on the copy (minted session, deleted afterwards), including the worker pause and a maintenance tick that revived nothing; real-history delete above; rollback boot `g239505b5` verified; project removed with `down -v` (that project only).

## Real-life acceptance (production, metadata only)

Driven end-to-end in headless Chromium on `http://127.0.0.1:1515` with the operator's existing session (reused in-process; nothing minted, printed or written), brand `arag`, watchdog mutex held for the run, 14:29:20–14:31:03Z:

| Step | Observation |
|---|---|
| Open catalog | `38/10,000 prompts in this brand · 33 enabled` |
| Import 6 new real ARAG formulations (`;topic-tag;pmt10k-r2-acceptance`) | Review `6 prompts will be added as disabled out of 6 lines…` (DB unchanged); Commit → 6 rows `enabled=false`, one `created_at` 14:29:28.465Z, tags as pasted + temp tag; 38→44 prompts, enabled 33; 0 jobs, 0 runs for these ids |
| Selection | `?tag=pmt10k-r2-acceptance` → `1–6 of 6 matching`; header checkbox → `6 selected` (= all matching); search change → selection cleared; whole catalog `1–44 of 44` → header checkbox `44 selected` (= all matching on the single page; the cross-page "Select all N matching" button applies above 50 rows and was proven at 10 000 on the isolated stack); "Clear selection" empties it |
| Worker pause | in flight: `process-prompt` active 0, `classify-sentiment` open 0, attempts `sending` 0, analyses `processing` 0 → `docker stop -t 35 elmo-worker-1` (graceful); 33 pending chains untouched |
| Enable 2 | preview `2 will be enabled. 2 run chains will start, spread over the next 12 hours…` → `2 prompts enabled.`; exactly 2 `created` jobs, one per prompt: `4d7410de…` due at once (14:29:40Z), `7ede090c…` at 20:29:40Z; worker stopped → no run |
| Disable 2 | preview `2 will be disabled. 2 queued runs will be cancelled.` → `2 prompts disabled.`; jobs for the two ids: `cancelled = 2`, `created/retry/active = 0`; enabled back to 33 |
| Repeat disable | preview `0 will be disabled; 2 already disabled and left as is.`, commit button "Nothing to change"; jobs unchanged |
| Worker back | `docker start elmo-worker-1`, restarts 0, log clean; next `schedule-maintenance` tick completed 14:30Z: `Checking 33 enabled prompts … All prompts are on schedule or have pending jobs`; the two ids still `cancelled = 2`, 0 pending; 33 pending chains |
| Delete 3 | ids `4d7410de-5859-4413-9df1-50b5f7dc0a1d`, `7ede090c-ef37-4738-a8c4-5ad854746199`, `fa4446dc-476b-46ea-bdbb-4a595cf8d8ef`; preview `Prompts 3 · Answers (runs) 0 · … · Sentiment provider attempts 0 ($0.0000) · Queued run jobs to cancel 0 · Kept: billing records 0`, no blocker; phrase `DELETE 3 PROMPTS` → `Deleted 3 prompts and their history.`; rows gone, 0 jobs, 0 history rows, 0 usage events for them; 44→41 prompts |
| Remove temp tag | `?tag=pmt10k-r2-acceptance` → `1–3 of 3 matching`; preview `3 prompts carry the tag pmt10k-r2-acceptance.`; phrase `REMOVE pmt10k-r2-acceptance` → `Removed the tag “pmt10k-r2-acceptance” from 3 prompts.`; tag filter dropped; the 3 rows keep their topic tag and stay disabled; the tag exists nowhere |
| Deltas during acceptance | prompts +3 (38→41), enabled 0 (33), pending chains 0 (33), prompt_runs 0, citations 0, usage_events 0, sentiment_analyses 0, sentiment_provider_attempts 0, sentiment_control_events 0, classify-sentiment jobs 0, journal 0 (28); no other brand exists; console errors 0 |

Kept ids (real disabled prompts, temp tag removed): `eb961b47-d4e2-48ee-b36b-af739fc1c8a3` (arbeitsrecht), `ec997ca5-dcc4-4de6-9947-ebc681ac47c1` (rechtsschutz), `b6369d83-f7f4-45fa-8d29-7f4fa8ad07cd` (service).

**Cost accounting:** R2 caused **0 paid calls** — 0 prompt runs, 0 usage events, 0 provider attempts for any canary id, and no natural run fell into the acceptance window. OpenRouter key usage read-only after the release: $47.7472 (the +$0.68 since the R1 closeout reading of $47.0668 is the natural 12-hour cadence of the 33 enabled prompts and their sentiment classifications over the day). No forced run was used. No prompt with real history was deleted in production; that path is proven on the restored copies only.

## Safety attestations

No direct push, bypass or history rewrite; the only schema change is the four additive indexes of migration 0027; no dependency, secret, provider, model, tier or sentiment-contract change; no provider call in automated, isolated, rehearsal or acceptance phases; production volume never replaced; `down -v` only on the disposable rehearsal project; no full prompt text of the operator's catalog in the evidence beyond the six acceptance formulations; previous images remain available for rollback.

## Follow-ups (not R2 defects)

The R1 follow-ups stand (brand premium-model aggregate with several models per prompt; normalized-duplicate check on manual settings Save). The SENT-01 v1.1.3 contract rework, the search-policy / tier decision (POLL-COST-01) and the 10 000-fresh-answers/24 h throughput check remain separate.
