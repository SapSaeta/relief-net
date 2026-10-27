# Open weights check

Muse Spark Open on Baseten (`meta-models/muse-spark-open-1026`), run with `node scripts/check-open-weights.mjs` on 2026-10-27T16:40:54.831Z.

| Check | Result | Latency | Tokens in / out | Output |
|---|---|---:|---:|---|
| Responses API | ✅ | 1809 ms | 152 / 223 | `OK` |
| Tool calling | ✅ | 948 ms | 691 / 162 | `find_volunteers({"skill": "mud_removal", "area": "Riverside", "count": 3})` |
| Strict JSON schema | ✅ | 2469 ms | 174 / 595 | `{ "duplicate": true, "reason": "Same location/issue - kitchen + mud - and same occupancy - 2 adults / two adults" }` |
