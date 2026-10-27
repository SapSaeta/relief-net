<div align="center">

# 🛟 relief-net

**AI coordination layer for community disaster response**

From a phone video of a damaged home to a prioritized, evidence-backed help request, with a human coordinator approving every dispatch.

![Hackathon](https://img.shields.io/badge/Meta_Global_AI_Developer_Hackathon-Indie_track-0866FF?style=for-the-badge&logo=meta&logoColor=white)

![Next.js](https://img.shields.io/badge/Next.js-TypeScript-000000?style=flat-square&logo=nextdotjs)
![Muse Spark](https://img.shields.io/badge/Muse_Spark-1.3-0866FF?style=flat-square&logo=meta&logoColor=white)
![SAM](https://img.shields.io/badge/SAM-3.1-0866FF?style=flat-square&logo=meta&logoColor=white)
![Voice](https://img.shields.io/badge/Muse_Voice_Transcribe-1.0-0866FF?style=flat-square&logo=meta&logoColor=white)
![Vercel](https://img.shields.io/badge/Deploy-Vercel-000000?style=flat-square&logo=vercel)
![Data](https://img.shields.io/badge/data-100%25_synthetic-2EA44F?style=flat-square)
![Status](https://img.shields.io/badge/status-day_1_·_intake_pipeline-F2A900?style=flat-square)

</div>

---

## 💡 The problem

After a flood, fire or storm, help requests arrive as scattered calls, messages and photos. Volunteer coordinators spend hours reading, deduplicating and prioritizing them by hand, while the people who need help most wait.

**relief-net** turns each request into structured, evidence-backed data and helps one human coordinator triage many requests in minutes instead of hours.

## 🔄 How it works

```mermaid
flowchart LR
    A["📱 Affected person<br/>records a video walkthrough<br/>with voice"] --> P["🎞️ ffmpeg<br/>audio + key frames"]
    P --> C["🎙️ Muse Voice Transcribe<br/>what they say"]
    P --> E["🎯 SAM 3.1<br/>where the damage is"]
    A --> B["☁️ Files API<br/>video upload"]
    C --> F["🧠 Muse Spark<br/>structured help request<br/>+ evidence per frame"]
    E --> F
    B --> F
    F --> G["📋 Coordinator dashboard<br/>dedupe · prioritize · match"]
    G --> H{"👤 Human<br/>approves?"}
    H -- yes --> I["🚚 Dispatch volunteers<br/>& resources"]
    H -- no --> G
    G -.-> J[("🧾 Audit log")]
    H -.-> J
```

## 🎥 Intake pipeline (working)

One synthetic 19-second walkthrough → transcript + damage masks in **~12 s**. Damage found by SAM 3.1 on key frames:

![SAM 3.1 damage masks on synthetic intake frames](docs/assets/intake-sam-overlay.jpg)

<sub>🔴 crack · 🟤 mud · 🟠 debris · 🔵 broken window · 🟢 mold. All images are synthetic, generated with Muse Image.</sub>

```mermaid
sequenceDiagram
    participant U as 📱 Intake page
    participant N as /api/intake
    participant F as ffmpeg
    participant M as Meta Model API
    U->>N: POST video (MP4/MOV)
    N->>F: normalize MP4 (faststart), WAV 24 kHz mono, ≤8 key frames
    par in parallel
        N->>M: Files API upload (purpose user_data, 7-day expiry)
    and
        N->>M: /asr/transcribe (muse-voice-transcribe-1.0, ENDPOINTING)
    and
        N->>M: sam-3.1 × (frames × 5 damage concepts), 6 concurrent, streamed
    end
    M-->>N: file_id · transcript + turns · boxes + masks
    N-->>U: case JSON (stored in .data/cases)
    U->>U: draw masks over each frame
```

| Step | Typical time |
|---|---:|
| ffmpeg prepare | 1.6 s |
| Files API upload | 3.6 s |
| Transcription | 5.1 s |
| SAM 3.1 (8 frames × 5 concepts) | 9.8 s |
| **Total (parallel)** | **≈ 12 s** |

> 💡 **Finding:** SAM segments *objects* well and *textures* poorly. On a moldy wall, `"mold"` returns nothing while `"black spots"` finds it. Each damage label therefore has its own SAM prompt. Next step: let Muse Spark look at the video and propose the noun phrases for SAM to ground.

## 🧩 Architecture

```mermaid
flowchart TB
    subgraph Client["Browser (mobile + desktop)"]
        UI1[Intake page]
        UI2[Coordinator dashboard]
    end
    subgraph Server["Next.js server (Vercel) · API key never leaves here"]
        R1["/api/intake"]
        R2["/api/triage"]
        LIB["lib/meta.ts<br/>openai SDK · Responses API"]
        LOG[(Audit log)]
    end
    subgraph Meta["Meta Model API"]
        M1[Files API]
        M2[muse-voice-transcribe-1.0]
        M3[sam-3.1]
        M4[muse-spark-1.3]
    end
    UI1 --> R1
    UI2 --> R2
    R1 --> LIB
    R2 --> LIB
    LIB --> M1 & M2 & M3 & M4
    R1 & R2 --> LOG
```

## 🤖 Meta models used

| Model | Role in relief-net |
|---|---|
| `muse-spark-1.3` | Structured help request, deduplication, prioritization, tool calls to match volunteers/resources, explained reasoning, draft insurance/aid report |
| `sam-3.1` | Segments visible damage on video frames as evidence |
| `muse-voice-transcribe-1.0` | Transcribes the narrated walkthrough |
| Files API (`purpose: "user_data"`) | Video upload |
| `muse-image-1.0` | Generates the synthetic test scenes (no real photos are used) |
| `meta-models/muse-spark-open-1026` on Baseten | Open-weights option for the coordinator side (triage, dedupe, tool-call matching), so sensitive request data can stay on infrastructure the relief organization controls. Verified: tool calling, strict JSON schema, Responses API |

Only Standard models are used. The `*-contributor` variants are avoided so that data is not used for training.

## 🗺️ Roadmap

| Day | Milestone | Status |
|---|---|:---:|
| Oct 26 | Kickoff, API check, repo | ✅ |
| Oct 27 | Next.js scaffold, video upload, transcription + segmentation pipeline | ✅ |
| Oct 28 | Structured request with per-frame evidence | ⬜ |
| Oct 29 | Coordinator dashboard: list, dedupe, priority · provider switch Meta ↔ open weights (Baseten) | ⬜ |
| Oct 30 | Tool calls to match volunteers/resources, explained reasoning | ⬜ |
| Oct 31 | Human approval, audit log, safety rules | ⬜ |
| Nov 1 | Insurance/aid draft report, full synthetic end-to-end scenario | ⬜ |
| Nov 2 | Measurement vs manual baseline (15 requests), Meta API vs open weights | ⬜ |
| Nov 3 | Polish, Vercel deploy, demo video | ⬜ |
| Nov 4 | Submission | ⬜ |

```mermaid
gantt
    title relief-net · 10-day build
    dateFormat YYYY-MM-DD
    axisFormat %b %d
    section Intake
    Scaffold + upload + pipeline   :a1, 2026-10-27, 1d
    Structured request + evidence  :a2, after a1, 1d
    section Coordination
    Dashboard + open-weights switch :b1, 2026-10-29, 1d
    Matching via tool calls        :b2, after b1, 1d
    Human approval + audit log     :b3, after b2, 1d
    section Delivery
    Report + end-to-end scenario   :c1, 2026-11-01, 1d
    Baseline: Meta vs open weights :c2, after c1, 1d
    Polish + deploy + video        :c3, after c2, 1d
    Submit                         :milestone, 2026-11-04, 0d
```

## 🛡️ Safety by design

- 👤 **Human in the loop:** a coordinator approves every dispatch, and the AI only proposes.
- 🧾 **Audit log:** every AI suggestion and human decision is recorded.
- 🚨 **Emergencies go to 112**, and structural risk goes to professionals. relief-net does not give medical or structural advice.
- 🔐 **Server-side only:** the API key lives in the server environment and never reaches the browser.
- 🧪 **Synthetic data only:** no real people, companies or clients.

## 🚀 Getting started

```bash
npm install
cp .env.example .env              # paste your MODEL_API_KEY into .env (local only)
node scripts/check-meta-api.mjs   # lists your models and pings muse-spark-1.3
node scripts/make-fixture.mjs     # synthetic flood walkthrough → private/fixtures/intake-flood.mp4 (macOS)
npm run dev                       # http://localhost:3000
curl localhost:3000/api/health    # {"ok":true,"model":"muse-spark-1.3","reply":"OK",...}
open http://localhost:3000/intake # upload the walkthrough and see the damage masks
```

## 📁 Repository layout

```
relief-net/
├── app/
│   ├── api/health/route.ts      # GET: minimal Muse Spark round trip
│   ├── api/intake/route.ts      # POST video → transcript + damage segmentation
│   ├── intake/                  # intake page: upload + mask overlays
│   ├── layout.tsx
│   └── page.tsx                 # landing page
├── lib/
│   ├── meta.ts                  # server-only Meta Model API client (Responses API)
│   ├── media.ts                 # ffmpeg: MP4 faststart, WAV 24 kHz, key frames
│   ├── transcribe.ts            # Muse Voice Transcribe (/asr/transcribe)
│   ├── segment.ts               # SAM 3.1 damage concepts on frames
│   └── intake.ts                # pipeline orchestration + case store
├── docs/
│   ├── assets/                  # screenshots (synthetic data only)
│   ├── PLAN.md                  # 10-day build plan
│   └── RULES.md                 # hackathon rules summary
├── scripts/
│   ├── check-meta-api.mjs       # API key + model access check
│   └── make-fixture.mjs         # synthetic test video (Muse Image + say + ffmpeg)
├── .env.example                 # environment template (no secrets)
├── AGENTS.md                    # Next.js agent notes (maintained by next dev)
└── CLAUDE.md                    # project rules for the AI coding assistant
```

---

<div align="center">
<sub>Built from scratch during the Meta Global AI Developer Hackathon · Oct 27 – Nov 4, 2026</sub>
</div>
