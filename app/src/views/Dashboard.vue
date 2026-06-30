<template>
  <q-page class="q-px-md" style="padding-top: var(--margin-focus); padding-bottom: 96px">
    <div class="focus-col">
      <h2 class="headline-lg q-mb-lg">{{ greeting }}</h2>

      <div class="row q-col-gutter-md">
        <!-- Top Priority (was "Active Bet") -->
        <div class="col-12 col-md-6">
          <div class="glass-panel q-pa-md" style="border-radius:var(--radius); min-height:160px">
            <div class="row items-center justify-between q-mb-sm">
              <span class="label-caps">{{ TERMS.activeBet }}</span>
              <q-icon name="sym_o_rocket_launch" color="primary" size="18px" />
            </div>
            <template v-if="d.bet">
              <div class="title-md">{{ d.bet.name }}</div>
              <div class="text-caption q-mt-xs" style="color:var(--on-surface-variant)">{{ TERMS.leadingIndicator }}</div>
              <div v-if="d.bet.leadingIndicator" class="q-mt-sm row items-center q-gutter-xs"
                   style="color:var(--positive); background:rgba(62,207,142,0.1); padding:6px 10px; border-radius:10px; width:fit-content">
                <span>📈</span><span style="font-weight:600">{{ d.bet.leadingIndicator }}</span>
              </div>
              <div v-else class="text-caption q-mt-sm" style="color:var(--on-surface-variant)">
                Set the one number that tells you it’s working.
              </div>
            </template>
            <template v-else>
              <div class="text-body2 q-mb-sm" style="color:var(--on-surface-variant)">
                Pin your single most important project so it’s always front and centre.
              </div>
              <q-btn dense color="primary" text-color="dark" unelevated rounded label="Choose Top Priority" @click="setBet" />
            </template>
          </div>
        </div>

        <!-- Your 3 -->
        <div class="col-12 col-md-6">
          <div class="glass-panel q-pa-md glow-active" style="border-radius:var(--radius); min-height:160px">
            <div class="row items-center justify-between q-mb-sm">
              <span class="label-caps">{{ NAV.your3 }}</span>
              <q-btn dense flat no-caps size="sm" icon="sym_o_auto_awesome" label="What now?" color="secondary"
                     @click="whatNow" :loading="wn" />
            </div>
            <div v-if="!d.three.length" class="text-body2" style="color:var(--on-surface-variant)">
              Nothing in focus yet. Pull up to three from Inbox or Next up.
            </div>
            <q-list v-else>
              <q-item v-for="t in d.three" :key="t.id" dense class="q-px-none" :class="{ 'text-primary': pick === t.id }">
                <q-item-section avatar style="min-width:34px">
                  <q-btn flat round dense icon="sym_o_check_circle" @click="completeTask(t.id)" aria-label="Complete">
                    <q-tooltip>Mark done</q-tooltip>
                  </q-btn>
                </q-item-section>
                <q-item-section avatar style="min-width:14px"><span class="hat-bar" :style="{ background: hatColor(t.hatId), height:'16px' }" /></q-item-section>
                <q-item-section>{{ t.title }}</q-item-section>
              </q-item>
            </q-list>
            <div v-if="whyText" class="text-caption q-mt-sm" style="color:var(--secondary)">{{ whyText }}</div>
          </div>
        </div>

        <!-- Hat balance -->
        <div class="col-12 col-md-6">
          <div class="glass-panel q-pa-md" style="border-radius:var(--radius); min-height:160px">
            <span class="label-caps">Hat balance · this week</span>
            <div class="q-mt-md">
              <div v-for="h in state.hats" :key="h.id" class="row items-center q-gutter-sm q-mb-sm">
                <span class="label-caps" :style="{ color: hatColor(h.key), width:'56px' }">{{ h.name }}</span>
                <div class="col" style="height:6px; background:var(--surface-container-high); border-radius:9999px; overflow:hidden">
                  <div :style="{ width: bar(d.hatBalance[h.key]) + '%', height:'100%', background: hatColor(h.key) }" />
                </div>
                <span class="text-caption" style="width:18px; text-align:right; color:var(--on-surface-variant)">{{ d.hatBalance[h.key] || 0 }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Needs attention -->
        <div class="col-12 col-md-6">
          <div class="glass-panel q-pa-md" style="border-radius:var(--radius); min-height:160px">
            <span class="label-caps">Needs attention</span>
            <div v-if="!d.overdue.length && !d.aging.length && !d.mostAvoided" class="text-body2 q-mt-sm" style="color:var(--on-surface-variant)">
              All clear. Nice and calm. ✨
            </div>
            <template v-else>
              <div class="row q-gutter-lg q-mt-sm">
                <div class="column items-center">
                  <span style="font-size:30px; font-weight:700; color:var(--negative)">{{ d.overdue.length }}</span>
                  <span class="label-caps">Overdue</span>
                </div>
                <div class="column items-center">
                  <span style="font-size:30px; font-weight:700; color:var(--secondary)">{{ d.aging.length }}</span>
                  <span class="label-caps">Aging in inbox</span>
                </div>
              </div>
              <div v-if="d.mostAvoided" class="q-mt-md q-pt-sm" style="border-top:1px solid var(--surface-border)">
                <div class="label-caps q-mb-xs">Avoided most</div>
                <div class="row items-center justify-between no-wrap">
                  <span class="ellipsis">{{ d.mostAvoided.title }}</span>
                  <span class="status-chip q-ml-sm" style="white-space:nowrap; color:var(--negative); background:rgba(255,107,107,0.15)">
                    {{ TERMS.postponed }} {{ d.mostAvoided.pushCount }}×
                  </span>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>

      <!-- Weekly avoidance audit strip -->
      <div class="glass-panel q-pa-md q-mt-lg row items-start no-wrap q-gutter-md"
           style="border-radius:var(--radius); background:rgba(239,192,94,0.06); border-color:rgba(239,192,94,0.2)">
        <div class="flex flex-center" style="width:32px; height:32px; border-radius:9999px; background:rgba(239,192,94,0.2); flex:0 0 auto">
          <q-icon name="sym_o_spa" color="secondary" size="18px" />
        </div>
        <div class="col">
          <div class="row items-center justify-between">
            <div class="title-md" style="font-size:15px">This week’s gentle check-in</div>
            <q-btn v-if="state.settings.aiEnabled" dense flat no-caps size="sm" icon="sym_o_psychology"
                   label="AI note" color="secondary" @click="loadAudit" :loading="auditBusy" />
          </div>
          <div class="text-body2 q-mt-xs" style="color:var(--on-surface-variant)">
            <span v-if="av.quietHats.length">Quiet areas: <b>{{ av.quietHats.map(hatName).join(', ') }}</b>. </span>
            <span v-else>Every area got some love this week. </span>
            <span v-if="av.mostPushed">Most dodged: <b>“{{ av.mostPushed.title }}”</b> ({{ av.mostPushed.pushCount }}×). </span>
            <span v-if="av.pausedLongest">Longest-paused project: <b>{{ av.pausedLongest.name }}</b>.</span>
          </div>
          <div v-if="auditProse" class="text-body2 q-mt-sm" style="color:var(--secondary)">{{ auditProse }}</div>
          <div v-else-if="!state.settings.aiEnabled" class="text-caption q-mt-xs" style="color:var(--on-surface-variant)">
            Want a kind, written summary? Turn on AI in Settings.
          </div>
        </div>
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useQuasar } from "quasar";
import { dashboard, avoidanceStats, state, hatName, completeTask, setActiveBet } from "../store";
import { api } from "../api";
import { hatColor } from "../hats";
import { NAV, TERMS } from "../copy";

