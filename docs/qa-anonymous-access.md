# Manual QA — anonymous access (Phases 1A, 1, 2, 3, 4, 5)

Run in an **incognito/private window** against the preview deploy, unless a
step says otherwise. This is written from the promise the landing page makes
— every path a logged-out stranger can take, plus the logged-in paths that
must not regress — not from the diff. Each step has an explicit expected
result. If any step's actual result differs, stop and note the exact URL,
what you clicked, and what appeared.

---

## Part A — Logged-out: cycling profiler

**A1. Landing → cycling profiler**
1. Open the site fresh (incognito). Land on `/`.
2. Click the cycling profiler CTA (hero or "How it works" section).
3. **Expected**: you land directly on `/calculator/profiler`. No redirect to
   `/login`, no interruption.

**A2. Run a cycling test, logged out**
1. On `/calculator/profiler`, fill in the test form (P20, P300, weight, body
   fat) with any valid values.
2. Click Calculate.
3. **Expected**: a full result appears — including **LT1, LT2, training
   zones, phenotype, VO2max, VLamax**. Nothing reads "Pro," nothing is
   blurred, no locked-card placeholders ("––" with a "Pro · ..." hint), no
   "Unlock with Pro" or "See Pro plans" link anywhere on the page.

**A3. PDF export, cycling, logged out**
1. From the result in A2, click "Export PDF" (or "↓ Export PDF").
2. **Expected**: a PDF downloads. Open it — LT1 and LT2 show real numbers
   (not "—" or "Pro only"), and the Training Zones table is present with
   real zone rows (not omitted).

**A4. Save-account offer, cycling, logged out**
1. Still on the A2 result, look just below the metric cards (LT1/LT2/VO2max
   row) — not the footer.
2. **Expected**: a violet "Save this profile" card is visible, with body copy
   explaining what an account gets you (reload without retesting, prefills
   fueling) and a "Create free account →" button. It should NOT be a modal,
   should not block anything else on the page, and no other prompt should
   have appeared before it (no earlier nag, no popup).
3. Click "Create free account →". **Expected**: navigates to `/login` with
   the signup form already selected (not the sign-in form) — you should not
   have to click a second "Sign up" toggle.

**Continue to Part G (G1) for what happens after you actually complete
signup** — A4 only covers reaching the signup form.

## Part B — Logged-out: running profiler

**B1. Landing → running profiler**
1. From `/`, click the running profiler CTA.
2. **Expected**: lands directly on `/calculator/running-profiler`, no
   redirect to `/login`.

**B2. Run a running test, logged out**
1. Fill in the test form (sprint distance, 3-min distance, 6-min distance,
   mass, body fat).
2. Click Calculate.
3. **Expected**: full result including **LT1 Pace, LT2 Pace, training
   zones**, athlete type. No "Pro," no blur, no locked cards, no
   `/pricing` upsell link visible.

**B3. PDF export, running, logged out**
1. Click "Export PDF" on the running result.
2. **Expected**: PDF downloads with real LT1/LT2 pace values (not "––") and
   a populated Training Zones table.

**B4. Save-account offer, running, logged out**
Same expectation as A4, on the running profiler page (same placement, same
copy pattern, same signup-mode navigation). See Part G for the restore check.

## Part C — Logged-out: fueling calculators

**C1. Cycling fueling calculator, logged out, direct visit**
1. In a fresh incognito tab, go directly to `/calculator/fueling` (don't
   navigate via the profiler).
2. **Expected**: page loads, no redirect to `/login`.
3. Fill in the manual form (weight, body fat, MLSS, target watts, target
   CHO, etc.) and click Calculate.
4. **Expected**: a full fueling result appears (substrate curves, CHO
   requirement, strategy). No 403, no error, no redirect to `/pricing`.

**C2. Running fueling calculator, logged out, direct visit**
1. Go directly to `/calculator/running-fueling`.
2. **Expected**: page loads, no redirect.
3. Fill in the manual form and click Calculate.
4. **Expected**: a full running fueling result appears. No 403, no
   "Pro subscription required" error, no redirect.

**C3. Profiler → fueling handoff, logged out (cycling)**
1. From a completed cycling profiler result (A2), click "Open Cycling
   Fueling" / "Open Fueling Sense".
2. **Expected**: lands on `/calculator/fueling` with the form prefilled from
   the profiler result (MLSS, LT1, etc. carried over). No login prompt in
   between.

