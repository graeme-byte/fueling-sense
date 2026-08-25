# Free-access migration plan — fueling-sense-app

Status: **assessment only — no application code changed to produce this
document**, in either the original pass or this revision. Written per
`free-tier-migration-prompt.md`, Prompt 1.

## Amendment — 2026-08-20

The user answered all 5 original Open Decisions. Two of the answers change
scope beyond the original prompt and required new research before the plan
could be amended (both researched directly against the code in this
revision, no guessing):

1. **No paid tier survives.** Fully free, permanently — not "keep Stripe
   dormant in case." This resolves every `UNCERTAIN` classification in the
   gate table that hinged on "does something stay paid."
2. **Anonymous access, not just free-after-signup.** The original prompt's
   framing ("access becomes signed in") was the user's own working
   assumption, not a hard constraint — reversed. `/calculator/profiler` and
   `/calculator/running-profiler` must work with no account; the fueling
   calculators follow the same rule (compute anonymous, persistence
   authenticated). **This is new scope** requiring a new phase, a precise
   `middleware.ts` change, per-route auth changes, and a save/signup UX
   proposal — all added below.

Everywhere the original plan reasoned from "the auth gate survives
unchanged," that reasoning is now stale. I've marked each instance inline
rather than silently rewriting it, per the request not to leave stale
conclusions in place. The gate inventory table and all file:line references
from the original pass are retained; classifications are updated where the
new decisions resolve them.

---

## Step 1 — Orient

*(Unchanged from the original assessment — still accurate.)*

- **Framework**: Next.js 16.2.1 (App Router), React 19.2.4, TypeScript, Tailwind 4.
- **Router**: Next.js App Router (`app/`), middleware-based route protection (`middleware.ts`).
- **Auth**: Supabase (`@supabase/ssr`, `@supabase/supabase-js`). Cookie-based sessions; `middleware.ts` uses fast `getSession()`, API routes use verified `getUser()`.
- **Payments**: Stripe (`stripe` SDK server-side). Subscriptions mode, one product ("Pro"), two prices (monthly $19, annual $115).
- **Database/ORM**: Prisma 7 → PostgreSQL via `PrismaPg` adapter (PgBouncer URL). Bypasses Supabase RLS — no RLS policies exist for plan/tier anyway (confirmed: all 4 migration SQL files contain none).
- **Hosting**: Vercel (inferred from `VERCEL_URL` fallback in `app/api/stripe/checkout/route.ts:34`). Not independently confirmed via a deploy config file.
- **Feature flags**: none found.
- **Email**: Resend (outbound support-contact form only). Supabase Auth sends its own signup-confirmation/password-reset emails (dashboard-configured, not in this repo — not checked).
- **Analytics**: Google Analytics (gtag.js, `app/layout.tsx:34-47`), pageview config only — no custom/purchase conversion events anywhere.
- **No test suite** (`CLAUDE.md`: "There are no unit tests"). Nothing to break here.

---

## Step 2 — Gate inventory

Legend — **gate type**: payment-gate / auth-gate / quota-gate / ui-gate. **classification**: DELETE / DOWNGRADE-TO-AUTH / KEEP / MODIFY / UNCERTAIN.

No quota/credit/usage-limit/trial system exists anywhere in the app. No
Supabase RLS references plan state. All gating is application-layer:
middleware (route-level) → API routes (auth + Pro) → client components (Pro
display).

### Data model

| file:line | what it guards | gate type | classification | notes |
|---|---|---|---|---|
| `prisma/schema.prisma:34-49` | `Subscription` model (`tier`, Stripe IDs, `currentPeriodEnd`) | payment-gate | KEEP through wind-down, DELETE after | Needed while the Stripe webhook still runs (Step 4/Phase 6). **Resolved**: no longer conditional on "if a paid tier survives" — it doesn't, so this is a definite eventual delete, just not yet. |
| `lib/types/index.ts:11` | `SubscriptionTier = 'free' \| 'pro'` type, imported by ~10 files | payment-gate (type) | DELETE (last) | Remove only after every consumer is cleaned up (Phase 3). |

### Middleware — **revised by decision 2, see Step 2A below for the full technical scope**