const $q = useQuasar();
const d = dashboard;
const av = avoidanceStats;

const wn = ref(false); const pick = ref<string | null>(null); const whyText = ref("");
const auditBusy = ref(false); const auditProse = ref("");

const greeting = computed(() => {
  const h = new Date().getHours();
  const part = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  return `${part}. Focus on what matters.`;
});

function bar(n: number) { const max = Math.max(1, ...Object.values(d.value.hatBalance)); return Math.round(((n || 0) / max) * 100); }

async function whatNow() {
  wn.value = true; whyText.value = "";
  try {
    const r = await api.whatNow();
    pick.value = r.pick?.id || null;
    whyText.value = r.pick?.why || "";
    if (r.aiDisabled && !r.pick) whyText.value = "Pick the one aligned with your Top Priority.";
  } catch { $q.notify({ type: "negative", message: "Needs connection" }); }
  finally { wn.value = false; }
}
async function loadAudit() {
  auditBusy.value = true;
  try { const r = await api.avoidance(); auditProse.value = r.summary || "No summary available."; }
  catch { $q.notify({ type: "negative", message: "Needs connection" }); }
  finally { auditBusy.value = false; }
}
function setBet() {
  if (!state.projects.length) { $q.notify({ message: "Create a project first (in the sidebar)." }); return; }
  $q.dialog({
    title: `Set ${TERMS.activeBet}`, options: { type: "radio", model: "", items: state.projects.map((p) => ({ label: p.name, value: p.id })) },
    cancel: true,
  }).onOk((projectId: string) => {
    $q.dialog({ title: TERMS.leadingIndicator, message: "The one number that tells you it’s working:", prompt: { model: "" }, cancel: true })
      .onOk((li: string) => setActiveBet(projectId, li));
  });
}
</script>
