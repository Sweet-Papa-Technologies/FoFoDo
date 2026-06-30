<template>
  <q-page class="q-pa-md">
    <div class="row items-center justify-between q-mb-md">
      <div class="text-h6">{{ title }}</div>
      <q-btn v-if="view !== 'done'" dense color="primary" outline icon="add" label="Project" @click="newProject" />
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
import { viewTasks, createProject, state } from "../store";
import { FLAGS } from "../firebase";

const props = defineProps<{ view: string }>();
const route = useRoute();
const $q = useQuasar();

const hatKey = computed(() => route.query.hat as string | undefined);
const list = computed(() => viewTasks(props.view, hatKey.value));

const TITLES: Record<string, string> = {
  today: "Your 3 · Active", active: "Active", next: "Next", inbox: "Inbox",
  snoozed: "Snoozed", done: "Done (recent)", by_hat: "By Hat",
};
const title = computed(() => props.view === "by_hat" && hatKey.value
  ? `Hat · ${state.hats.find((h) => h.key === hatKey.value)?.name || hatKey.value}`
  : TITLES[props.view] || "Tasks");

const emptyMsg = computed(() => ({
  inbox: "Inbox zero. Capture lands here first.",
  next: "Nothing queued. Triage your inbox.",
  today: "No active tasks. Commit to up to three with the ⚡ button.",
  snoozed: "Nothing snoozed. Backing off is allowed when you need it.",
  done: "Nothing finished yet.",
} as Record<string, string>)[props.view] || "Nothing here.");

function newProject() {
  $q.dialog({ title: "New project", prompt: { model: "", type: "text" }, cancel: true })
    .onOk((name: string) => { if (name?.trim()) createProject(name.trim(), hatKey.value || "ops"); });
}
</script>
