# Matching agent: one run per provider

Recorded Nov 1, 2026 on the synthetic Riverside scenario (14 requests in the triaged queue, roster in `fixtures/riverside-resources.json`). Each run: `POST /api/match` on a local server (`npm run dev`), output saved below. Both runs use the same prompt, tools and code checks (`lib/match.ts`, `lib/match-rules.ts`).

| Provider | Model | Rounds | Tool results | Rejected by code, then fixed | Assigned | Flagged | Not handled | Latency | Cost |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| meta | `muse-spark-1.3` | 3 | 16 | 0 | 12 | 2 | 0 | 28.1 s | $0.038 |
| baseten | `meta-models/muse-spark-open-1026` | 6 | 18 | 1 | 12 | 2 | 0 | 51.9 s | $0.079 |

Both runs flag the 112 case (family on the balcony) instead of sending volunteers, put a structural engineer on the team for the Mill Lane house with a cracked wall, and flag the sparking socket because the only electrician is already booked by the two Station Road reports, which the coordinator has not merged yet (confirming that merge frees him).

## meta · `muse-spark-1.3`

| Round | Tool | Request | Result |
|---:|---|---|---|
| 1 | `find_volunteers` |  | ✅ V1 (1 left), V2 (2 left), V3 (2 left), V4 (1 left), V5 (1 left), V6 (2 left), V7 (2 left), V8 (2 left), V9 (1 left), V10 (1 left) |
| 1 | `check_supplies` |  | ✅ shovel_kit: 4, water_pump: 1, dehumidifier: 3, generator: 1, tarp: 6, food_parcel: 60, water_crate: 40, camp_bed: 12 |
| 2 | `propose_assignments` | R4 | ✅ accepted · V6 Sam K.: power · available today · V8 Omar D.: shelter · available today · electrical hazard: electrician on the team · 1 × Portable generator (0 left) · 1 × Camp bed at the sports hall (11 left) |
| 2 | `propose_assignments` | R12 | ✅ accepted · V8 Omar D.: shelter · available today · 3 × Camp bed at the sports hall (8 left) |
| 2 | `propose_assignments` | R14 | ✅ accepted · V4 Luis M.: transport · available tomorrow · vehicle on the team |
| 2 | `propose_assignments` | R9 | ✅ accepted · V6 Sam K.: power · available today · electrical hazard: electrician on the team |
| 2 | `propose_assignments` | R5 | ✅ accepted · V3 Priya S.: medication_pickup · available today · vehicle on the team |
| 2 | `propose_assignments` | R1 | ✅ accepted · V7 Helen W.: safety lead (structural engineer) · available today · V10 Jake L.: mud_removal, debris_removal, drying · available today · structural risk: structural engineer on the team · 1 × Shovel and squeegee kit (3 left) · 1 × Dehumidifier (2 left) |
| 2 | `propose_assignments` | R13 | ✅ accepted · V3 Priya S.: water_food · available today · 40 × Food parcel (one household, 2 days) (20 left) · 20 × Drinking water crate (24 × 0.5 l) (20 left) |
| 2 | `propose_assignments` | R6 | ✅ accepted · V2 Tom R.: mud_removal, debris_removal · available today · 1 × Shovel and squeegee kit (2 left) |
| 2 | `propose_assignments` | R7 | ✅ accepted · V1 Ana P.: mud_removal · available today · 1 × Water pump (0 left) · 1 × Shovel and squeegee kit (1 left) |
| 2 | `propose_assignments` | R15 | ✅ accepted · V5 Grace O.: drying · available today · 1 × Dehumidifier (1 left) |
| 2 | `propose_assignments` | R11 | ✅ accepted · V9 Ruth B.: temporary_repair · available tomorrow · 1 × Tarpaulin (5 left) |
| 2 | `propose_assignments` | R10 | ✅ accepted · V7 Helen W.: temporary_repair · available today |
| 2 | `flag_for_coordinator` | R3 | ✅ flagged for the coordinator |
| 2 | `flag_for_coordinator` | R8 | ✅ flagged for the coordinator |

