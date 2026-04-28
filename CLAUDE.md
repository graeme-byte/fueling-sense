# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

---

## Commands

```bash
npm run dev          # start dev server on :3000
npm run build        # prisma generate + next build
npm run lint         # eslint
npx prisma generate  # regenerate client after schema changes (output: app/generated/prisma/)
npx prisma migrate dev --name <name>  # create + apply a migration
npx tsx lib/engine/metabolicModelV06.ts  # run engine self-check
```

There are no unit tests. Type-check with `npx tsc --noEmit`.

---

## Architecture

### Two-tool product

- **Metabolic Profiler** (`/calculator/profiler`) — free, unauthenticated. Takes P20 + P300 + body composition, outputs VLamax, VO2max, MLSS, LT1, CP, training zones.
- **Fueling Calculator** (`/calculator/fueling`) — Pro-gated. Takes MLSS + VLamax + event context, outputs substrate curves, CHO requirements, fueling strategy.

The two tools share state via Zustand (`lib/store/fuelingStore.ts`). When a user clicks "Open Fueling Sense →" on the profiler, `prefillFromInscyd()` writes to the store and `router.push('/calculator/fueling')` navigates there.

### Engine layer (`lib/engine/`)

All computation is pure TypeScript with no React dependencies. **The canonical source of truth for all equations and coefficients is `MODEL_EQUATIONS.md`** — do not change any model constant without verifying it there first.

| File | Status | Role |
|---|---|---|
| `metabolicModelV06.ts` | **Active** | 2PT profiler engine (P20 + P300) |
| `fuelingEngine.ts` | **Active** | Substrate curve + fueling advice |
| `v06Bridge.ts` | **Active** | Maps `MetabolicV06Result` → `INSCYDToFuelingSenseBridge` for the fueling engine |
| `inscydEngine4pt_v05_scientific.ts` | **Frozen** | Legacy 4PT engine — do not modify |
| `inscydEngine.ts` | **Legacy** | Old 3PT engine — do not modify |

**Critical engine rules (enforced in code, documented in `MODEL_EQUATIONS.md`):**
- `cpWatts` is **display-only**. It must never feed back into any calculation.
- Optional validation inputs (`p180`, `p360`, `p720`) must never affect model outputs.
- `LT2 = MLSS` by definition — do not compute a separate LT2.
- Clamp: `LT1 < MLSS`. If raw LT1 ≥ MLSS, clamp to `0.70 × MLSS`.

### API routes (`app/api/`)

| Route | Auth | Writes DB |
|---|---|---|
| `POST /api/inscyd/v06` | None | No |
| `POST /api/fueling` | Supabase session + Pro subscription | Yes (`fueling_results`) |
| `GET /api/fueling?inscydId=` | Supabase session + Pro | No |
| `GET /api/me` | Supabase session | No |
| `POST /api/stripe/*` | Varies | Yes (`subscriptions`) |

All routes validate with Zod before touching the engine. The fueling route additionally checks `prisma.subscription.tier === 'pro'` and `currentPeriodEnd > now`.

### Auth and database access

**Auth pattern:**
- `middleware.ts` uses `supabase.auth.getSession()` (reads from cookie, no network call) for fast redirects on protected paths.
- API routes and Server Actions use `supabase.auth.getUser()` (verified with Supabase server) — never trust the session JWT alone for authorisation decisions.
- Protected prefixes: `/calculator/`, `/account/`, `/billing/`, `/dashboard/`, `/profile/`, `/history/`.

**Database pattern:**
- **Prisma only** for all data reads and writes. The Supabase JS client is used for auth only.
- Prisma connects via `PrismaPg` (PgBouncer URL from `DATABASE_URL`) — this bypasses Supabase Row-Level Security. User-scoping is enforced in application code with `where: { userId: user.id }`.
- Generated client lives in `app/generated/prisma/` (not the default location). Import from `@/app/generated/prisma`.
- Run `npx prisma generate` after any schema change before building.

**Server Actions** (`app/actions/`) use `'use server'` and combine `createClient()` for auth with `prisma` for data.

### Saved profile flow

`saved_profiles` holds one row per user (upserted). It stores both source inputs (power values) for profiler prefill and derived outputs (MLSS, LT1, VLamax) for fueling prefill. The fueling page loads the saved profile on mount and offers a "Load saved profile" prompt if the store has no current prefill.

### State management

Zustand (`lib/store/fuelingStore.ts`, `lib/store/inscydStore.ts`) is the only client-side state layer. The fueling store persists across the profiler → fueling navigation. Both stores are reset explicitly; there is no persistence layer (no localStorage, no sessionStorage).

### Stripe billing

Stripe webhooks (`/api/stripe/webhook`) write to `subscriptions`. The Pro gate in `/api/fueling` reads `subscription.tier` + `currentPeriodEnd` from Prisma — it does not trust the client or the session for tier information.

---

## Key files to read before making changes

| Task | Read first |
|---|---|
| Any engine change | `MODEL_EQUATIONS.md`, then the engine file |
| Fueling result shape | `lib/types/index.ts` + `lib/engine/fuelingEngine.ts` |
| Profiler → fueling bridge | `lib/engine/v06Bridge.ts` |
| Auth / session handling | `middleware.ts`, `lib/supabase/server.ts` |
| Adding a DB column | `prisma/schema.prisma`, then run `prisma generate` + write a migration |
| Pro gating | `app/api/fueling/route.ts` (`checkProAccess`) |