| file:line | what it guards | gate type | classification | notes |
|---|---|---|---|---|
| `middleware.ts:22-29` | `PROTECTED_PREFIXES = ['/calculator/','/account/','/billing/','/dashboard/','/profile/','/history/']` | auth-gate | **MODIFY** — was KEEP | `'/calculator/'` must be removed from this list entirely. The other five prefixes are unaffected (see Step 2A). **This overturns the original plan's "KEEP, no change needed" conclusion**, which assumed access should stay signed-in-only. |
| `middleware.ts:80-84` | Redirects unauthenticated users to `/login` for protected prefixes | auth-gate | KEEP (mechanism), narrower scope | Still fires for the five prefixes that stay protected; no longer fires for `/calculator/*`. |
| `middleware.ts:16` | `/api/stripe/webhook` bypasses auth | auth-gate (exemption) | KEEP through wind-down, DELETE with webhook route | Unchanged. |

**⚠️ Original divergence finding, now resolved rather than just flagged**: `CLAUDE.md:28` claims the Metabolic Profiler is "free, unauthenticated." The original assessment found this was false in the current code (middleware protects all of `/calculator/`). Decision 2 makes the doc's claim *true again* going forward — once Phase "Anonymous access" ships, `CLAUDE.md` will finally match reality. Still needs the doc fix (Phase 7).

### Server-side payment gates (unchanged by decision 2 — these were already going away under decision 1)

| file:line | what it guards | gate type | classification | notes |
|---|---|---|---|---|
| `app/api/fueling/route.ts:45-51` | `checkProAccess()` | payment-gate | DELETE | — |
| `app/api/fueling/route.ts:62-69` | `POST` 403 `UPGRADE_REQUIRED` | payment-gate | DELETE | See Step 2A for how the *auth* check on this same handler also changes. |
| `app/api/fueling/route.ts:189-192` | `GET` 403 `UPGRADE_REQUIRED` | payment-gate | DELETE | — |
| `app/api/running-fueling/route.ts:49-55` | Duplicate `checkProAccess()` | payment-gate | DELETE | — |
| `app/api/running-fueling/route.ts:66-73` | `403 UPGRADE_REQUIRED` | payment-gate | DELETE | — |
| `app/api/inscyd/route.ts:83-89,148-151` | Auth (not Pro) required only to save/fetch | auth-gate | KEEP | Already the correct free/anonymous-compute pattern — see Step 2A, it's the template. |

### Client-side gates that assume a 403 will happen

| file:line | what it guards | gate type | classification | notes |
|---|---|---|---|---|
| `app/calculator/fueling/FuelingPage.tsx:127-134` | Hard-redirect to `/pricing` on 403 | payment-gate | DELETE | — |
| `app/calculator/fueling/FuelingPage.tsx:123` | `body: JSON.stringify({ ...inputs, save: true })` — **hardcoded**, always attempts to save | payment-gate (adjacent) | **MODIFY** — new finding | Not in the original inventory. Must become conditional on login state (Step 2A) or anonymous users get a spurious failure on every calculation once the page is reachable without an account. |
| `app/calculator/fueling/FuelingPage.tsx:164` | Header badge hardcoded `PRO` | ui-gate | DELETE / restyle | — |
| `app/calculator/running-fueling/RunningFuelingPage.tsx:125-150` | Auto-calculate effect gated on `isPro` | payment-gate | **MODIFY** — was DELETE | Original plan said just delete the gate. More precisely: the effect's *trigger condition* (`if (!isPro || !pendingRef.current) return;`, line 127) must change to fire on `pendingRef.current` alone — this route has no persistence at all (confirmed: no `save` field in its Zod schema, no DB write in the handler), so once the Pro check is gone there is nothing left to condition the auto-calculate on. |
| `app/calculator/running-fueling/RunningFuelingPage.tsx:164-166,216-225,309-318` | Inline error / banner / link on 403 or `!isPro` | ui-gate | DELETE | — |

### Client-side entitlement source

| file:line | what it guards | gate type | classification | notes |
|---|---|---|---|---|
| `app/api/me/route.ts:22-34` | Returns `{ tier: 'pro' \| 'free' }` | payment-gate | **DOWNGRADE-TO-AUTH → DELETE after wind-down** | Was UNCERTAIN, hinging on "does a tier survive." Resolved: no tier concept survives. Keep the endpoint returning real tier data only through Phase 5/6 (the Support billing section still reads it); simplify to `{ authenticated }` once wind-down closes. |
| `app/api/billing/route.ts` | Subscription status for Support page | payment-gate | KEEP through wind-down, DELETE after | Same resolution as above, now definite rather than conditional. |

