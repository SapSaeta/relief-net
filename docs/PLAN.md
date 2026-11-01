# 10-day plan (Oct 26 – Nov 4)

Own goal: submit before 20:00 Madrid on Nov 4.

- **Oct 26 (kickoff 17:00 Madrid):** watch the kickoff, read the Official Rules, claim credits ($150, card + Spend Limit), `check-meta-api`, try Spark with video, SAM 3.1 and Voice. Introduce yourself in #intros. First commit after the kickoff.
- **Oct 27:** Next.js scaffold, video upload (Files API), video → transcription + segmentation pipeline. Agents 101 (17:00 Madrid).
- **Oct 28:** structured request (structured output) with per-frame evidence. Agents 102 (17:00): verifiable agents.
- **Oct 29:** coordinator dashboard: request list, deduplication, priority. Provider switch (`lib/llm.ts`): Muse Spark 1.3 on Meta API or Muse Spark Open on Baseten (open weights).
- **Oct 30:** tool calls to match volunteers/resources; explained reasoning. Open weights session (Fireworks). *Slipped to Nov 1: synthetic roster (`fixtures/riverside-resources.json`) and deterministic assignment checks (`lib/match-rules.ts`) first, then the tool-calling agent (`lib/match.ts`): batched tools so it finishes in 3 rounds on Meta and 6 on Baseten; Meta only supports `tool_choice: "auto"`, so a model that stops early is reminded what is still open. Done Nov 1 with the dashboard panel (proposals per request, agent trace, roster) and saved traces for both providers (`docs/evidence/matching-runs.md`).*
- **Oct 31:** human approval + audit log; safety rules (112, professionals). *Done Nov 1: approve & dispatch (simulated) or reject each assignment, final decisions kept across matching runs, rejection notes fed back to the agent; append-only audit log at `/audit` with the actor of every action (public, model, code rule, coordinator); earlier actions backfilled from stored records and marked as such.*
- **Nov 1:** draft report for insurance/aid; full synthetic end-to-end scenario.
- **Nov 2:** measurement against the manual baseline (15 requests), on both providers (quality, latency, cost).
- **Nov 3:** polish, Vercel deploy, README, record the 3-min video.
- **Nov 4:** editing, verified public repo, submit before 20:00 Madrid.

## Deploy decision (taken Oct 27, revised Oct 29)

Vercel functions accept ~4.5 MB request bodies and have no persistent disk, so the live demo uses (first production deploy Nov 1: https://relief-net-one.vercel.app, review mode verified; paid routes return 401 without the access code):

- **Upload (implemented Oct 29):** with `BLOB_READ_WRITE_TOKEN` set, the browser uploads the video straight to a **private** Vercel Blob (client upload; `/api/intake/upload` requires the access code and only issues tokens for MP4/MOV up to 200 MB under `intake/`). `/api/intake` receives only the blob pathname, streams it to `/tmp`, runs the pipeline and deletes the blob. Without the token (local development) the browser posts multipart as before. Nov 1: the access code is trimmed on both sides, and a rejected upload token says to check the code (the Blob client otherwise only reports "Failed to retrieve the client token").
- **Blob is for videos only.** Nothing else is stored there.
- **Frame images apart (Nov 1):** the first live video uploads made the case listing exceed Upstash's 10 MB per request (about 2 MB of key-frame images per video case), and the dashboard stopped loading. Frame images now live in their own `case-frames` document, read only by the case page; listings read in chunks of 10. `scripts/split-frame-images.mjs` migrated the 7 existing video cases in production.
- **State in Redis** (Upstash, via the Vercel Marketplace): cases, usage ledger, triage runs, merge decisions and the spend counter, behind one store interface (`lib/store.ts`) whose local implementation is `.data/`. The spend cap uses an atomic counter in that store; the per-IP limit stays in memory (a speed bump; the cap is the wall).
- **Not chosen:** browser → Meta Files API directly (it would need the API key in the browser; there are no signed upload URLs).
- **Review mode for judges:** pages are readable without a code and show a pre-seeded synthetic scenario (`scripts/publish-snapshot.mjs` copies it to Redis); intake, triage and merge decisions need `DEMO_ACCESS_CODE`, given privately in the submission's testing instructions.
- **Fallback:** if the deploy slips, the demo video is recorded against the local server; the code path is identical.

## 3-minute demo
0:00 problem · 0:20 person records the walkthrough · 1:00 structured request with evidence · 1:40 dashboard: triage of 15 requests, reasoning, human approval · 2:30 metric vs manual · 2:50 close.
