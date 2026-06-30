<template>
  <q-page class="q-pa-md" style="height: calc(100vh - 116px); display:flex; flex-direction:column">
    <!-- Toolbar -->
    <div class="row items-center q-gutter-sm q-mb-sm no-wrap" style="flex-wrap:wrap">
      <div class="headline-lg">Board</div>
      <q-space />
      <q-input v-model="search" dense outlined debounce="100" placeholder="Filter…" clearable style="min-width:160px" class="glass-panel">
        <template #prepend><q-icon name="sym_o_search" size="18px" /></template>
      </q-input>
      <q-select v-model="projectFilter" dense outlined emit-value map-options clearable
                :options="projectOptions" option-label="label" option-value="value"
                placeholder="All projects" style="min-width:150px" class="glass-panel" />
      <q-toggle v-model="hideDone" label="Hide Done" dense />
      <q-btn dense unelevated color="primary" text-color="dark" icon="sym_o_auto_awesome" label="Ask AI" @click="askOpen = true" />
    </div>

    <!-- Hat filter chips -->
    <div class="row items-center q-gutter-xs q-mb-sm">
      <span class="label-caps q-mr-xs">Hats</span>
      <q-chip v-for="h in state.hats" :key="h.key" clickable dense
              :selected="hatFilter.includes(h.key)" @click="toggleHat(h.key)"
              :style="hatFilter.includes(h.key)
                ? `background:${hatColor(h.key)}; color:#1a1613; font-weight:600`
                : 'background:var(--surface-container-high); color:var(--on-surface-variant)'">
        <span class="hat-dot q-mr-xs" :style="{ background: hatColor(h.key) }" />{{ h.name }}
      </q-chip>
      <q-btn v-if="hatFilter.length" flat dense size="sm" no-caps label="Clear" @click="hatFilter = []" />
    </div>

    <!-- Columns -->
    <div class="row no-wrap q-gutter-sm" style="flex:1; overflow-x:auto; align-items:stretch">
      <div v-for="col in columns" :key="col.key"
           class="column" style="min-width:270px; max-width:300px; flex:1 0 270px; display:flex; flex-direction:column"
           @dragover.prevent="dragOver = col.key" @dragleave="dragOver === col.key && (dragOver = null)"
           @drop="onDrop(col.key)">
        <div class="glass-panel q-pa-sm" style="border-radius:var(--radius); display:flex; flex-direction:column; height:100%"
             :style="dragOver === col.key ? 'outline:2px dashed var(--primary-container); outline-offset:-2px' : ''">
          <div class="row items-center justify-between q-px-xs q-py-xs">
            <span class="label-caps">{{ col.label }}</span>
            <span class="status-chip">{{ tasksFor(col.key).length }}{{ col.key === 'active' ? ' / 3' : '' }}</span>
          </div>
          <q-scroll-area class="col" style="min-height:120px">
            <div v-for="t in tasksFor(col.key)" :key="t.id"
                 class="task-card q-pa-sm q-mb-sm" style="cursor:pointer"
                 draggable="true" @dragstart="dragId = t.id" @dragend="dragId = null; dragOver = null"
                 @click="openTask(t.id)">
              <div class="row items-center no-wrap q-gutter-xs">
                <span class="hat-bar" :style="{ background: hatColor(t.hatId), height:'16px' }" />
                <span class="col ellipsis" :class="{ 'text-strike': t.status==='done' }"
                      :style="t.status==='done' ? 'color:var(--on-surface-variant)' : ''">{{ t.title }}</span>
              </div>
              <div class="row items-center q-gutter-xs q-mt-xs text-caption" style="color:var(--on-surface-variant)">
                <span v-if="wsMeta(t).value !== 'none'" class="status-chip" :style="{ background: wsMeta(t).color, color:'#1a1613', fontWeight:600 }">{{ wsMeta(t).label }}</span>
                <span>{{ hatName(t.hatId) }}</span>
                <span v-if="t.projectId && projectById(t.projectId)">· <q-icon name="sym_o_folder" size="12px" /> {{ projectById(t.projectId)?.name }}</span>
                <span v-if="t.due">· {{ fmtDue(t.due) }}</span>
                <span v-if="(t.commentCount||0) > 0">· <q-icon name="sym_o_chat_bubble" size="11px" /> {{ t.commentCount }}</span>
                <span v-if="(t.pushCount||0) > 0">· ↻{{ t.pushCount }}</span>
              </div>
            </div>
            <div v-if="!tasksFor(col.key).length" class="text-caption q-pa-sm text-center" style="color:var(--on-surface-variant)">—</div>
          </q-scroll-area>
        </div>
      </div>
    </div>

    <!-- Ask AI dialog -->
    <q-dialog v-model="askOpen" position="standard">
      <q-card class="fofo-surface-container" style="width:560px; max-width:96vw">
        <q-card-section class="row items-center justify-between">
          <div class="title-md">Ask AI about your board</div>
          <q-btn flat round dense icon="sym_o_close" v-close-popup />
        </q-card-section>
        <q-card-section class="q-pt-none">
          <div class="row q-gutter-xs q-mb-sm">
            <q-chip v-for="s in suggestions" :key="s" clickable dense outline @click="question = s; ask()">{{ s }}</q-chip>
          </div>
          <q-input v-model="question" type="textarea" autogrow filled dense
                   placeholder="e.g. What should I drop? What's at risk? Summarize my board." @keyup.enter.exact="ask" />
          <div class="row justify-end q-mt-sm">
            <q-btn unelevated color="primary" text-color="dark" icon="sym_o_send" label="Ask" :loading="asking" :disable="!question.trim()" @click="ask" />
          </div>
          <div v-if="answer" class="glass-panel q-pa-md q-mt-sm fofo-md" style="border-radius:var(--radius)" v-html="md(answer)" />
          <div v-else-if="aiOff" class="text-caption q-mt-sm" style="color:var(--on-surface-variant)">AI is off — enable it in Settings to ask about your board.</div>
        </q-card-section>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useQuasar } from "quasar";