### UI-only per-metric locks (data already sent to the client unfiltered)

Unchanged from the original assessment — all still DELETE. Full list, file:line references retained:

| file:line | what it guards |
|---|---|
| `components/inscyd/InscydResults.tsx:66,106-127,143-159,169-185,214-221,226-329,349,352-378` | LT1/LT2 cards, PDF export button, reference lines, zones panel, fueling-snapshot teaser, bottom CTA |
| `components/inscyd/ProfilerResultsV06.tsx:173,191,272,313,344,374-375,415,444,458,462,571,610` | Same pattern, current production profiler view |
| `components/inscyd/PerformanceProfile.tsx:89,107-117,206-300` | Skips classification computation for free users, locked placeholder tiles |
| `components/running/RunningProfilerResults.tsx:42-50,285-299,330-339,352-367,380-459,462-488` | Running-profiler mirror |
| `components/inscyd/FuelingSnapshot.tsx:54-89` | Blurred "locked" strategy preview |
| `components/inscyd/ProfilerPrintView.tsx:69-70,158-178,184` | PDF export: locked rows, omitted zones table |
| `lib/pdf/exportProfile.ts:29,69-103,177` | Cycling PDF export |
| `lib/pdf/exportRunningProfile.ts:88,145-146,349` | Running PDF export |
| `components/GettingStartedPanel.tsx:9,66,77` | Cosmetic-only welcome copy |

All DELETE, all unaffected by decision 2 (these were never auth-gated, just Pro-gated).

### Marketing / upsell surface — resolved by decisions 1 and 4

| file:line | what it guards | gate type | classification | notes |
|---|---|---|---|---|
| `app/pricing/page.tsx` (whole file) | 3-column pricing table, Stripe Checkout entry point | ui-gate | **REPURPOSE** — was UNCERTAIN | Decision 4: becomes "How it works" content at the same route, not a redirect or 404. See Step 3. |
| `app/page.tsx:86-192` | Landing page's "Free / Pro / Fueling" 3-step section | ui-gate | REWRITE | See Step 3, copy revised for "no account needed," not just "free." |
| `app/login/page.tsx:212-215` | `pro_required` copy | ui-gate | DELETE | Dead once no 403 ever redirects here with that reason. |
| `app/support/page.tsx:136,145-196` | Billing section, shown only to `tier === 'pro'` | payment-gate/ui-gate | KEEP through wind-down, DELETE after | Was UNCERTAIN, now definite (same reasoning as `/api/billing`). |
| `app/terms/page.tsx:29-30` | "Subscription fees are billed in advance and are non-refundable..." | — (legal copy) | UNCERTAIN — still open | Needs a rewrite once there's no subscription to bill; whoever owns Terms/Privacy should handle this, not a code change either way. |

### Stripe plumbing

| file:line | what it guards | gate type | classification |
|---|---|---|---|
| `app/api/stripe/checkout/route.ts` | Creates a Checkout session | payment-gate | DELETE once `/pricing`'s Upgrade button is gone (Phase 4) |
| `app/api/stripe/portal/route.ts` | Billing Portal session | payment-gate | KEEP through wind-down, DELETE after |
| `app/api/stripe/webhook/route.ts` | Syncs `Subscription.tier` from Stripe | payment-gate (writer) | KEEP through wind-down, DELETE after |

---

## Step 2A — Anonymous access: technical scope (new — decision 2)

This is the part of the amendment that needed real research, not just a
policy call. Three questions, answered precisely against the code:

### 1. `middleware.ts` — exact change

Remove `'/calculator/'` from `PROTECTED_PREFIXES` (`middleware.ts:22-29`).
Nothing needs to move to `PUBLIC_EXACT` — `isProtected()` returning `false`
for a path that also isn't in `PUBLIC_EXACT` already falls through to "pass
through" at `middleware.ts:43-45` ("Unknown routes... pass through"). So the
change is a one-line removal, not a restructure.

