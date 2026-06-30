<template>
  <q-item class="fofo-tile q-mb-sm">
    <q-item-section side top>
      <q-checkbox :model-value="task.status === 'done'" @update:model-value="toggleDone" />
    </q-item-section>
    <q-item-section>
      <q-item-label :class="{ 'text-strike text-grey': task.status === 'done' }">{{ task.title }}</q-item-label>
      <q-item-label caption class="row items-center q-gutter-xs">
        <span class="hat-dot" :style="{ background: hatColor(task.hatId) }" />
        <span>{{ hatName(task.hatId) }}</span>
        <span v-if="task.due">· due {{ fmt(task.due) }}</span>
        <span v-if="task.status === 'active'" class="text-primary">· active</span>
        <span v-if="(task.pushCount || 0) > 0">· pushed {{ task.pushCount }}×</span>
      </q-item-label>
    </q-item-section>
    <q-item-section side>
      <div class="row items-center no-wrap">
        <q-btn v-if="task.status !== 'active' && task.status !== 'done'" flat round dense icon="bolt"
               color="primary" @click="activateTask" aria-label="Make active"><q-tooltip>Commit to active (WIP-3)</q-tooltip></q-btn>
        <q-btn flat round dense icon="more_vert" aria-label="Task actions">
          <q-menu>
            <q-list style="min-width: 180px">
              <q-item clickable v-close-popup @click="editDialog = true"><q-item-section>Edit</q-item-section></q-item>
              <q-item clickable v-close-popup @click="setHat"><q-item-section>Change hat…</q-item-section></q-item>
              <q-item clickable v-close-popup @click="snooze(1)"><q-item-section>Snooze 1 day</q-item-section></q-item>
              <q-item clickable v-close-popup @click="snooze(7)"><q-item-section>Snooze 1 week</q-item-section></q-item>
              <q-item v-if="task.status === 'snoozed'" clickable v-close-popup @click="unsnooze(task.id)"><q-item-section>Wake now</q-item-section></q-item>
              <q-separator />
              <q-item clickable v-close-popup @click="remove"><q-item-section class="text-negative">Delete</q-item-section></q-item>
            </q-list>
          </q-menu>
        </q-btn>
      </div>
    </q-item-section>
  </q-item>

  <!-- Edit dialog -->
  <q-dialog v-model="editDialog">
    <q-card style="min-width: 340px">
      <q-card-section class="text-subtitle1">Edit task</q-card-section>
      <q-card-section class="q-gutter-sm">
        <q-input v-model="draftTitle" filled dense label="Title" />
        <q-input v-model="draftNotes" filled dense type="textarea" label="Notes (markdown)" autogrow />
      </q-card-section>
      <q-card-actions align="right">
        <q-btn flat label="Cancel" v-close-popup />
        <q-btn color="primary" label="Save" @click="saveEdit" v-close-popup />
      </q-card-actions>
    </q-card>
  </q-dialog>

  <!-- WIP-3 bump dialog -->
  <q-dialog v-model="wipDialog">
    <q-card style="min-width: 340px">
      <q-card-section class="text-subtitle1">You're already on your 3</q-card-section>
      <q-card-section class="text-body2 text-grey">
        WIP-3 keeps you honest. Pick one to bump back to <b>Next</b> to make room — no shame in it.
      </q-card-section>
      <q-list>
        <q-item v-for="a in wipActive" :key="a.id" clickable @click="bumpAndActivate(a.id)">
          <q-item-section>{{ a.title }}</q-item-section>
          <q-item-section side><q-icon name="swap_horiz" /></q-item-section>
        </q-item>
      </q-list>
      <q-card-actions align="right"><q-btn flat label="Keep my 3" v-close-popup /></q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useQuasar } from "quasar";
import type { Task } from "../store";
import {
  activate, completeTask, uncompleteTask, snoozeTask, unsnoozeTask, deleteTask, updateTask, hatName, state,
} from "../store";
import { hatColor } from "../hats";

const props = defineProps<{ task: Task }>();
const $q = useQuasar();

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
async function activateTask() {
  try {
    const r = await activate(props.task.id);
    if ("wip3" in r) { wipActive.value = r.activeTasks; wipDialog.value = true; }
    else $q.notify({ type: "positive", message: "Committed to active" });
  } catch (e: any) {
    $q.notify({ type: "negative", message: e?.message || "Could not activate (needs connection)" });
  }
}
async function bumpAndActivate(bumpId: string) {
  wipDialog.value = false;
  try {
    await activate(props.task.id, bumpId);
    $q.notify({ type: "positive", message: "Swapped — new task is active" });
  } catch (e: any) { $q.notify({ type: "negative", message: e?.message || "Failed" }); }
}
</script>
