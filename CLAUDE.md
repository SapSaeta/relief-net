# relief-net — Meta Global AI Developer Hackathon (Indie track, team "Saetas")

AI coordination layer for community disaster response. Personal project by Javier, **unrelated to any employer or client**. Never name any employer or client anywhere in this project.

**Language: everything in this project is in English** — code, comments, UI copy, docs, commit messages, PR/issue text and the repo itself.

## Hard rules (non-negotiable)
- Synthetic data only. No code, data or assets from any employer or client.
- The key (`MODEL_API_KEY`) lives only in the local `.env`. Never in code, commits, logs, screenshots or chat. `.env` is in `.gitignore`.
- The repo will be public: do not push anything that cannot be public.
- "New work only": built between Oct 27 and Nov 4, 2026. First git commit AFTER the kickoff (Oct 26, 17:00 Madrid). Commits must clearly show what is new.
- Forbidden: medical advice, politics/war, basic RAG, simple image analyzer. Emergencies → 112; structural risk → professionals.
- A human coordinator approves every dispatch. Audit log of every action.
- Use Standard models (`muse-spark-1.3`), NOT the `*-contributor` ones (Meta would train on the data).

## Product
1. Mobile intake (web): the affected person records a video walkthrough with voice. SAM 3.1 marks damage, Muse Voice Transcribe transcribes, Muse Spark generates a structured help request with evidence + a draft report for insurance/aid.
2. Coordinator dashboard: Muse Spark deduplicates and prioritizes requests, uses tool calls to match volunteers/resources, explains its reasoning; the human approves.
3. Extra: case tracking and an open-weights option (Muse Glimmer / Muse Spark Open via Baseten or Modal) for the open weights prize.

## Stack
Next.js (TypeScript) on Vercel. `openai` SDK with `baseURL=https://api.meta.ai/v1` and the Responses API. Models: `muse-spark-1.3`, `sam-3.1`, `muse-voice-transcribe-1.0`. Files via the Files API (`purpose: "user_data"`).

## Judging criteria (25% each)
Impact · Use of Meta tools · Technical depth · Demo (3-min video + live product + code).

## Workflow
- A single end-to-end scenario, measured against a manual baseline (minutes to triage 15 requests).
- Check the API with `node scripts/check-meta-api.mjs`.
- Plan in `docs/PLAN.md`, rules in `docs/RULES.md`.
- **Keep `README.md` current in the same commit as the change it describes:** roadmap status, diagrams (Mermaid), models used, getting started, repository layout and status badge. Prefer visuals (diagrams, tables, screenshots/GIFs in `docs/assets/`) over prose.
- Submit before 20:00 Madrid on Nov 4 (official deadline 03:00 on Nov 5).