**The other five prefixes are unaffected and should stay**: `/account/`,
`/billing/`, `/dashboard/`, `/profile/`, `/history/`. Confirmed (both in the
original assessment and re-checked here): none of these have an actual page
route under `app/` — `app/dashboard/` is an empty directory, and
`app/account/`, `app/billing/`, `app/profile/`, `app/history/` don't exist at
all. They're dead config today regardless of what the middleware list says.
Recommendation: leave them in place as harmless placeholders for whatever a
future "my account" page turns out to be, rather than removing them now and
having to remember to re-add protection later. Zero behavioral effect either
way today.

### 2. API route auth checks — precise, per route

| Route | Today | After this phase |
|---|---|---|
| `POST /api/inscyd/v06` | No auth, no persistence | **Unchanged.** Already the target pattern. |
| `POST /api/running-profiler` | No auth, no persistence | **Unchanged.** Already the target pattern. |
| `POST /api/inscyd` (legacy) | Compute anonymous; auth required only when `save: true` (`:83-89`) | **Unchanged.** Already the target pattern — this route is the template the others should match. |
| `GET /api/inscyd?id=` | Auth required (reads a user-owned row) | **Unchanged.** Inherently authenticated — fetching someone's own saved record isn't a "pure computation" case. |
| `POST /api/fueling` | Auth required unconditionally (`:56-60`), before the Pro check, before input validation | **MODIFY**: auth becomes conditional on the parsed `save` flag. Concretely — parse and validate the body first (Zod already does this at `:71-83`, just needs to move ahead of the auth check), then only call `getUser()` / require a session if `save === true`. `save` already defaults to `true` in the schema (`:42`) — see the client-side note below, that default needs to flip client-side or every anonymous POST will implicitly ask for a save it can't do. |
| `GET /api/fueling?inscydId=` | Auth + Pro required (reads a user-owned `InscydResult`) | **Pro check deleted, auth check stays.** Inherently authenticated. **New finding, not in the original inventory**: I grepped for callers and found none — no client code calls this endpoint (`FuelingPage.tsx` only calls `POST /api/fueling`; the profiler → fueling handoff goes through the Zustand store's `prefillFromInscyd()`, not this API). It may be dead code from an earlier flow. Not blocking this migration either way — flagging so it doesn't get mistaken for a load-bearing anonymous-access gap. Worth a separate cleanup ticket, not in scope here. |
| `POST /api/running-fueling` | Auth + Pro required unconditionally (`:57-64`) | **DELETE the auth check entirely, not just the Pro check.** Confirmed: this route has no `save` field in its Zod schema and performs no Prisma read or write anywhere in the handler — it touches zero stored user data. It should match `/api/running-profiler`'s pattern exactly: fully anonymous, no auth call at all. |

### 3. Non-null `user`/`session` assumption sweep

Grepped every `getUser()` and `getSession()` call in the app (14 call sites)
rather than reasoning about it, per the request. **Result: no crash risk
found.** Every call site already handles the null/no-session case explicitly:

- All four calculator pages (`profiler/page.tsx:53`,
  `running-profiler/page.tsx:48`, `FuelingPage.tsx:49`,
  `RunningFuelingPage.tsx:88`) store the result as a boolean
  (`isLoggedIn`/`!!session`) and gate every save-related UI element on it —
  none of them assume a session exists.
- The four `app/actions/profile.ts` server actions
  (`saveProfileAction`, `getSavedProfileAction`, `hasSavedProfileAction`,
  `saveRunningProfileAction`/`getSavedRunningProfileAction`) all check
  `if (!user) return null` / `return { ok: false, ... }` before touching
  Prisma — calling them while logged out already returns a clean empty
  result today, no code change needed there.
- `app/page.tsx:8` (landing page) already renders conditionally on `user`
  being null.
- No `app/calculator/layout.tsx` or any other shared layout exists that
  might assume a session for the whole section.

The codebase was evidently built defensively for a "maybe logged in" state
even while middleware forced a session — that groundwork makes this phase
smaller than it could have been. The two real changes needed are:

1. `middleware.ts` — remove `'/calculator/'` (above).
2. `FuelingPage.tsx:123` — change the hardcoded `save: true` to
   `save: isLoggedIn` (the `isLoggedIn` state already exists on this page,
   set at `:50`). Without this, every anonymous calculation attempt sends
   `save: true`, and once the route's auth check becomes conditional on
   `save` (point 2 above), that would force a 401 on a plain calculation for
   every logged-out user — the opposite of the intent.

No equivalent fix is needed on `RunningFuelingPage.tsx` since its POST
already omits `save` entirely (the route never persists).

---

## Step 2B — The save-and-signup UX problem (new)

Two questions, neither addressed before this revision:

**What does "Save" do for a logged-out user?**

Today the entire save affordance (`profiler/page.tsx:250-335`,
`running-profiler/page.tsx:175-256`, both the top panel and the bottom
mirror button) is wrapped in `isLoggedIn && ...` — it simply doesn't render
for a logged-out user. Under anonymous access that's the wrong behavior: a
logged-out user who just ran a test has every reason to want to save it and
no way to know that's possible. Proposal: replace the hidden block with a
visible, lower-key prompt in the same location — "Create a free account to
save this profile →" — linking to `/login?mode=signup&redirect=/calculator/profiler`.
Same visual slot, different call to action; this is a UI decision for
implementation to render, not something requiring further sign-off here.

**Does an in-progress result survive the signup → email-confirmation →
callback round trip, or does the user lose it?**

This is the sharper problem. Today's signup flow
(`app/login/page.tsx:55-61`, `app/auth/callback/route.ts:18-37`) is a full
navigation away from the page and back, potentially on a different device
(user opens the confirmation email on their phone) — any in-memory React
state (`profile`, `fuelingPrefill`, etc.) is gone by the time the callback
redirect lands. Losing a just-computed result at exactly the moment the user
tried to keep it would be worse than today's behavior, where the save button
simply doesn't exist for them.

**Proposed mechanism — `sessionStorage`/`localStorage`, same-device only:**
Before navigating to `/login`, write the current result (the same payload
shape `saveProfileAction`/`saveRunningProfileAction` already expect) to
`localStorage` under a fixed key. On mount, the profiler pages already check
for saved-profile data (`getSavedProfileAction`) — extend that check to also
look for a pending local result; if found and the user is now logged in,
auto-fire the save action and clear the key. This needs no schema change and
no new backend surface — it's a client-only addition to logic that already
exists on these pages.

**Tradeoff, stated plainly**: this only works if the confirmation link is
opened in the same browser the calculation happened in. A user who computes
on desktop and confirms via a phone's mail app loses the auto-restore (falls
back to today's "just re-enter it" experience, not worse than that). This is
a real but bounded gap — most signup flows have some version of this problem
and Supabase doesn't offer a first-party "pending payload" primitive to
attach to a magic-link/confirmation flow.

**Heavier alternative, not recommended as a starting point**: a
server-persisted pending record keyed to an anonymous session id (new cookie
+ new nullable-`userId` table or column), attached and claimed on first
login regardless of device. This closes the cross-device gap completely but
is materially more engineering — a new schema surface, a new auth-adjacent
concept (anonymous session identity), and a claim/expiry lifecycle to design.
Worth revisiting only if post-launch data shows meaningful abandonment at the
signup step specifically (something to instrument, not assume).

**Recommendation**: ship the `localStorage` version with Phase "Anonymous
access." It's the only piece of this phase with real design latitude — flag
if the same-device limitation isn't acceptable, otherwise treat this as the
default.

---

## Step 3 — The landing page (revised)

Section order and CTA inventory are unchanged from the original assessment
(see the file:line citations there — `app/page.tsx:14-270`, full CTA table
retained). What changes is the *pitch*, per decision 2: the stronger claim is
no longer "free" (a price comparison) but "no account needed" (an effort
comparison) — that should be visible above the fold, not buried in a feature
list.

**Revised proposed section order:**

1. **Header** — CTA copy simplifies to "Start Now" (no login required to
   reach it).
2. **Hero** — keep the video + physiology pitch. New CTA copy should lead
   with the no-account claim directly: *"Test your metabolism in 5 minutes
   — no account needed."* This is a stronger, more specific promise than
   "free," and it's now literally true the moment Phase "Anonymous access"
   ships.
3. **"How it works"** (replaces the 3-tier journey) — same 3-step visual
   language (test → understand → fuel), all three steps fully unlocked, no
   "Pro" badge, no "Upgrade" CTA anywhere. The middle step's copy can now
   say "see your LT1 and LT2 immediately" rather than gesturing at an
   upgrade.
4. **"Why it matters"** — unchanged, already conviction-building.
5. **"Race day"** — unchanged.
6. **Trust footer** — unchanged, optionally add "always free" if that's the
   long-term positioning you want (decision 1 makes this durably true, not
   just true for now).

Draft CTA copy: *"Test your metabolism free — no account needed →"* /
*"See your numbers in 5 minutes →"* / *"Start now, no signup"*.

**`/pricing` → "How it works" (decision 4, not a redirect or 404)**: same
route, new content — the three-step test → understand → fuel explanation,
written deep enough to be worth a direct landing from search (the route
likely has existing inbound links/SEO equity worth preserving, per the
original Step 4 analytics note). The landing page's "How it works" section
(point 3 above) links here for readers who want more detail than the
summary card gives.

**⚠️ Stale conclusion, now resolved rather than a recommendation**: the
original plan's Step 3 found a 4-step friction chain (redirect-to-login →
signup → email round-trip → callback) between landing and first real use,
and flagged it as "worth a separate look... not included in the phases
above." **Decision 2 supersedes that** — this friction is now eliminated for
computation entirely, not deferred. It only resurfaces at the "Save" moment
(Step 2B above), where it's a much smaller problem: the user already has
their result in hand and is opting into an account, rather than being
blocked from using the tool at all.

