/**
 * First-run onboarding tour (intro.js). Explains the core idea — capture
 * anything, focus on only three — and points out the key bits of the UI. Shown
 * once per user (tracked in settings.onboarded); can be replayed from Settings.
 */
import introJs from "intro.js";
import { state, saveSettings } from "./store";

interface Step { element?: string; title: string; intro: string; }

const STEPS: Step[] = [
  {
    title: "Welcome to FoFoDo 👋",
    intro:
      "The idea is simple: <b>capture anything</b>, but only ever work on <b>three things at a time</b>. " +
      "The limit is the feature — it keeps you focused and calm.",
  },
  {
    element: '[data-tour="capture"]',
    title: "1. Capture anything",
    intro:
      "Type any thought here and press Enter — it lands in your <b>Inbox</b> instantly (even offline). " +
      "Try shorthand like <i>“Email Sam tomorrow 3pm #grow”</i> and it fills in the date and area for you.",
  },
  {
    element: '[data-tour="wip"]',
    title: "2. Your focus meter",
    intro:
      "This shows how many tasks are <b>in focus</b> right now. You can have at most <b>3</b>. " +
      "Try to add a 4th and FoFoDo kindly asks which one to swap out — no shame, just focus.",
  },
  {
    element: '[data-tour="nav-your3"]',
    title: "3. Your 3",
    intro: "Your three in-focus tasks live here — the things you're actually doing now.",
  },
  {
    element: '[data-tour="nav-inbox"]',
    title: "4. Inbox → Next up → Your 3",
    intro:
      "New captures sit in <b>Inbox</b>. Sort them into <b>Next up</b> when they're ready, then pull up to " +
      "three into <b>Your 3</b> when you commit to them. <b>Later</b> holds anything you've postponed.",
  },
  {
    element: '[data-tour="hats"]',
    title: "5. Your hats (areas)",
    intro:
      "Every task wears one of four <b>hats</b> — your areas of work: " +
      "<b>Steer</b> (direction), <b>Build</b> (making), <b>Grow</b> (growth) and <b>Run</b> (admin). " +
      "They power your weekly balance so no area gets quietly neglected.",
  },
  {
    title: "You're set 🎯",
    intro:
      "Capture freely, commit to three, and back off guilt-free when you need to. " +
      "You can replay this tour any time from <b>Settings</b>.",
  },
];

function presentSteps() {
  return STEPS.filter((s) => !s.element || document.querySelector(s.element));
}

export function startTour(markDone = true) {
  // Let the DOM settle (drawer/header render) before measuring elements.
  setTimeout(() => {
    const ij: any = introJs as any;
    const tour = typeof ij.tour === "function" ? ij.tour() : ij();
    tour.setOptions({
      steps: presentSteps(),
      nextLabel: "Next",
      prevLabel: "Back",
      doneLabel: "Start using FoFoDo",
      showBullets: true,
      exitOnOverlayClick: false,
      scrollToElement: true,
      tooltipClass: "fofo-tour",
    });
    if (markDone) {
      const finish = () => { void saveSettings({ onboarded: true }); };
      tour.oncomplete(finish);
      tour.onexit(finish);
    }
    tour.start();
  }, 350);
}

/** Show the tour once, after first sign-in, when settings have loaded. */
export function maybeStartTour() {
  if (!state.user) return;
  if (state.settings?.onboarded) return;
  startTour(true);
}
