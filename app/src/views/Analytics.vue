<template>
  <q-page class="q-px-md" style="padding-top: var(--margin-focus); padding-bottom: 96px">
    <div class="focus-col" style="max-width: 760px">
      <div class="row items-center justify-between q-mb-md">
        <div class="headline-lg">Analytics</div>
        <q-btn-toggle v-model="range" no-caps rounded unelevated dense
          :options="[{label:'7d',value:7},{label:'30d',value:30},{label:'90d',value:90},{label:'All',value:0}]"
          color="grey-9" text-color="white" toggle-color="primary" toggle-text-color="dark" />
      </div>

      <!-- Key metrics -->
      <div class="row q-col-gutter-sm q-mb-md">
        <div v-for="m in metrics" :key="m.label" class="col-6 col-md-4">
          <div class="glass-panel q-pa-md" style="border-radius:var(--radius)">
            <div class="label-caps">{{ m.label }}</div>
            <div style="font-size:30px; font-weight:700; line-height:1.1" :style="{ color: m.color || 'var(--on-surface)' }">{{ m.value }}</div>
            <div v-if="m.sub" class="text-caption" style="color:var(--on-surface-variant)">{{ m.sub }}</div>
          </div>
        </div>
      </div>

      <!-- Completed over time -->
      <div class="glass-panel q-pa-md q-mb-md" style="border-radius:var(--radius)">
        <div class="label-caps q-mb-sm">Completed over time</div>
        <div v-if="!series.some(b => b.count)" class="text-caption" style="color:var(--on-surface-variant)">No completed tasks in this range yet.</div>
        <div v-else class="row items-end no-wrap" style="height:150px; gap:3px">
          <div v-for="(b,i) in series" :key="i" class="col" style="display:flex; flex-direction:column; justify-content:flex-end; height:100%">
            <div :style="{ height: barH(b.count) + '%', minHeight: b.count ? '3px' : '0', background: 'var(--primary-container)', borderRadius: '4px 4px 0 0' }">
              <q-tooltip>{{ b.label }}: {{ b.count }} done</q-tooltip>
            </div>
          </div>
        </div>
        <div class="row justify-between q-mt-xs text-caption" style="color:var(--on-surface-variant)">
          <span>{{ series[0]?.label }}</span><span>{{ series[series.length-1]?.label }}</span>
        </div>
      </div>

      <!-- By hat -->
      <div class="glass-panel q-pa-md q-mb-md" style="border-radius:var(--radius)">
        <div class="row items-center justify-between q-mb-sm">
          <div class="label-caps">Activity by hat</div>
          <q-btn-toggle v-model="hatSort" no-caps dense unelevated size="sm"
            :options="[{label:'Most',value:'count'},{label:'A–Z',value:'name'}]"
            color="grey-9" text-color="white" toggle-color="primary" toggle-text-color="dark" />
        </div>
        <div v-for="h in hatStats" :key="h.key" class="q-mb-sm">
          <div class="row items-center justify-between text-caption q-mb-xs">
            <span><span class="hat-dot q-mr-xs" :style="{ background: hatColor(h.key) }" />{{ h.name }}</span>
            <span style="color:var(--on-surface-variant)">{{ h.count }}</span>
          </div>
          <div style="height:8px; background:var(--surface-container-high); border-radius:9999px; overflow:hidden">
            <div :style="{ width: pct(h.count, hatMax) + '%', height:'100%', background: hatColor(h.key) }" />
          </div>
        </div>
      </div>

      <!-- Open work by stage (current snapshot) -->
      <div class="glass-panel q-pa-md q-mb-md" style="border-radius:var(--radius)">
        <div class="label-caps q-mb-sm">Open work by stage · now</div>
        <div v-for="s in stageStats" :key="s.key" class="q-mb-sm">
          <div class="row items-center justify-between text-caption q-mb-xs">
            <span>{{ s.label }}</span><span style="color:var(--on-surface-variant)">{{ s.count }}</span>
          </div>
          <div style="height:8px; background:var(--surface-container-high); border-radius:9999px; overflow:hidden">
            <div :style="{ width: pct(s.count, stageMax) + '%', height:'100%', background: s.color }" />
          </div>
        </div>
      </div>

      <!-- Most postponed -->
      <div class="glass-panel q-pa-md" style="border-radius:var(--radius)">
        <div class="label-caps q-mb-sm">Most postponed</div>
        <div v-if="!postponed.length" class="text-caption" style="color:var(--on-surface-variant)">Nothing's been pushed around. Nice.</div>
        <q-list v-else dense>
          <q-item v-for="t in postponed" :key="t.id" clickable @click="openTask(t.id)" class="q-px-none">
            <q-item-section>{{ t.title }}</q-item-section>
            <q-item-section side>
              <span class="status-chip" style="background:rgba(255,155,134,0.18); color:var(--negative)">postponed {{ t.pushCount }}×</span>
            </q-item-section>
          </q-item>
        </q-list>
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { state, openTask } from "../store";
import { hatColor } from "../hats";