---

## Step 4 — Consequences (revised)

### Existing paying customers — unchanged from the original plan

Decision 3 confirms: let existing subscriptions lapse naturally at
`currentPeriodEnd`, no refund logic in code, courtesy email handled by hand.
I still have not queried Stripe or the production database for a live
subscriber count — pull that from the Stripe Dashboard before sending the
courtesy email. This section otherwise stands as originally written.

### Billing surface — now definite, not conditional

Same table as the original plan; every row that was "depends on whether a
paid tier survives" is now definite, since decision 1 answers that
question. See the updated gate table above (Step 2) for the resolved
classifications — no new surfaces introduced.

### Cost and abuse — **new consideration from decision 2, not in the original plan**

The original plan concluded cost/abuse risk was low because "the only real
abuse-control question... doesn't change with this migration since the
auth-gate stays." **That's no longer true — decision 2 removes the auth
gate for computation entirely.** Restating the analysis with that premise
gone:

- Compute cost is still trivial — confirmed again in this revision, the
  calculation routes are pure TypeScript math with no external paid API
  calls (`lib/engine/*`), so there's no metered-API bill risk from
  anonymous traffic.
- The real change is that `/api/inscyd/v06`, `/api/running-profiler`,
  `/api/fueling` (compute path), and `/api/running-fueling` become fully
  open, unauthenticated endpoints with **zero rate limiting of any kind**
  (confirmed in the original assessment: no quota/rate-limit system exists
  anywhere in this app). Previously, email-confirmed signup was at least a
  weak implicit throttle before anyone could hit these routes repeatedly.
  After this migration, that throttle is gone entirely for the compute
  paths.
