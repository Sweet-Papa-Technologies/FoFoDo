# FoFoDo — Design Brief for Google Stitch

> **Purpose of this doc:** a complete, self-contained description of the FoFoDo
> app — its concept, voice, every screen, every component, and every state — so a
> designer (human or Google Stitch) can produce a fresh visual design without
> reading the code. It describes **what each screen must contain and do**, not how
> it must look. Visual direction is open; the constraints below are about content,
> hierarchy, and behavior.
>
> Live reference build (current, functional but un-art-directed): https://fofodo.web.app

---

## 1. What FoFoDo is

FoFoDo is a **deliberately constrained personal task tracker**. Its headline
feature is a *limit*, not a feature list: **you may have at most 3 tasks "active"
at once (WIP-3).** It exists for someone who over-commits and avoids the things
that matter — so the app makes it **easy to capture anything, hard to over-commit,
and impossible to ignore what you're dodging**, while staying calm and frictionless.

Tagline: **"Capture anything. Commit to three. The limit is the feature."**

It is an installable PWA (works offline), and it is API- and MCP-first (other
tools and AI agents can drive it). It has an optional, always-dismissible AI layer.

### Design personality (critical — this drives the whole visual tone)
- **Calm, not busy.** This is an anxiety-reducer. Lots of breathing room, soft
  surfaces, no dense grids, no red "overdue!" walls, no badges screaming for
  attention. Negative space is a feature.
- **Kind & encouraging, never shaming.** Copy is curious and warm
  ("Distribution's been quiet — worth a 10-min poke?"). **No** streaks, **no**
  guilt, **no** punitive red. Celebration over shame.
- **Focused.** The "3" is sacred. The UI should make "your three" feel special
  and a little precious — the hero of the app.
- **Dark-first.** Dark theme is the default; a light theme is offered. Modern,
  soft, slightly premium. Think calm productivity tool, not enterprise dashboard.

### Brand primitives currently in use (reinterpret freely)
- Accent/primary: a soft indigo-blue (`#6c8cff`). Accent highlight: warm amber (`#ffce6b`).
- Dark canvas: near-black charcoal (`#0f1115`); cards are subtle translucent panels.
- Positive: green (`#3ecf8e`); negative: soft red (`#ff6b6b`, used sparingly).
- Rounded corners (cards ~14px), thin hairline borders, gentle elevation.

---

## 2. Core concepts the UI must express

- **Task** — the atomic unit. Has a title, optional markdown notes, a **Hat**, an
  optional **Project**, a **status**, an optional due date/time, an optional
  reminder, and a "pushed N×" count (how many times it's been snoozed/deferred —
  used to surface avoidance).
- **Status lifecycle:** `inbox` → `next` → `active` → `done`, plus `snoozed`.
  - **Inbox** = captured, not yet triaged.
  - **Next** = triaged, ready to pick up.
  - **Active** = committed right now. **Max 3. This limit is the product.**
  - **Snoozed** = deliberately backed off (optional wake date). Backing off is a
    valid, guilt-free action — present it positively.
  - **Done** = completed.
- **Hat** — every task & project wears exactly one of **four** hats (life/work
  areas). Names are user-renameable; the four-slot structure is fixed. Defaults:
  - **Steer** (direction/strategy) — indigo `#6c8cff`
  - **Build** (making things) — green `#3ecf8e`
  - **Grow** (distribution/marketing) — amber `#ffce6b`
  - **Run** (ops/admin; also the default "unsorted" hat) — grey `#8a8f98`
  Hats are shown as a **small colored dot** + label throughout. They power the
  weekly "are you neglecting an area?" audit.
- **Project** — a loose grouping of related tasks (e.g. "Website Relaunch"). Has a
  name, a hat, and a status (`active` / `paused` / `snoozed`). **Pausing** a
  project hides its tasks from default views without deleting them.
