# FoFoDo — Naming, Labels & Lingo Review

A focused UX pass on **wording** (not layout): is every label something a brand-new
user understands in one read? The app was using internal/insider terms in several
places. This documents the problems found, the changes applied (live now), and a
few open recommendations.

Guiding rule: **say what it does, not what we call it internally.** Keep the brand
voice (calm, kind), drop the jargon. Internal data keys (`active`, `inbox`,
`direction`, etc.) are unchanged — this is purely what the human sees.

---

## 1. Problems found

| # | Where | Problem | Severity |
|---|-------|---------|----------|
| A | Header pill | **“WIP: 2/3”** — “WIP” (work-in-progress) is insider jargon; most users won't know it. | High |
| B | Mobile vs desktop nav | Desktop said **Home / Your 3 / Next / Inbox**, mobile bottom-nav said **Focus / Queue / Insights** — *different words for the same things*. Inconsistent and confusing. | High |
| C | Status “active” | Tasks showed **“active”** and the view was **“Active”**, but the same idea was also called “Your 3”, “Sacred 3”, and “Focus”. Too many names for one concept. | High |
| D | “Active Bet” | The single-most-important-project feature was labelled **“Active Bet”** + **“leading indicator”** — finance/strategy jargon. | High |
| E | “Snoozed” | **“Snoozed”** for backed-off tasks is okay but not obvious; the verb “snooze” collided with reminders. | Med |
| F | “pushed 4×” | The avoidance counter said **“pushed N×”** — unclear what “pushed” means. | Med |
| G | “Hats” | **“Hats”** for work areas is core brand but opaque to newcomers, with no explanation anywhere. | Med |
| H | “Cadence prompts” | Settings toggle **“Cadence prompts”** — nobody says “cadence”. | Med |
| I | Capture box | Placeholder **“Capture anything…”** was fine but didn't teach the shorthand syntax. | Low |
| J | WIP-3 dialog | Good tone already, but “bump” is mild jargon. | Low |

---

## 2. Changes applied (live)

All wording now flows through one file — `app/src/copy.ts` — so it stays
consistent across every screen.

| Concept (internal key) | Before | **After (now live)** |
|---|---|---|
| Header focus meter | `WIP: 2/3` | **`2 / 3 in focus`** |
| `active` status / view | “Active” / “Sacred 3” / “Focus” | **“Your 3”** (nav) + **“In focus”** (status) — one consistent pair |
| `next` status / view | “Next” | **“Next up”** |
| `snoozed` status / view | “Snoozed” | **“Later”** (noun) + **“Push to Later”** (verb) + **“Bring back now”** |
| `inbox`, `done` | Inbox, Done | unchanged (already clear) |
| Avoidance counter | “pushed 4×” | **“postponed 4×”** |
| Active Bet | “Active Bet” | **“Top Priority”** |
| Leading indicator | “leading indicator” | **“Success signal”** (“the one number that tells you it's working”) |
| Hats group | “By Hat” / “Hats” | **“Your hats”** + a plain descriptor on every hat (Steer = *Direction & planning*, Build = *Making things*, Grow = *Growth & outreach*, Run = *Admin & upkeep*) |
| Settings toggle | “Cadence prompts (daily/weekly reviews)” | **“Review reminders”** + helper line |
| Settings AI toggle | “AI features” | **“AI helpers”** + plainer helper line |
| Mobile bottom nav | Focus / Queue / Insights | **Home / Your 3 / Inbox / Search** (now identical to the sidebar) |
| Capture placeholder | “Capture anything…” | **“Capture a thought… try ‘Email Sam tomorrow 3pm #grow’”** (teaches the shorthand) |
| WIP-3 dialog title | “You're already on your 3” | **“You're already focused on 3”** + kinder body, “move back to Next up” |
| Activate action | “make active” | **“Put in focus (max 3)”**; success toast **“Now in focus”** |
| Empty states | terse | rewritten in plain, kind language (e.g. Inbox: *“Inbox zero. Anything you capture lands here first.”*) |

**Consistency win:** the lifecycle now reads as one clear sentence everywhere —
**Inbox → Next up → Your 3 (in focus) → Done**, with **Later** for things you've
postponed. No more synonyms for the same state.

---

## 3. Decisions & rationale

- **Kept “Hats” (didn't rename to “Areas”).** It's the core SPT brand and the new
  design leans into it. Instead of renaming, we *explain* it: every hat now carries
  a plain-English descriptor in the sidebar and Settings, and the onboarding tour
  teaches the metaphor on first run. This keeps the brand while removing the
  “what's a hat?” confusion. (If you'd rather rename to “Areas”, it's a one-line
  change in `copy.ts`.)
- **“Your 3” + “In focus”** instead of “Active”. “Your 3” is the memorable brand
  hook; “in focus” is the plain status word. Using exactly these two everywhere
  (and nowhere else) kills the synonym sprawl.
- **“Top Priority”** beats “Active Bet” for a first-time reader; “Success signal”
  beats “leading indicator”. The deeper “make a bet” framing is reintroduced gently
  in the onboarding/longer copy rather than as a bare label.
- **Onboarding** (intro.js) now does a lot of the teaching, so labels can stay
  short while the first-run tour explains the model once.

---

## 4. Open recommendations (not yet done — low priority)

1. **“FoFoDo” name itself** — fun, but says nothing about what it does. A tagline is
   always shown beneath it (“Capture anything. Focus on three.”) which covers this;
   no change recommended unless you want an app-store-style subtitle.
2. **Hat names** are editable per user — consider shipping the descriptors as the
   default *names* for brand-new users who don't know the SPT “hats” language, then
   letting power users rename to Steer/Build/Grow/Run.
3. **“What now?”** button — clear and friendly; keep. Could add a tooltip
   “Suggest which of your 3 to do next”.
4. **Reminders vs. “Later”** — both use a clock metaphor. If reminders get more
   prominent UI later, rename the reminder action to “Remind me” to avoid overlap
   with “Push to Later”.

---

*Implemented in `app/src/copy.ts` (+ usages across `App.vue`, `Dashboard.vue`,
`Tasks.vue`, `TaskItem.vue`, `Projects.vue`, `Settings.vue`, `CaptureBox.vue`).
Verified live on https://fofodo.web.app.*