- Realistic exposure: Vercel function-invocation volume/cost from scripted
  or abusive traffic, and DB load from `POST /api/inscyd` (`save: true`)
  writes specifically if that path is ever hit anonymously at volume — though
  by design, anonymous requests to `/api/inscyd`/`/api/fueling` shouldn't set
  `save: true` at all (Step 2A), so that specific risk is self-limiting if
  the client-side fix in Step 2A/2B is implemented correctly.
- **Not blocking this migration** — the current traffic profile of a niche
  fitness tool makes this a low-probability risk, not an urgent one. But it
  wasn't a question at all under the old "signed-in access" framing, and it
  is one now. Flagging as a genuinely new open item (see "Still open"
  below), not a required Phase.

### Analytics and SEO — unchanged from the original plan

No purchase/conversion events exist to remove. No sitemap/robots files
exist. The `/pricing` → "How it works" repurpose (rather than the
redirect-or-delete framing the original plan left open) is the strongest
version of "preserve inbound-link equity" already discussed there.

### Tests — unchanged

None exist. Nothing to update. `tsc --noEmit` and `npm run lint` remain the
only correctness gates, and now matter slightly more than before — Phase
"Anonymous access" changes control flow (conditional auth checks) in a way
Phase 1-3's prop deletions didn't, so it's worth exercising the anonymous
path manually (incognito window, no session) before shipping, not just
relying on the type checker.

