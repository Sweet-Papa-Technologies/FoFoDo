<template>
  <q-page class="q-px-md" style="padding-top: var(--margin-focus); padding-bottom: 96px">
   <div class="focus-col">
    <div class="row items-center justify-between q-mb-md">
      <div class="headline-lg">Projects</div>
      <q-btn dense color="primary" text-color="dark" unelevated rounded icon="sym_o_add" label="New project" @click="create" />
    </div>

    <div class="text-caption text-grey q-mb-md">
      Projects loosely group related tasks. Open one to filter to it (or use the sidebar).
      Pausing a project hides its tasks from your main lists without deleting them, and you can pick one as your Top Priority.
    </div>

    <div v-if="!state.projects.length" class="text-grey text-body2 q-pa-lg text-center fofo-tile">
      No projects yet. Create one to start grouping tasks.
    </div>

    <q-card v-for="p in state.projects" :key="p.id" flat bordered class="fofo-tile q-mb-sm">
      <q-card-section class="row items-center no-wrap q-gutter-sm">
        <span class="hat-dot" :style="{ background: hatColor(p.hatId) }" />
        <div class="col">
          <div class="row items-center q-gutter-xs">
            <span class="text-subtitle1">{{ p.name }}</span>
            <q-icon v-if="p.isActiveBet" name="sym_o_rocket_launch" color="secondary" size="18px"><q-tooltip>Top Priority</q-tooltip></q-icon>
            <q-chip v-if="p.status !== 'active'" dense square color="grey-8" text-color="white">{{ p.status }}</q-chip>
          </div>
          <div class="text-caption text-grey">
            {{ hatName(p.hatId) }} · {{ projectTaskCount(p.id) }} open task{{ projectTaskCount(p.id) === 1 ? '' : 's' }}
            <span v-if="p.isActiveBet && p.leadingIndicator"> · 📈 {{ p.leadingIndicator }}</span>
          </div>
        </div>
        <q-btn flat dense color="primary" label="Open" :to="`/tasks/by_project?project=${p.id}`" />
        <q-btn flat dense round icon="more_vert" aria-label="Project actions">
          <q-menu>
            <q-list style="min-width: 200px">
              <q-item clickable v-close-popup @click="rename(p)"><q-item-section>Rename…</q-item-section></q-item>
              <q-item clickable v-close-popup @click="changeHat(p)"><q-item-section>Change hat…</q-item-section></q-item>
              <q-item clickable v-close-popup @click="activeBet(p)"><q-item-section>Set as Top Priority…</q-item-section></q-item>
              <q-item v-if="p.status === 'active'" clickable v-close-popup @click="setProjectStatus(p.id, 'paused')"><q-item-section>Pause</q-item-section></q-item>
              <q-item v-else clickable v-close-popup @click="setProjectStatus(p.id, 'active')"><q-item-section>Resume</q-item-section></q-item>
              <q-separator />
              <q-item clickable v-close-popup @click="remove(p)"><q-item-section class="text-negative">Delete…</q-item-section></q-item>
            </q-list>
          </q-menu>
        </q-btn>
      </q-card-section>
    </q-card>
   </div>
  </q-page>
</template>

<script setup lang="ts">
import { useQuasar } from "quasar";
import {
  state, hatName, projectTaskCount, createProject, renameProject, setProjectHat,
  setProjectStatus, setActiveBet, deleteProject,
} from "../store";
import { hatColor } from "../hats";
import type { Project } from "../store";

const $q = useQuasar();

function create() {
  $q.dialog({ title: "New project", message: "Name", prompt: { model: "", type: "text" }, cancel: true })
    .onOk((name: string) => {
      if (!name?.trim()) return;
      $q.dialog({
        title: "Hat", options: { type: "radio", model: "ops",
          items: state.hats.map((h) => ({ label: h.name, value: h.key })) }, cancel: true,
      }).onOk((hat: string) => createProject(name.trim(), hat || "ops"));
    });
}
function rename(p: Project) {
  $q.dialog({ title: "Rename project", prompt: { model: p.name, type: "text" }, cancel: true })
    .onOk((n: string) => { if (n?.trim()) renameProject(p.id, n.trim()); });
}
function changeHat(p: Project) {
  $q.dialog({
    title: "Change hat", options: { type: "radio", model: p.hatId,
      items: state.hats.map((h) => ({ label: h.name, value: h.key })) }, cancel: true,
  }).onOk((hat: string) => setProjectHat(p.id, hat));
}
function activeBet(p: Project) {
  $q.dialog({
    title: "Set Top Priority", message: "The one number that tells you it’s working:",
    prompt: { model: p.leadingIndicator || "", type: "text" }, cancel: true,
  }).onOk((li: string) => setActiveBet(p.id, li || null));
}
function remove(p: Project) {
  $q.dialog({ title: "Delete project", message: `Delete “${p.name}”? Its tasks are kept (just unlinked from the project).`, cancel: true, persistent: true })
    .onOk(() => deleteProject(p.id));
}
</script>
