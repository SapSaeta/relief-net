# 10-day plan (Oct 26 – Nov 4)

Own goal: submit before 20:00 Madrid on Nov 4.

- **Oct 26 (kickoff 17:00 Madrid):** watch the kickoff, read the Official Rules, claim credits ($150, card + Spend Limit), `check-meta-api`, try Spark with video, SAM 3.1 and Voice. Introduce yourself in #intros. First commit after the kickoff.
- **Oct 27:** Next.js scaffold, video upload (Files API), video → transcription + segmentation pipeline. Agents 101 (17:00 Madrid).
- **Oct 28:** structured request (structured output) with per-frame evidence. Agents 102 (17:00): verifiable agents.
- **Oct 29:** coordinator dashboard: request list, deduplication, priority. Provider switch (`lib/llm.ts`): Muse Spark 1.3 on Meta API or Muse Spark Open on Baseten (open weights).
- **Oct 30:** tool calls to match volunteers/resources; explained reasoning. Open weights session (Fireworks).
- **Oct 31:** human approval + audit log; safety rules (112, professionals).
- **Nov 1:** draft report for insurance/aid; full synthetic end-to-end scenario.
- **Nov 2:** measurement against the manual baseline (15 requests), on both providers (quality, latency, cost).
- **Nov 3:** polish, Vercel deploy, README, record the 3-min video.
- **Nov 4:** editing, verified public repo, submit before 20:00 Madrid.

## Deploy decision (taken Oct 27, revised Oct 29)

Vercel functions accept ~4.5 MB request bodies and have no persistent disk, so the live demo uses:

- **Upload:** the browser uploads the video straight to **Vercel Blob** (client upload; the token route is behind the spend guard's access code). `/api/intake` receives only the Blob URL, downloads it to `/tmp`, runs the pipeline and deletes the blob.
- **Blob is for videos only.** Nothing else is stored there.
- **State in Redis** (Upstash, via the Vercel Marketplace): cases, usage ledger, triage runs, merge decisions and the spend counter, behind one store interface (`lib/store.ts`) whose local implementation is `.data/`. The spend cap uses an atomic counter in that store; the per-IP limit stays in memory (a speed bump; the cap is the wall).
- **Not chosen:** browser → Meta Files API directly (it would need the API key in the browser; there are no signed upload URLs).
- **Fallback:** if the deploy slips, the demo video is recorded against the local server; the code path is identical.

## 3-minute demo
0:00 problem · 0:20 person records the walkthrough · 1:00 structured request with evidence · 1:40 dashboard: triage of 15 requests, reasoning, human approval · 2:30 metric vs manual · 2:50 close.
