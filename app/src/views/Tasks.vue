<template>
  <q-page class="q-pa-md">
    <div class="row items-center justify-between q-mb-md">
      <div class="row items-center q-gutter-sm">
        <div class="text-h6">{{ title }}</div>
        <q-chip v-if="project && project.status !== 'active'" dense square color="grey-8" text-color="white">{{ project.status }}</q-chip>
        <q-icon v-if="project && project.isActiveBet" name="star" color="accent"><q-tooltip>Active Bet</q-tooltip></q-icon>
      </div>

      <!-- Project view: act on the project itself -->
      <div v-if="view === 'by_project' && project" class="row items-center q-gutter-xs">
        <q-btn dense color="primary" icon="add_task" label="Add task" @click="addTaskToProject" />
        <q-btn flat dense round icon="more_vert" aria-label="Project actions">
          <q-menu>
            <q-list style="min-width: 200px">
              <q-item clickable v-close-popup @click="makeActiveBet"><q-item-section>Set as Active Bet…</q-item-section></q-item>
              <q-item v-if="project.status === 'active'" clickable v-close-popup @click="setStatus('paused')"><q-item-section>Pause project</q-item-section></q-item>
              <q-item v-else clickable v-close-popup @click="setStatus('active')"><q-item-section>Resume project</q-item-section></q-item>
              <q-item clickable v-close-popup to="/projects"><q-item-section>Manage projects…</q-item-section></q-item>
            </q-list>
          </q-menu>
        </q-btn>
      </div>
    </div>

    <div v-if="project && project.status === 'paused'" class="text-caption text-grey q-mb-sm">
      This project is paused — its tasks are hidden from default views, but shown here.
    </div>

    <AdSlot v-if="FLAGS.ADS_ENABLED" class="q-mb-md" />

    <div v-if="!list.length" class="text-grey text-body2 q-pa-lg text-center fofo-tile">
      {{ emptyMsg }}
    </div>
    <TaskItem v-for="t in list" :key="t.id" :task="t" />
  </q-page>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { useQuasar } from "quasar";
import TaskItem from "../components/TaskItem.vue";
import AdSlot from "../components/AdSlot.vue";
import {
  viewTasks, state, projectById, createTaskInProject, setProjectStatus, setActiveBet,
} from "../store";
import { FLAGS } from "../firebase";

const props = defineProps<{ view: string }>();
const route = useRoute();
const $q = useQuasar();

const hatKey = computed(() => route.query.hat as string | undefined);
const projectId = computed(() => route.query.project as string | undefined);
const project = computed(() => (props.view === "by_project" ? projectById(projectId.value) : null));
const list = computed(() => viewTasks(props.view, hatKey.value, projectId.value));

const TITLES: Record<string, string> = {
  today: "Your 3 · Active", active: "Active", next: "Next", inbox: "Inbox",
  snoozed: "Snoozed", done: "Done (recent)", by_hat: "By Hat",
};
const title = computed(() => {
  if (props.view === "by_hat" && hatKey.value)
    return `Hat · ${state.hats.find((h) => h.key === hatKey.value)?.name || hatKey.value}`;
  if (props.view === "by_project") return project.value?.name || "Project";
  return TITLES[props.view] || "Tasks";
});

const emptyMsg = computed(() => {
  if (props.view === "by_project") return "No tasks in this project yet — add one with “Add task”.";
  return ({
    inbox: "Inbox zero. Capture lands here first.",
    next: "Nothing queued. Triage your inbox.",
    today: "No active tasks. Commit to up to three with the ⚡ button.",
    snoozed: "Nothing snoozed. Backing off is allowed when you need it.",
    done: "Nothing finished yet.",
    by_hat: "No tasks under this hat.",
  } as Record<string, string>)[props.view] || "Nothing here.";
});

function addTaskToProject() {
  if (!projectId.value) return;
  $q.dialog({ title: `Add task to “${project.value?.name}”`, prompt: { model: "", type: "text" }, cancel: true })
    .onOk((t: string) => { if (t?.trim()) createTaskInProject(t.trim(), projectId.value!); });
}
function setStatus(status: "active" | "paused") {
  if (projectId.value) setProjectStatus(projectId.value, status);
}
function makeActiveBet() {
  if (!projectId.value) return;
  $q.dialog({
    title: "Set Active Bet", message: "The one number that tells you it’s working:",
    prompt: { model: project.value?.leadingIndicator || "", type: "text" }, cancel: true,
  }).onOk((li: string) => setActiveBet(projectId.value!, li || null));
}
</script>