---

## Step 5 — Sequencing (revised)

Same hard requirement as the original plan, now covering more ground: **the
site must never be half-gated.** A landing page that says "no account
needed" while `middleware.ts` still bounces `/calculator/*` to `/login` is
exactly the failure mode already ruled out — if anything a worse one than
the original "free but still paywalled" case, since it's a more specific,
more falsifiable promise.

| Phase | Scope | Must ship with | Effort | Status |
|---|---|---|---|---|
| **0. Decisions** | Done — this revision. | — | S | ✅ Done |
| **1. Server unblock (payment)** | Delete `checkProAccess` + 403 blocks in `app/api/fueling/route.ts` and `app/api/running-fueling/route.ts`. | Same deploy as 1A, 2, 3, 4 | S | ✅ Done |
| **1A. Anonymous access (new)** | `middleware.ts` — remove `'/calculator/'` from `PROTECTED_PREFIXES`. `POST /api/fueling` — reorder so auth is checked only when `save === true`, after Zod validation. `POST /api/running-fueling` — delete the auth check entirely (matches `/api/running-profiler`). `FuelingPage.tsx:123` — `save: true` → `save: isLoggedIn`. `RunningFuelingPage.tsx:127` — auto-calculate trigger no longer conditioned on `isPro`. | Same deploy as 1, 2, 3, 4 — this is the phase most likely to be forgotten and cause a half-gated ship if split out | M | ✅ Done |
| **2. Client redirect/blocking cleanup (payment)** | Remove 403-driven redirect/error logic in `FuelingPage.tsx` and `RunningFuelingPage.tsx`. | Same deploy as 1, 1A, 3, 4 | S | ✅ Done |
| **3. UI unlock** | Remove `tier`/`isPro` conditionals across the reachable result/PDF-export components. Run `tsc --noEmit`. | Same deploy as 1, 1A, 2, 4 | M | ✅ Done — see note below on scope |
| **4. Landing + pricing rewrite** | New `app/page.tsx` section per Step 3. `/pricing` repurposed as "How it works" (not deleted/redirected). Remove `pro_required` copy on `/login`. | Same deploy as 1, 1A, 2, 3 — cannot ship before them (would advertise "no account needed" while gates still block) | M | ✅ Done |
| **5. Save-and-signup UX** | `localStorage` pending-result mechanism (Step 2B) so a logged-out user doesn't lose an in-progress result when signing up to save it. | Shipped in the same deploy as 1-4 rather than trailing — see note below | M | ✅ Done |
| **6. Billing wind-down (deferred, human-initiated)** | Stop new checkouts (part of Phase 4). Existing subscriptions lapse naturally per decision 3. Courtesy email by hand. Keep `/api/stripe/portal`, `/api/stripe/webhook`, `/support`'s Billing section, `/api/me`, `/api/billing` alive until this closes. | Independent — trails Phases 1-5 by however long the longest remaining subscription period is | S (not agent work) | ⏳ Not started (human-initiated) |
| **7. Stripe/DB decommission** | Once Phase 6 closes: delete `/api/stripe/*`, Support's Billing section, `/api/billing`; simplify or delete `/api/me`'s tier logic; eventually drop `Subscription` model + `SubscriptionTier` type in a follow-up migration. | Independent, after Phase 6 | S | ⏳ Not started |
| **8. Docs** | Fix `CLAUDE.md:28` — the "free, unauthenticated" claim becomes true again once Phase 1A ships; update it to say so accurately rather than aspirationally. | Any time, ideally with Phase 1-5 | S | ⏳ Not started — `CLAUDE.md:28` still needs the fix |

**Irreversible items**: unchanged from the original plan — cancelling live
Stripe subscriptions (not happening under decision 3, but any manual
cancellation still would be) and dropping the `Subscription` table (Phase 7)
are the two irreversible actions, both still flagged as human-only / take a
DB export first.

### What changed during implementation (Phases 1A–5)

- **Phase 5 shipped in the same deploy as 1–4, not trailing.** The user
  reframed it mid-implementation: removing the auth wall removed the only
  mechanism that created accounts at all, so shipping without a save/signup
  path would leave the site with no path to an account for anyone. The
  original plan's "can trail by one deploy" framing no longer applied once
  that was pointed out — Deploy 1 and Deploy 2 (Task 1 dead-code cleanup +
  Task 2 Phase 5) are shipping together as one release for this reason.