const range = ref(30); // days; 0 = all
const hatSort = ref<"count" | "name">("count");

const now = Date.now();
const DAY = 86400000;
const rangeStart = computed(() => (range.value === 0 ? 0 : now - range.value * DAY));
const inRange = (ts?: number | null) => !!ts && ts >= rangeStart.value && ts <= now;

const captured = computed(() => state.tasks.filter((t) => inRange(t.createdAt)));
const completed = computed(() => state.tasks.filter((t) => t.status === "done" && inRange(t.completedAt)));
const activeNow = computed(() => state.tasks.filter((t) => t.status === "active").length);

const spanDays = computed(() => {
  if (range.value) return range.value;
  const earliest = Math.min(...state.tasks.map((t) => t.createdAt || now), now);
  return Math.max(1, Math.round((now - earliest) / DAY));
});

const metrics = computed(() => {
  const cap = captured.value.length, done = completed.value.length;
  const rate = cap ? Math.round((done / cap) * 100) : 0;
  const perDay = (done / spanDays.value).toFixed(done && spanDays.value > 1 ? 1 : 0);
  const top = hatStats.value[0];
  return [
    { label: "Captured", value: cap },
    { label: "Completed", value: done, color: "var(--positive)" },
    { label: "Completion rate", value: rate + "%", sub: `${done}/${cap}` },
    { label: "Done / day", value: perDay },
    { label: "In focus now", value: activeNow.value + " / 3", color: "var(--primary)" },
    { label: "Top hat", value: top && top.count ? top.name : "—", sub: top && top.count ? top.count + " items" : "" },
  ];
});

// Completed-per-bucket series (daily for <=31d, else weekly).
const series = computed(() => {
  const weekly = spanDays.value > 31;
  const bucketMs = weekly ? 7 * DAY : DAY;
  const start = range.value ? rangeStart.value : now - spanDays.value * DAY;
  const buckets: { label: string; count: number; from: number; to: number }[] = [];
  for (let from = start; from < now; from += bucketMs) {
    const to = from + bucketMs;
    const d = new Date(from);
    buckets.push({ from, to, count: 0, label: d.toLocaleDateString([], { month: "short", day: "numeric" }) });
  }
  if (!buckets.length) buckets.push({ from: start, to: now, count: 0, label: "now" });
  for (const t of state.tasks) {
    if (t.status !== "done" || !t.completedAt) continue;
    const b = buckets.find((x) => t.completedAt! >= x.from && t.completedAt! < x.to);
    if (b) b.count++;
  }
  return buckets.slice(-26);
});
const seriesMax = computed(() => Math.max(1, ...series.value.map((b) => b.count)));
const barH = (c: number) => Math.round((c / seriesMax.value) * 100);

// Activity (captured) by hat in range.
const hatStats = computed(() => {
  const counts: Record<string, number> = {};
  for (const t of captured.value) counts[t.hatId] = (counts[t.hatId] || 0) + 1;
  const rows = state.hats.map((h) => ({ key: h.key, name: h.name, count: counts[h.key] || 0 }));
  return hatSort.value === "name"
    ? rows.sort((a, b) => a.name.localeCompare(b.name))
    : rows.sort((a, b) => b.count - a.count);
});
const hatMax = computed(() => Math.max(1, ...hatStats.value.map((h) => h.count)));

// Current open work by stage.
const stageStats = computed(() => {
  const by = (s: string) => state.tasks.filter((t) => t.status === s).length;
  return [
    { key: "inbox", label: "Inbox", count: by("inbox"), color: "var(--hat-run)" },
    { key: "next", label: "Next up", count: by("next"), color: "var(--hat-steer)" },
    { key: "active", label: "In focus", count: by("active"), color: "var(--primary-container)" },
    { key: "snoozed", label: "Later", count: by("snoozed"), color: "var(--hat-grow)" },
  ];
});
const stageMax = computed(() => Math.max(1, ...stageStats.value.map((s) => s.count)));

const postponed = computed(() =>
  state.tasks.filter((t) => t.status !== "done" && (t.pushCount || 0) > 0)
    .sort((a, b) => (b.pushCount || 0) - (a.pushCount || 0)).slice(0, 6));

const pct = (v: number, max: number) => Math.round((v / max) * 100);
</script>
