<template>
  <q-page class="q-pa-md">
    <div class="row q-col-gutter-md">
      <!-- Active Bet -->
      <div class="col-12 col-md-6">
        <q-card flat bordered class="fofo-tile">
          <q-card-section>
            <div class="text-overline text-primary">Active Bet</div>
            <template v-if="d.bet">
              <div class="text-h6">{{ d.bet.name }}</div>
              <div class="text-caption text-grey">Leading indicator</div>
              <div class="text-body2">{{ d.bet.leadingIndicator || '— set what tells you it’s working —' }}</div>
            </template>
            <template v-else>
              <div class="text-body2 text-grey q-mb-sm">No Active Bet yet. Pin your one top priority.</div>
              <q-btn dense color="primary" outline label="Set Active Bet" @click="setBet" />
            </template>
          </q-card-section>
        </q-card>
      </div>

      <!-- Your 3 -->
      <div class="col-12 col-md-6">
        <q-card flat bordered class="fofo-tile">
          <q-card-section>
            <div class="row items-center justify-between">
              <div class="text-overline text-primary">Your 3</div>
              <q-btn dense flat color="primary" label="What now?" icon="auto_awesome" @click="whatNow" :loading="wn" />
            </div>
            <div v-if="!d.three.length" class="text-body2 text-grey">Nothing active. Pick up to three from Next or Inbox.</div>
            <q-list v-else>
              <q-item v-for="t in d.three" :key="t.id" dense :class="{ 'text-primary': pick === t.id }">
                <q-item-section avatar><span class="hat-dot" :style="{ background: hatColor(t.hatId) }" /></q-item-section>
                <q-item-section>{{ t.title }}</q-item-section>
                <q-item-section side><q-btn flat round dense icon="check" @click="completeTask(t.id)" /></q-item-section>
              </q-item>
            </q-list>
            <div v-if="whyText" class="text-caption text-accent q-mt-sm">{{ whyText }}</div>
          </q-card-section>
        </q-card>
      </div>

      <!-- Hat balance -->
      <div class="col-12 col-md-6">
        <q-card flat bordered class="fofo-tile">
          <q-card-section>
            <div class="text-overline text-primary">Hat balance · this week</div>
            <div v-for="h in state.hats" :key="h.id" class="q-mb-xs">
              <div class="row items-center justify-between">
                <div class="row items-center q-gutter-xs"><span class="hat-dot" :style="{ background: hatColor(h.key) }" />{{ h.name }}</div>
                <div class="text-caption">{{ d.hatBalance[h.key] || 0 }}</div>
              </div>
              <q-linear-progress :value="bar(d.hatBalance[h.key])" :color="h.key === 'ops' ? 'grey' : 'primary'" track-color="grey-9" size="6px" rounded />
            </div>
          </q-card-section>
        </q-card>
      </div>

      <!-- Needs attention -->
      <div class="col-12 col-md-6">
        <q-card flat bordered class="fofo-tile">
          <q-card-section>
            <div class="text-overline text-primary">Needs attention</div>
            <div v-if="!d.overdue.length && !d.aging.length && !d.mostAvoided" class="text-body2 text-grey">All clear. Nice and calm.</div>
            <template v-else>
              <div v-if="d.overdue.length" class="q-mb-xs"><q-icon name="schedule" size="16px" /> {{ d.overdue.length }} overdue</div>
              <div v-if="d.aging.length" class="q-mb-xs"><q-icon name="hourglass_empty" size="16px" /> {{ d.aging.length }} aging in inbox</div>
              <div v-if="d.mostAvoided" class="text-accent">
                <q-icon name="visibility" size="16px" /> Avoided most: “{{ d.mostAvoided.title }}” ({{ d.mostAvoided.pushCount }}×)
              </div>
            </template>
          </q-card-section>
        </q-card>
      </div>
    </div>

    <!-- Avoidance audit (weekly) -->
    <q-card flat bordered class="fofo-tile q-mt-md">
      <q-card-section>
        <div class="row items-center justify-between">
          <div class="text-overline text-primary">Weekly avoidance audit</div>
          <q-btn v-if="state.settings.aiEnabled" dense flat color="accent" label="AI summary" icon="psychology" @click="loadAudit" :loading="auditBusy" />
        </div>
        <div class="text-body2">
          <span v-if="av.quietHats.length">Quiet hats: <b>{{ av.quietHats.map(hatName).join(', ') }}</b>. </span>
          <span v-else>Every hat got some love this week. </span>
          <span v-if="av.mostPushed">Most dodged: <b>“{{ av.mostPushed.title }}”</b> ({{ av.mostPushed.pushCount }}×). </span>
          <span v-if="av.pausedLongest">Longest-paused project: <b>{{ av.pausedLongest.name }}</b>.</span>
        </div>
        <div v-if="auditProse" class="text-caption text-accent q-mt-sm">{{ auditProse }}</div>
        <div v-else-if="!state.settings.aiEnabled" class="text-caption text-grey q-mt-sm">AI summary off — deterministic stats only. Enable AI in Settings.</div>
      </q-card-section>
    </q-card>
  </q-page>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useQuasar } from "quasar";
import { dashboard, avoidanceStats, state, hatName, completeTask, setActiveBet } from "../store";
import { api } from "../api";
import { hatColor } from "../hats";

const $q = useQuasar();
const d = dashboard;
const av = avoidanceStats;

const wn = ref(false); const pick = ref<string | null>(null); const whyText = ref("");
const auditBusy = ref(false); const auditProse = ref("");

function bar(n: number) { const max = Math.max(1, ...Object.values(d.value.hatBalance)); return (n || 0) / max; }

async function whatNow() {
  wn.value = true; whyText.value = "";
  try {
    const r = await api.whatNow();
    pick.value = r.pick?.id || null;
    whyText.value = r.pick?.why || "";
    if (r.aiDisabled && !r.pick) whyText.value = "Pick the one aligned with your Active Bet.";
  } catch (e: any) { $q.notify({ type: "negative", message: "Needs connection" }); }
  finally { wn.value = false; }
}
async function loadAudit() {
  auditBusy.value = true;
  try { const r = await api.avoidance(); auditProse.value = r.summary || "No summary available."; }
  catch { $q.notify({ type: "negative", message: "Needs connection" }); }
  finally { auditBusy.value = false; }
}
function setBet() {
  if (!state.projects.length) { $q.notify({ message: "Create a project first (in a list’s + menu)." }); return; }
  $q.dialog({
    title: "Set Active Bet", options: { type: "radio", items: state.projects.map((p) => ({ label: p.name, value: p.id })) },
    cancel: true,
  }).onOk((projectId: string) => {
    $q.dialog({ title: "Leading indicator", message: "The one number that tells you it’s working:", prompt: { model: "" }, cancel: true })
      .onOk((li: string) => setActiveBet(projectId, li));
  });
}
</script>