- **Phase 3's scope shrank on inspection.** `components/inscyd/InscydResults.tsx`,
  `components/inscyd/PerformanceProfile.tsx`, and `lib/pdf/exportProfile.ts`
  were verified dead code — zero importers anywhere (literal grep, dynamic
  `import()` scan, barrel-file scan, and the `/calculator/inscyd` route,
  which turned out to be a plain redirect to `/calculator/profiler`, not a
  renderer). They've been **deleted**, not left in place — dead code
  containing paywall UI in a codebase with no paywall is exactly the kind of
  thing the next person greps for "Pro" and has to re-derive. `tsc --noEmit`
  confirmed clean after deletion.
- **Two real bugs found and fixed while wiring Phase 5's restore logic**,
  neither anticipated by the plan:
  1. `FuelingPage.tsx` and `RunningFuelingPage.tsx`'s mount effects both had
     an `if (!sp) return;` early exit (no saved profile → stop). A freshly
     signed-up user has no saved profile yet, so the pending-result restore
     check had to be placed *before* that guard, not after — otherwise Phase
     5 would silently never fire for exactly the users it exists for.
  2. Supabase's `emailRedirectTo` for signup didn't carry the originating
     page through the confirmation link — it always pointed at
     `/auth/callback` with no `next` param, so confirming email would land
     everyone on `/calculator/profiler` by default regardless of which
     calculator they signed up from. Fixed by threading the existing
     `redirect` query param into `emailRedirectTo` (`/login/page.tsx`) — the
     callback route (`/auth/callback/route.ts`) already supported a `next`
     param, it just wasn't being sent for signup specifically.
- **`/login` gained a `?mode=signup` param**, not in the original plan, to
  land a visitor straight in the signup form when they arrive via a "Create
  free account" click — skipping an extra toggle click for someone who's
  already declared intent.
- **48-hour expiry window chosen for pending results** (Step 2B left this as
  "pick a window, justify it"): long enough to survive a delayed inbox check
  (end of day, over a weekend), short enough that a months-old test can't
  silently overwrite a profile someone is actively testing today.

---

## Resolved decisions (2026-08-20)

All 5 originally-open decisions are now answered:

1. **Paid tier?** No — fully free, permanently. Gate table updated
   throughout (Step 2).
2. **Signup wall for the profilers?** Removed — anonymous compute, auth only
   for save/retrieve. New Phase 1A + Step 2A/2B cover the technical scope.
   `GET /api/fueling` stays authenticated by necessity (it reads a
   user-owned record) — flagged, not guessed, and also flagged as
   apparently-dead/uncalled code worth a separate look.
3. **Existing subscribers?** Let lapse naturally at `currentPeriodEnd`, no
   refund logic in code, courtesy email by hand. Unchanged from the original
   plan.
4. **`/pricing` fate?** Repurposed as "How it works" at the same route —
   not a redirect, not a 404.
5. **Signup friction?** Superseded rather than answered as originally posed
   — decision 2 removes the friction for computation entirely rather than
   leaving it as a follow-up.

## Still open

- **Rate limiting for now-anonymous compute endpoints** (Step 4, Cost and
  abuse) — new consideration introduced by decision 2, not present in the
  original plan. Low urgency given current traffic, but a real gap that
  didn't exist under "signed-in access." Your call whether to address before
  or shortly after launch.
- **`app/terms/page.tsx:29-30`** subscription/refund language — needs a
  rewrite once billing winds down; whoever owns Terms/Privacy content should
  handle the copy, not code.
- **`CLAUDE.md:28`** still claims the profiler is "free, unauthenticated" —
  true again as of Phase 1A, but the doc itself hasn't been updated yet
  (Phase 8).
- **Phase 6/7 (billing wind-down, Stripe/DB decommission)** — unstarted,
  human-initiated per decision 3. Pull the active-subscriber count from the
  Stripe Dashboard when ready to begin.

Resolved during implementation, no longer open: `localStorage` vs.
server-persisted pending record for the save-and-signup flow — implemented as
`localStorage` per the plan's recommendation, with the 48-hour expiry and
try/catch degradation specified in Step 2B.