- **Active Bet** — exactly **one** project (or task) pinned as the current top
  priority, with a free-text **leading indicator** ("the one number that tells me
  it's working"). Always pinned at the top of the dashboard. Marked with a ⭐.
- **Reminder** — a fire time on a task, delivered via browser push and/or webhook.
- **Hat balance** — per-hat activity counts for the week (the audit input).

---

## 3. Users & contexts

- **Primary user:** a busy multi-hat operator who is "bad at schedules" and
  over-commits. Power user; also drives the app by API/voice/AI.
- **Devices:** desktop web AND mobile PWA (installed to home screen). **Design
  mobile and desktop layouts for every screen.** Mobile is first-class.
- **Offline:** the app works offline for capture/edit/view. There must be a clear
  but unobtrusive **offline indicator**, and nothing should feel broken offline.

---

## 4. App shell & navigation (persistent chrome)

Every signed-in screen sits inside this shell:

### 4.1 Top header (always visible)
Left→right:
1. **Menu / hamburger** (toggles the nav drawer on mobile; drawer is pinned on desktop).
2. **Wordmark** "FoFoDo".
3. **WIP pill** — a compact chip showing **"N/3 active"**. This is a signature
   element: when N = 3, it should feel "full" (e.g. filled/colored, calm-but-firm);
   below 3 it's quiet. It is the constant reminder of the constraint. Never alarming.
4. **Offline indicator** — a small cloud-off icon with tooltip "Offline — changes
   sync on reconnect", only when offline.
5. **Search** entry (icon on mobile, could be a field on desktop).

### 4.2 Quick Capture bar (the most important input in the app)
Directly under the header, **always reachable on every screen**. A single text
box: placeholder *"Capture anything…  e.g. call Jamie tomorrow 3pm #grow"*. It has:
- a leading **+** affordance,
- a **mic button** (voice capture; hidden where the browser doesn't support it),
- a **send** button.
Pressing Enter or Send instantly files the thought into **Inbox** (sub-2-second,
works offline). It parses natural language: `#grow`/`#build`/`#steer`/`#run` set
the hat, `tomorrow`/`today` + a time (`3pm`, `15:30`) set the due date, `+ProjectName`
links a project. This bar is the heart of "frictionless capture" — make it
inviting and prominent, never buried.

### 4.3 Navigation drawer (left)
Grouped list:
- **Primary views:** Home (dashboard), **Your 3 (Active)**, Next, Inbox (with a
  count badge), Snoozed, Done.
- **By Hat:** the four hats, each a row with its color dot + name. Selecting one
  filters tasks to that hat. **Only the selected hat is highlighted** (this was a
  bug we fixed — make selection state unmistakable).
- **Projects:** a live list of active projects (each: color dot + name, ⭐ if it's
  the Active Bet), a **+** to create one, and a **"Manage projects"** link. Empty
  state: "No projects yet".
- **Footer:** Settings, Sign out.

Selected nav item must have a clear active state. On mobile the drawer is an
overlay that closes after selection; on desktop it's pinned.

---

## 5. Screens (design every one, in light + dark, mobile + desktop)

### SCREEN 1 — Sign in / Auth
- App wordmark + tagline ("Capture anything. Commit to three. The limit is the feature.").
- Card with: **Continue with Google** (primary), a divider "or with email", an
  **email** field, a **password** field, and two actions: **Sign in** and
  **Create account**.
- Footer line: "Self-hostable · MIT · API + MCP first".
- States: idle, loading (button spinner), error (inline toast/message, friendly).
- Tone: welcoming, calm, single card centered.

### SCREEN 2 — Home / Dashboard (the landing screen)
A calm overview built from **four tiles** plus a weekly audit strip. Tiles can be
a 2×2 grid on desktop, stacked on mobile.

1. **Active Bet tile.** Shows the pinned project name + its leading indicator
   ("the one number that tells you it's working"). Empty state: a gentle prompt
   "No Active Bet yet. Pin your one top priority." with a **Set Active Bet** button.
2. **Your 3 tile.** The signature tile. Shows the (up to) 3 active tasks, each with
   its hat dot, title, and a quick **complete** checkmark. Includes a **"What now?"**
   button (sparkle icon) that suggests which of the 3 to do given time/energy — it
   shows a one-sentence "why". Empty state: "Nothing active. Pick up to three from
   Next or Inbox." Make this tile feel like the centerpiece.
3. **Hat balance · this week tile.** Four rows (one per hat): color dot + name +
   a count + a thin progress bar showing relative activity. Communicates "which
   areas got love this week" at a glance. No judgment — just balance.
4. **Needs attention tile.** A short, calm list: count of overdue, count of
   "aging in inbox", and the single **most-avoided** task ("Avoided most: '…' (4×)").
   Empty state: "All clear. Nice and calm." Never red/aggressive.

Below the tiles: **Weekly avoidance audit** strip. Deterministic sentence(s):
"Quiet hats: Steer, Grow. Most dodged: '…' (4×). Longest-paused project: …."
Plus an optional **AI summary** button (only if AI is enabled) that adds a kind,
curious 1–2 sentence coaching note + a suggested 10-minute nudge. When AI is off,
show "AI summary off — deterministic stats only."

### SCREEN 3 — Task list views (Active / Next / Inbox / Snoozed / Done / By Hat / By Project)
One flexible list screen, parameterized by view. Anatomy:
- **Header row:** the view title (e.g. "Your 3 · Active", "Inbox", "Hat · Build",
  or the project name). For a **project** view, also show the project's status
  chip (if paused), an ⭐ if it's the Active Bet, an **Add task** button, and an
  overflow menu (Set as Active Bet, Pause/Resume, Manage projects).
- **Task list:** rows of the **Task item** component (see §6.1).
- **Empty states** (friendly, per view): Inbox "Inbox zero. Capture lands here
  first." · Next "Nothing queued. Triage your inbox." · Active "No active tasks.
  Commit to up to three." · Snoozed "Nothing snoozed. Backing off is allowed when
  you need it." · Done "Nothing finished yet." · Project "No tasks in this project
  yet — add one with 'Add task'."
- **Done** view shows recently completed tasks (struck-through/muted), most recent first.
- **Paused project** note when viewing one: "This project is paused — its tasks are
  hidden from default views, but shown here."
- Tasks should be **drag-reorderable** within a list (nice-to-have visual: a drag handle).

### SCREEN 4 — Projects manager (`/projects`)
- Header: "Projects" + **New project** button.
- Explainer line: what projects are (loose grouping; pausing hides tasks; one can
  be the Active Bet).
- A **list of project cards**, each showing: hat color dot, project name, ⭐ if
  Active Bet, status chip if not active, and a subline "‹Hat› · N open tasks"
  (plus "📈 ‹leading indicator›" if it's the Active Bet). Actions: **Open** (filter
  to it) and an overflow menu: Rename, Change hat, Set as Active Bet, Pause/Resume,
  Delete (delete keeps the tasks, just unlinks them).
- Empty state: "No projects yet. Create one to start grouping tasks."

### SCREEN 5 — Search (`/search`)
- A prominent search field (placeholder "Search tasks & projects…"), auto-focused,
  searches **as you type**, works offline.
- Caption: "Searches your local cache — works offline, updates as you type."
- Results grouped: **Projects** (folder icon + name) then **Tasks** (Task item rows).
- Empty/no-match state: "No matches."

### SCREEN 6 — Settings (`/settings`)
Sectioned cards:
1. **Preferences:** an **AI features** master toggle (with sublabel: "Master kill
   switch. Off ⇒ zero model calls; every flow still works."), a **Cadence prompts**
   toggle (daily/weekly review nudges), and a **Theme** toggle (Dark / Light).
2. **Hats:** four rows, each with the hat's color dot and an **editable name** field
   + the stable key shown muted. (Rename only — four slots fixed.)
3. **API keys:** explainer ("authenticate the REST API and the MCP server. Shown
   once, stored hashed."), a **New key** button, and a list of keys (name, prefix…,
   created date, active/revoked, **Revoke** action). When a key is created, show a
   one-time reveal banner with a **Copy** button and a "copy now — shown once"
   warning. Footer: the MCP endpoint URL and REST base URL.
4. **Your data:** **Export JSON**, **Tasks CSV**, and a **Delete account** action
   (destructive, requires typing DELETE to confirm).
- Footer: app version + signed-in email + "MIT".

---

## 6. Reusable components (define these as a kit)

### 6.1 Task item (row) — the workhorse, appears everywhere
A single task row containing:
- A **complete checkbox** (checking it marks done; done rows show strikethrough + muted).
- **Title** (primary text).
- A **meta line** (small, muted): hat color dot + hat name · "due ‹date/time›" (if
  any) · 📁 project name (if any) · "active" (if active, in accent) · "pushed N×"
  (if it's been deferred).
- A prominent **⚡ "make active"** button (only when the task isn't already active
  or done) — committing to the WIP-3 set is a meaningful, slightly celebratory action.
- An **overflow (⋯) menu:** Edit, Change hat…, Move to project…, Snooze 1 day,
  Snooze 1 week, Wake now (if snoozed), Delete.
Design hover/press/selected states. Keep rows airy.

### 6.2 WIP pill — "N/3 active"
The constraint indicator in the header. Calm below 3; "full" at 3. Never red/alarmed.

### 6.3 Hat dot / hat chip
A small colored dot (10px) + label. Used in nav, task meta, dashboards, dialogs.
Colors per hat (see §2). This is the primary categorical color system.

### 6.4 Tile card
The dashboard surface: rounded, subtle border/translucent fill, an overline label
in accent, calm internal spacing.

### 6.5 Dialogs / modals (design the set)
- **WIP-3 bump dialog** (very important, sets the tone): triggered when you try to
  make a 4th task active. Title "You're already on your 3". Body (kind): "WIP-3
  keeps you honest. Pick one to bump back to Next to make room — no shame in it."
  Lists the current 3 active tasks, each tappable (with a swap icon) to demote it
  and promote the new one. A "Keep my 3" dismiss. This dialog should feel
  supportive, even a little playful — not an error.
- **Capture/edit task dialog:** title field + markdown notes (autogrow).
- **Change hat dialog:** radio list of the four hats.
- **Move to project dialog:** radio list of projects + "— No project —".
- **Set Active Bet dialog:** pick a project, then enter the leading-indicator text.
- **New project dialog:** name, then hat.
- **Delete confirm dialogs:** calm, explicit, reversible-sounding where possible.
- **Toasts/snackbars:** brief confirmations ("Committed to active", "Copied",
  "Swapped — new task is active"); errors are gentle ("Needs connection").

### 6.6 Voice capture state
When the mic is recording, the mic button shows an active/listening state.

### 6.7 Ad slot (hosted builds only — usually hidden)
A single unobtrusive "house ad" panel that can appear at the top of list views in
the hosted tier. In the open-source build it renders nothing. Design a tasteful,
clearly-labeled "Sponsored" card that doesn't break the calm. (Off by default.)

---

## 7. Cross-cutting UX requirements

- **Offline-first:** every screen must look intentional offline; the only signal is
  the small offline icon. Capture/edit/complete/snooze all work offline.
- **Instant rendering:** lists and the dashboard render immediately from cache — no
  full-screen spinners gating core views. Use skeletons/optimism over blocking spinners.
- **Accessibility:** keyboard-navigable, visible focus states, screen-reader labels
  on all icon buttons, sufficient contrast in both themes. Dark mode is default.
- **Responsive:** mobile (single column, drawer overlay, bottom-reachable capture),
  tablet, desktop (pinned drawer, 2-column dashboard). Capture bar stays reachable.
- **Motion:** subtle and calming (gentle fades, soft transitions). Nothing bouncy
  or attention-grabbing. Completing a task / committing the 3rd active task can have
  a small, tasteful moment of delight (kindness, not gamification).
- **PWA:** installable; provide an app icon concept (current placeholder is a "3"
  inside a ring on dark — feel free to redesign around the "three / focus" idea).

---

## 8. Screen inventory (checklist for Stitch)

| # | Screen | Key elements |
|---|--------|--------------|
| 1 | Sign in | Google btn, email/password, create account, tagline |
| 2 | Home / Dashboard | 4 tiles (Active Bet, Your 3, Hat balance, Needs attention) + avoidance audit |
| 3 | Active / "Your 3" | the committed ≤3, complete + overflow |
| 4 | Next | triaged-ready list |
| 5 | Inbox | captured/untriaged list (with count) |
| 6 | Snoozed | backed-off list (wake actions) |
| 7 | Done | recent completed (muted) |
| 8 | By Hat | filtered list per hat (selected hat highlighted) |
| 9 | By Project | filtered list + project header/actions + Add task |
| 10 | Projects manager | project cards, create/manage |
| 11 | Search | as-you-type, grouped results |
| 12 | Settings | preferences, hats, API keys, data |
| — | Dialogs | WIP-3 bump, capture/edit, change hat, move to project, set active bet, new project, deletes, toasts |
| — | App shell | header + WIP pill + capture bar + nav drawer + offline state |

---

## 9. The one thing to get right

If a designer remembers only one thing: **this app is a calm, kind instrument
whose hero is the number 3.** "Your three" should feel focused and a little
precious; everything else (capture, hats, projects, audit) orbits the discipline
of committing to only three things at a time — and the app should make backing off
and avoiding-less feel encouraging, never shameful.