**C4. Profiler → fueling handoff, logged out (running) — the auto-calculate path**
1. From a completed running profiler result (B2), click "Open Running
   Fueling".
2. **Expected**: lands on `/calculator/running-fueling`, and the calculation
   **auto-runs** using the carried-over values — you should see a result
   appear without manually clicking Calculate again. This is the specific
   path that used to wait on a Pro check before firing; confirm it now
   fires for a logged-out visitor.

**C5. Save-account offer, cycling fueling, logged out**
1. On the C1 result, look just below the key metrics row (FATmax/CARB90/
   Total EE/CHO@Target) — above the substrate curve chart.
2. **Expected**: a "Save this fueling plan" card, same visual style as A4,
   explaining that an account keeps the calculation on file. "Create free
   account →" navigates to `/login` in signup mode with `redirect` pointing
   back at `/calculator/fueling`.

**C6. Save-account offer, running fueling, logged out**
Same expectation as C5, on the running fueling results, positioned below its
key metrics row.

## Part D — Sweep for any surviving Pro-gated surface

Visit, logged out, in this order: `/`, `/pricing`, `/calculator/profiler`
(with a result showing), `/calculator/running-profiler` (with a result
showing), `/calculator/fueling` (with a result showing),
`/calculator/running-fueling` (with a result showing), `/login`.