**Plan for the coordinator (model's words):**

> R3 is a 112 emergency and flagged for immediate professional evacuation — no volunteers sent.
> >
> > Critical shelter and power needs are covered first: R4 gets electrician Sam K. plus generator and a sports-hall bed, and R12 family gets beds via Omar D., with dialysis transport R14 by Luis M. tomorrow.
> >
> > High-need follow-ups are assigned in order: R9 electrical safety to Sam K., insulin pickup R5 to Priya S. with vehicle, structural-risk clearance R1 to engineer Helen W. plus Jake L., and school food R13 to Priya S. with bulk parcels.
> >
> > Remaining mud, drying and low-urgency repairs use local teams and loaned kits, while R8 with a sparking socket is flagged for the coordinator to find another qualified electrician as Sam K. is fully committed to more urgent cases.

## baseten · `meta-models/muse-spark-open-1026`

| Round | Tool | Request | Result |
|---:|---|---|---|
| 1 | `find_volunteers` |  | ✅ V1 (1 left), V2 (2 left), V3 (2 left), V4 (1 left), V5 (1 left), V6 (2 left), V7 (2 left), V8 (2 left), V9 (1 left), V10 (1 left) |
| 1 | `check_supplies` |  | ✅ shovel_kit: 4, water_pump: 1, dehumidifier: 3, generator: 1, tarp: 6, food_parcel: 60, water_crate: 40, camp_bed: 12 |
| 3 | `find_volunteers` |  | ✅ V1 (1 left), V2 (2 left), V3 (2 left), V4 (1 left), V5 (1 left), V6 (2 left), V7 (2 left), V8 (2 left), V9 (1 left), V10 (1 left) |
| 4 | `propose_assignments` | R4 | ✅ accepted · V6 Sam K.: power · available today · V8 Omar D.: shelter · available today · electrical hazard: electrician on the team · 1 × Camp bed at the sports hall (11 left) · 1 × Portable generator (0 left) |
| 4 | `propose_assignments` | R12 | ❌ rejected · food_parcel does not cover shelter |
| 4 | `propose_assignments` | R14 | ✅ accepted · V4 Luis M.: transport · available tomorrow · vehicle on the team |
| 4 | `propose_assignments` | R9 | ✅ accepted · V6 Sam K.: power · available today · electrical hazard: electrician on the team |
| 4 | `propose_assignments` | R5 | ✅ accepted · V3 Priya S.: medication_pickup · available today · vehicle on the team |
| 4 | `propose_assignments` | R1 | ✅ accepted · V10 Jake L.: mud_removal, debris_removal, drying · available today · V7 Helen W.: safety lead (structural engineer) · available today · structural risk: structural engineer on the team · 1 × Shovel and squeegee kit (3 left) · 1 × Dehumidifier (2 left) |
| 4 | `propose_assignments` | R13 | ✅ accepted · V3 Priya S.: water_food · available today · 40 × Food parcel (one household, 2 days) (20 left) · 20 × Drinking water crate (24 × 0.5 l) (20 left) |
| 4 | `propose_assignments` | R6 | ✅ accepted · V2 Tom R.: mud_removal, debris_removal · available today · 1 × Shovel and squeegee kit (2 left) |
| 4 | `propose_assignments` | R7 | ✅ accepted · V2 Tom R.: mud_removal · available today · 1 × Shovel and squeegee kit (1 left) · 1 × Water pump (0 left) |
| 4 | `propose_assignments` | R15 | ✅ accepted · V1 Ana P.: drying · available today · 1 × Dehumidifier (1 left) |
| 4 | `propose_assignments` | R11 | ✅ accepted · V9 Ruth B.: temporary_repair · available tomorrow · 1 × Tarpaulin (5 left) |
| 4 | `propose_assignments` | R10 | ✅ accepted · V5 Grace O.: temporary_repair · available today · 1 × Tarpaulin (4 left) |
| 4 | `flag_for_coordinator` | R3 | ✅ flagged for the coordinator |
| 4 | `flag_for_coordinator` | R8 | ✅ flagged for the coordinator |
| 5 | `propose_assignments` | R12 | ✅ accepted · V8 Omar D.: shelter · available today · 3 × Camp bed at the sports hall (8 left) |

**Plan for the coordinator (model's words):**

> All 14 requests triaged:
> >
> > **Priority actions:** R3 flagged for 112 evacuation only - do not send volunteers. R4 (84yo, 17 Station Road, cold/power off/electrical hazard) gets electrician Sam K. + shelter volunteer Omar D. with generator + camp bed; duplicate R9 at same address covered by same electrician follow-up visit.
> >
> > **Shelter/food:** R12 family with toddler gets 3 camp beds via Omar D. at sports hall (nappies need coordinator sourcing). R13 primary school lunch for ~40 families gets 40 food parcels + 20 water crates via Priya S. (second run).
> >
> > **Medical/transport:** R14 dialysis return lift tomorrow by Park Avenue local Luis M. with vehicle; R5 insulin collection High Street->Orchard Close by Priya S. with vehicle.
> >
> > **Inside property with safety leads:** R1 Mill Lane (1m flood, crack/mold) gets Jake L. + structural engineer Helen W. with shovel kit + dehumidifier. R8 sparking socket at Bridge Row flagged - no electrician capacity left after R4/R9, needs professional follow-up tomorrow before power restore.
> >
> > **Clear-up/low:** Church Street cluster: Tom R. does R6 (9) and R7 (11) with shovel kits + pump. R15 Mill Lane dehumidifier via Ana P. local. R11/R10 shed/fence tarped by Ruth B. (Ash Grove local, tomorrow) and Grace O.
> >
> > All supplies within stock; electrician and structural engineer capacity fully used.
