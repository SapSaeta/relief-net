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
![Status](https://img.shields.io/badge/status-day_1_·_scaffold-F2A900?style=flat-square)

</div>

---

## 💡 The problem

After a flood, fire or storm, help requests arrive as scattered calls, messages and photos. Volunteer coordinators spend hours reading, deduplicating and prioritizing them by hand, while the people who need help most wait.

**relief-net** turns each request into structured, evidence-backed data and helps one human coordinator triage many requests in minutes instead of hours.

## 🔄 How it works

```mermaid
flowchart LR
    A["📱 Affected person<br/>records a video walkthrough<br/>with voice"] --> B["☁️ Files API<br/>upload"]
    B --> C["🎙️ Muse Voice Transcribe<br/>what they say"]
    B --> D["🖼️ Key frames"] --> E["🎯 SAM 3.1<br/>where the damage is"]
    C --> F["🧠 Muse Spark<br/>structured help request<br/>+ evidence per frame"]
    E --> F
    F --> G["📋 Coordinator dashboard<br/>dedupe · prioritize · match"]
    G --> H{"👤 Human<br/>approves?"}
    H -- yes --> I["🚚 Dispatch volunteers<br/>& resources"]
    H -- no --> G
    G -.-> J[("🧾 Audit log")]
    H -.-> J
```

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
| Muse Spark Open / Muse Glimmer *(stretch)* | Open-weights option via Baseten or Modal |

Only Standard models are used. The `*-contributor` variants are avoided so that data is not used for training.

## 🗺️ Roadmap

| Day | Milestone | Status |
|---|---|:---:|
| Oct 26 | Kickoff, API check, repo | ✅ |
| Oct 27 | Next.js scaffold, video upload, transcription + segmentation pipeline | 🟡 scaffold + Meta client done |
| Oct 28 | Structured request with per-frame evidence | ⬜ |
| Oct 29 | Coordinator dashboard: list, dedupe, priority | ⬜ |
| Oct 30 | Tool calls to match volunteers/resources, explained reasoning | ⬜ |
| Oct 31 | Human approval, audit log, safety rules | ⬜ |
| Nov 1 | Insurance/aid draft report, full synthetic end-to-end scenario | ⬜ |
| Nov 2 | Measurement vs manual baseline (15 requests), open-weights option | ⬜ |
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
    Dashboard + dedupe + priority  :b1, 2026-10-29, 1d
    Matching via tool calls        :b2, after b1, 1d
    Human approval + audit log     :b3, after b2, 1d
    section Delivery
    Report + end-to-end scenario   :c1, 2026-11-01, 1d
    Baseline measurement           :c2, after c1, 1d
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
npm run dev                       # http://localhost:3000
curl localhost:3000/api/health    # {"ok":true,"model":"muse-spark-1.3","reply":"OK",...}
```

```mermaid
sequenceDiagram
    participant B as Browser
    participant N as Next.js /api/health
    participant M as Meta Model API
    B->>N: GET /api/health
    N->>M: responses.create (muse-spark-1.3), key from server env
    M-->>N: "OK"
    N-->>B: { ok, model, reply, latencyMs }
```

## 📁 Repository layout

```
relief-net/
├── app/
│   ├── api/health/route.ts      # GET: minimal Muse Spark round trip
│   ├── layout.tsx
│   └── page.tsx                 # landing page
├── lib/
│   └── meta.ts                  # server-only Meta Model API client (Responses API)
├── docs/
│   ├── PLAN.md                  # 10-day build plan
│   └── RULES.md                 # hackathon rules summary
├── scripts/
│   └── check-meta-api.mjs       # API key + model access check
├── .env.example                 # environment template (no secrets)
├── AGENTS.md                    # Next.js agent notes (maintained by next dev)
└── CLAUDE.md                    # project rules for the AI coding assistant
```

---

<div align="center">
<sub>Built from scratch during the Meta Global AI Developer Hackathon · Oct 27 – Nov 4, 2026</sub>
</div>
