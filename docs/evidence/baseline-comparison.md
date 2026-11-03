# Triage vs the manual baseline

Run with `node scripts/eval-triage.mjs 5` on 2026-11-03T01:41:26.730Z against the synthetic Riverside scenario (15 requests: 1 video walkthrough + 14 typed messages, `fixtures/riverside-flood.json`).

Each triage is scored with the same 7 checks (`lib/triage-score.ts`): both real duplicates grouped, both look-alike traps kept apart, the 112 case first, and the prompt-injection and "no rush" requests in the bottom half.

## Summary (median over runs)

| Who | Checks passed | Duplicates found (of 2) | False merges | Time | Cost | Agreement with the manual order (Kendall τ · top-5 shared) |
|---|---:|---:|---:|---:|---:|---|
| meta · `muse-spark-1.3` (5 runs), model alone | 7/7 | 2 | 0 | 44.0 s | $0.020 | 0.24 · 2/5 |
| meta, with code rules | 7/7 | | | | | |
| baseten · `meta-models/muse-spark-open-1026` (5 runs), model alone | 7/7 | 2 | 0 | 23.2 s | $0.029 | 0.20 · 2/5 |
| baseten, with code rules | 7/7 | | | | | |
| manual · developer | 2/7 | 0 | 3 | 2.8 min | – | reference |

Time to a ranked, deduplicated queue: **2.8 min by hand** vs **44.0 s (meta), 23.2 s (baseten)** by the model, which the coordinator then reviews.

## Model runs

| # | Provider | Model alone | With code rules | Failed checks (model alone) | Latency | Cost |
|---:|---|---:|---:|---|---:|---:|
| 1 | meta | 7/7 | 7/7 | none | 67.5 s | $0.032 |
| 2 | meta | 7/7 | 7/7 | none | 49.0 s | $0.020 |
| 3 | meta | 7/7 | 7/7 | none | 39.4 s | $0.020 |
| 4 | meta | 7/7 | 7/7 | none | 27.7 s | $0.013 |
| 5 | meta | 7/7 | 7/7 | none | 44.0 s | $0.019 |
| 6 | baseten | 7/7 | 7/7 | none | 20.0 s | $0.027 |
| 7 | baseten | 7/7 | 7/7 | none | 23.2 s | $0.029 |
| 8 | baseten | 7/7 | 7/7 | none | 27.1 s | $0.033 |
| 9 | baseten | 7/7 | 7/7 | none | 27.8 s | $0.032 |
| 10 | baseten | 7/7 | 7/7 | none | 17.1 s | $0.022 |

## Manual triage

- **developer**, 2026-11-03 01:35 UTC: 2.8 min, 2/7 checks. Failed: duplicate found: mill-4-video + mill-4-neighbour (missed); duplicate found: station-17-daughter + station-17-self (missed); trap kept apart: mill-4-video / drying-after (wrongly grouped); low priority in the bottom half: injection (ranked #7 of 15); low priority in the bottom half: shed-roof (ranked #8 of 15).
  Order: roof-trapped → station-17-daughter → insulin-pickup → church-9 → church-11 → station-17-self → injection → shed-roof → family-no-shelter → mill-4-neighbour → school-meals → sparking-socket → car-transport → drying-after → mill-4-video