**D1.** On every page above, confirm there is **no**:
- Lock icon or padlock graphic
- Blurred content
- "Pro only" / "–– " placeholder value
- "Upgrade to Pro" / "Unlock with Pro" / "See Pro plans" copy
- A link pointing at `/pricing` framed as an *upgrade* (a plain "How it
  works" link to `/pricing` is fine and expected — see Part F)
- "PRO" / "FREE" / "PRO ONLY" badge in any page header

**D2.** On `/login`, confirm there is no "Sign in to access the Pro Fueling
Calculator" (or similar Pro-specific) message under the sign-in/create
account heading.

## Part E — Logged-in regression

Use a real test account for this part (not incognito, or a separate
authenticated session).

**E1. Existing free account — cycling**
1. Log in with an account that has no Pro subscription.
2. Run a cycling profiler test. **Expected**: full result, same as the
   logged-out case (LT1/LT2/zones visible).
3. Click "Save to profile". **Expected**: saves successfully, "✓ Saved to
   profile" confirmation appears.
4. Reload the page. **Expected**: "Saved profile available" prompt appears,
   "Load saved profile" restores your data.

**E2. Existing free account — running**
Repeat E1 for `/calculator/running-profiler` and the running save flow.

**E3. Existing free account — fueling calculators**
1. From a saved/loaded cycling profile, open the cycling Fueling Calculator.
2. Run a calculation. **Expected**: full result, saved automatically (check
   this doesn't error — logged-in calculations should still persist to
   `fueling_results`).
3. Repeat for the running Fueling Calculator.

**E4. Account with an active Pro subscription**
1. Log in with an account that has `tier: 'pro'` in its subscription row.
2. Visit `/calculator/profiler`, `/calculator/running-profiler`,
   `/calculator/fueling`, `/calculator/running-fueling`.
3. **Expected**: everything works exactly as the free-account case (E1–E3)
   — same UI, same unlocked content, since there's no longer a visible
   distinction to break. Specifically confirm:
   - No leftover "PRO" badge that now looks orphaned or inconsistent.
   - No now-broken "upgraded" banner or polling state if you arrive via a
     stale `?upgraded=1` URL (this flow's UI was removed — the query param
     should simply be ignored, not error).
   - `/support`'s Billing section still shows this account's subscription
     status correctly (this was intentionally left unchanged).

## Part F — `/pricing` and landing page content

**F1.** Visit `/pricing` directly. **Expected**: HTTP 200 (not a redirect,
not a 404). Content is a "how it works" explanation (test → understand →
fuel), not a plan-comparison table. No monthly/annual toggle, no "$0/$19/
$115" pricing, no "Upgrade to Pro" button, no Stripe Checkout network call
when the page loads or when any button on it is clicked.

**F2.** Visit `/`. **Expected**: hero copy leads with a no-account-needed
claim (not "free" framed as a price). The "how it works" section shows all
three steps as available now, with no "Pro" badge or lock language on the
middle/third card.

## Part G — Restore after signup (Phase 5)

This is the funnel itself — the only way a logged-out visitor becomes an
account holder now that nothing forces signup. Test the mechanism once in
full on the cycling profiler (G1–G4), then spot-check the other three
calculators against the same steps using the table in G5.

**G1. Happy path — same-device restore**
1. Incognito. Go to `/calculator/profiler`, run a test, get a result (as in
   A2).
2. Click "Create free account →" on the save-account prompt.
3. On `/login`, confirm the signup form is pre-selected. Enter a real test
   email and a password, submit.
4. **Expected**: "Check your email" screen.
5. Open the confirmation email (same browser/device) and click the link.
6. **Expected**: you land back on `/calculator/profiler` (not the generic
   default) — the `redirect` param round-tripped through the confirmation
   link correctly.
7. **Expected**: within a couple of seconds, the page shows your original
   result again (same LT1/LT2/numbers you had before signing up) — you do
   NOT have to re-enter your test data.
8. **Expected**: a green banner reads "✓ Welcome — your cycling profile has
   been restored and saved to your account." This must be unambiguous — if
   you have to guess whether the numbers on screen are the ones you tested
   with, that's a fail.
9. Reload the page. **Expected**: "Saved profile available" now shows this
   result (confirms it was actually persisted, not just displayed).

**G2. Private browsing / blocked site data**
1. Repeat G1 steps 1–2 in a browser mode that blocks `localStorage` (Safari
   Private Browsing with "Block all cookies," or a browser extension that
   blocks site data, or manually disable storage via devtools).
2. **Expected at step 2 (clicking "Create free account")**: no crash, no
   console error that breaks the page — you still land on `/login` normally.
3. Complete signup and confirm email as in G1.
4. **Expected**: you land back on `/calculator/profiler` with **no result
   shown** (empty state, "Enter your test data and click Calculate") and
   **no error message and no broken UI** — this is "degrade to no
   preservation," not a failure state. You should be able to just fill the
   form again normally.

**G3. Stale result (past the 48-hour window)**
This requires manipulating the stored timestamp — ask an engineer to help
if you can't do this from devtools:
1. Run G1 steps 1–2 to stash a pending result, but before completing signup,
   open devtools → Application → Local Storage → find the
   `fuelingSense.pendingResult` key.
2. Edit the JSON value's `savedAt` field to a timestamp more than 48 hours in
   the past (`Date.now() - 49*60*60*1000` or earlier).
3. Complete signup and confirm email.
4. **Expected**: the stale result is **not** restored — you land on
   `/calculator/profiler` with the empty state, same as G2. No stale numbers
   silently appear. (Bonus check: the `fuelingSense.pendingResult` key should
   be gone from Local Storage afterward — expired entries are cleared on
   read, not just ignored.)

**G4. Ignoring the offer — no nagging**
1. Run a cycling profile, logged out. Do NOT click "Create free account."
2. Interact with the rest of the page normally (view zones, export PDF,
   change inputs and recalculate).
3. **Expected**: the prompt does not reappear as a popup/toast, does not
   block any action, and no degraded/blurred version of the result appears
   anywhere. It's fine if it simply stays present in its one spot in the
   results view — it must not escalate.

**G5. Repeat for the other three calculators**

| Calculator | Route | Expected restore banner |
|---|---|---|
| Running profiler | `/calculator/running-profiler` | "✓ Welcome — your running profile has been restored and saved to your account." |
| Cycling fueling | `/calculator/fueling` | "✓ Welcome — your fueling plan has been restored and saved to your account." |
| Running fueling | `/calculator/running-fueling` | "✓ Welcome — your fueling plan has been restored and saved to your account." |

For the two fueling calculators, "saved" means the next page reload should
NOT re-show the result (fueling results aren't loaded back from a saved-list
UI the way profiles are) — the meaningful check there is that the calculation
was submitted with your account attached (no direct way to verify from the
UI; if you have DB access, confirm a new `fueling_results` row exists for
that account after G1's equivalent flow).

---

## Sign-off

Record pass/fail per section (A–G). Any failure in Part A–D on a **logged-out
generic-error path with no result and no clear next step** is the one flagged
as highest priority in the original anonymous-access work. For Phase 5 (Part
G), the highest-priority failure is different: **G2 (private browsing) or G3
(stale result) producing a broken page or a wrong/stale result silently
shown as if it were current** — that's worse than the feature not existing at
all, since it would look correct while being wrong.
