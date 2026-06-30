<template>
  <div class="task-card relative-position q-mb-sm" :class="{ 'glow-active': task.status === 'active' }">
    <div class="hat-bar" :style="{ background: hatColor(task.hatId), position: 'absolute', left: 0, top: 0, bottom: 0 }" />
    <div class="row items-center no-wrap q-pa-md" style="padding-left: 18px">
      <q-checkbox :model-value="task.status === 'done'" @update:model-value="toggleDone" class="q-mr-sm" />
      <div class="col">
        <div :class="{ 'text-strike': task.status === 'done' }" :style="task.status === 'done' ? 'color:var(--on-surface-variant)' : ''">
          {{ task.title }}
        </div>
        <div class="row items-center q-gutter-xs q-mt-xs text-caption" style="color:var(--on-surface-variant)">
          <span class="hat-dot" :style="{ background: hatColor(task.hatId) }" />
          <span>{{ hatName(task.hatId) }}</span>
          <span v-if="task.due">· due {{ fmt(task.due) }}</span>
          <span v-if="projectName">· <q-icon name="sym_o_folder" size="13px" /> {{ projectName }}</span>
          <span v-if="task.status === 'active'" style="color:var(--primary)">· {{ STATUS_LABEL.active }}</span>
          <span v-if="(task.pushCount || 0) > 0">· {{ TERMS.postponed }} {{ task.pushCount }}×</span>
        </div>
      </div>
      <q-btn v-if="task.status !== 'active' && task.status !== 'done'" flat round dense icon="sym_o_bolt"
             color="primary" @click="activateTask" aria-label="Put in focus">
        <q-tooltip>Put in focus (max 3)</q-tooltip>
      </q-btn>
      <q-btn flat round dense icon="sym_o_more_vert" aria-label="Task actions">
        <q-menu>
          <q-list style="min-width: 190px">
            <q-item clickable v-close-popup @click="editDialog = true"><q-item-section>Edit</q-item-section></q-item>
            <q-item clickable v-close-popup @click="setHat"><q-item-section>Change hat…</q-item-section></q-item>
            <q-item clickable v-close-popup @click="setProject"><q-item-section>Move to project…</q-item-section></q-item>
            <q-item clickable v-close-popup @click="snooze(1)"><q-item-section>Push to Later · 1 day</q-item-section></q-item>
            <q-item clickable v-close-popup @click="snooze(7)"><q-item-section>Push to Later · 1 week</q-item-section></q-item>
            <q-item v-if="task.status === 'snoozed'" clickable v-close-popup @click="unsnooze(task.id)"><q-item-section>Bring back now</q-item-section></q-item>
            <q-separator />
            <q-item clickable v-close-popup @click="remove"><q-item-section style="color:var(--negative)">Delete</q-item-section></q-item>
          </q-list>
        </q-menu>
      </q-btn>
    </div>
  </div>

  <!-- Edit dialog -->
  <q-dialog v-model="editDialog">
    <q-card style="min-width: 340px">
      <q-card-section class="title-md">Edit task</q-card-section>
      <q-card-section class="q-gutter-sm">
        <q-input v-model="draftTitle" filled dense label="Title" />
        <q-input v-model="draftNotes" filled dense type="textarea" label="Notes (markdown)" autogrow />
      </q-card-section>
      <q-card-actions align="right">
        <q-btn flat label="Cancel" v-close-popup />
        <q-btn color="primary" text-color="dark" unelevated label="Save" @click="saveEdit" v-close-popup />
      </q-card-actions>
    </q-card>
  </q-dialog>

  <!-- "Already on your 3" swap dialog -->
  <q-dialog v-model="wipDialog">
    <q-card style="min-width: 340px">
      <q-card-section class="title-md">You’re already focused on 3</q-card-section>
      <q-card-section class="text-body2" style="color:var(--on-surface-variant)">
        Three is the limit — that’s the point. Pick one to move back to <b>Next up</b> and swap this in. No shame in it.
      </q-card-section>
      <q-list>
        <q-item v-for="a in wipActive" :key="a.id" clickable @click="bumpAndActivate(a.id)">
          <q-item-section>{{ a.title }}</q-item-section>
          <q-item-section side><q-icon name="sym_o_swap_horiz" /></q-item-section>
        </q-item>
      </q-list>
      <q-card-actions align="right"><q-btn flat label="Keep my 3" v-close-popup /></q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useQuasar } from "quasar";
import type { Task } from "../store";
import {
  activate, completeTask, uncompleteTask, snoozeTask, unsnoozeTask, deleteTask, updateTask, hatName, state,
  moveTaskToProject, projectById,
} from "../store";
import { hatColor } from "../hats";
import { STATUS_LABEL, TERMS } from "../copy";

const props = defineProps<{ task: Task }>();
const $q = useQuasar();

const projectName = computed(() => projectById(props.task.projectId || undefined)?.name || "");
const editDialog = ref(false);
const draftTitle = ref(props.task.title);
const draftNotes = ref(props.task.notes || "");
const wipDialog = ref(false);
const wipActive = ref<any[]>([]);

function fmt(ms: number) { return new Date(ms).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }
function toggleDone(v: boolean) { v ? completeTask(props.task.id) : uncompleteTask(props.task.id); }
function snooze(days: number) { snoozeTask(props.task.id, Date.now() + days * 86400000); }
function unsnooze(id: string) { unsnoozeTask(id); }
function remove() {
  $q.dialog({ title: "Delete task", message: "Delete this task?", cancel: true, persistent: true })
    .onOk(() => deleteTask(props.task.id));
}
function saveEdit() { updateTask(props.task.id, { title: draftTitle.value, notes: draftNotes.value }); }
function setHat() {
  $q.dialog({
    title: "Change hat", options: { type: "radio", model: props.task.hatId,
      items: state.hats.map((h) => ({ label: h.name, value: h.key })) }, cancel: true,
  }).onOk((hat: string) => updateTask(props.task.id, { hatId: hat }));
}
function setProject() {
  const items = [
    { label: "— No project —", value: "" },
    ...state.projects.map((p) => ({ label: p.name, value: p.id })),
  ];
  $q.dialog({
    title: "Move to project",
    options: { type: "radio", model: props.task.projectId || "", items },
    cancel: true,
  }).onOk((projectId: string) => moveTaskToProject(props.task.id, projectId || null));
}
async function activateTask() {
  try {
    const r = await activate(props.task.id);
    if ("wip3" in r) { wipActive.value = r.activeTasks; wipDialog.value = true; }
    else $q.notify({ type: "positive", message: "Now in focus" });
  } catch (e: any) {
    $q.notify({ type: "negative", message: e?.message || "Couldn’t do that (needs connection)" });
  }
}
async function bumpAndActivate(bumpId: string) {
  wipDialog.value = false;
  try {
    await activate(props.task.id, bumpId);
    $q.notify({ type: "positive", message: "Swapped — this is now in focus" });
  } catch (e: any) { $q.notify({ type: "negative", message: e?.message || "Failed" }); }
}
// keep STATUS_LABEL referenced for template clarity
void STATUS_LABEL;
</script>