import { state, hatName, projectById, openTask, moveTaskToStatus, type Task } from "../store";
import { hatColor } from "../hats";
import { workStatusMeta } from "../copy";
import { renderMarkdown } from "../markdown";
import { api } from "../api";

const $q = useQuasar();
const search = ref("");
const hatFilter = ref<string[]>([]);
const projectFilter = ref<string | null>(null);
const hideDone = ref(false);
const dragId = ref<string | null>(null);
const dragOver = ref<string | null>(null);

const askOpen = ref(false);
const question = ref("");
const answer = ref("");
const aiOff = ref(false);
const asking = ref(false);
const suggestions = ["Summarize my board", "What should I drop?", "What's overdue or at risk?", "Is any hat neglected?"];

const md = (s: string) => renderMarkdown(s);
const wsMeta = (t: Task) => workStatusMeta(t.workStatus);
const fmtDue = (ms: number) => new Date(ms).toLocaleDateString([], { month: "short", day: "numeric" });

const columns = computed(() => {
  const base = [
    { key: "inbox", label: "Inbox" },
    { key: "next", label: "Next up" },
    { key: "active", label: "In focus" },
    { key: "snoozed", label: "Later" },
    { key: "done", label: "Done" },
  ];
  return hideDone.value ? base.filter((c) => c.key !== "done") : base;
});

const projectOptions = computed(() => state.projects.map((p) => ({ label: p.name, value: p.id })));

function toggleHat(k: string) {
  hatFilter.value = hatFilter.value.includes(k) ? hatFilter.value.filter((x) => x !== k) : [...hatFilter.value, k];
}

function passes(t: Task): boolean {
  if (search.value && !`${t.title} ${t.notes || ""}`.toLowerCase().includes(search.value.toLowerCase())) return false;
  if (hatFilter.value.length && !hatFilter.value.includes(t.hatId)) return false;
  if (projectFilter.value && t.projectId !== projectFilter.value) return false;
  return true;
}

function tasksFor(status: string): Task[] {
  const list = state.tasks.filter((t) => t.status === status && passes(t));
  if (status === "done") return list.sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0)).slice(0, 50);
  return list.sort((a, b) => (a.order || 0) - (b.order || 0));
}

async function onDrop(status: string) {
  const id = dragId.value;
  dragOver.value = null;
  dragId.value = null;
  if (!id) return;
  const task = state.tasks.find((t) => t.id === id);
  if (!task || task.status === status) return;
  try {
    const r = await moveTaskToStatus(task, status);
    if ("wip3" in r) $q.notify({ type: "warning", message: "You're already focused on 3 — drag one out of In focus first." });
  } catch (e: any) {
    $q.notify({ type: "negative", message: e?.message || "Couldn't move that (needs connection?)" });
  }
}

async function ask() {
  if (!question.value.trim()) return;
  asking.value = true; answer.value = ""; aiOff.value = false;
  try {
    const r = await api.ask(question.value.trim());
    if (r.aiDisabled) aiOff.value = true;
    else answer.value = r.answer || "No answer.";
  } catch (e: any) {
    $q.notify({ type: "negative", message: e?.message || "Needs connection" });
  } finally { asking.value = false; }
}
</script>
