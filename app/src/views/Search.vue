<template>
  <q-page class="q-px-md" style="padding-top: var(--margin-focus); padding-bottom: 96px">
   <div class="focus-col">
    <q-input v-model="q" outlined autofocus debounce="80" placeholder="Search tasks & projects…" clearable class="glass-panel">
      <template #prepend><q-icon name="search" /></template>
    </q-input>
    <div class="text-caption text-grey q-mt-xs">Searches your local cache — works offline, updates as you type.</div>

    <div v-if="q" class="q-mt-md">
      <div v-if="results.projects.length" class="text-overline text-primary q-mt-sm">Projects</div>
      <q-item v-for="p in results.projects" :key="p.id" class="fofo-tile q-mb-sm">
        <q-item-section avatar><q-icon name="folder" /></q-item-section>
        <q-item-section>{{ p.name }}</q-item-section>
      </q-item>

      <div v-if="results.tasks.length" class="text-overline text-primary q-mt-sm">Tasks</div>
      <TaskItem v-for="t in results.tasks" :key="t.id" :task="t" />

      <div v-if="!results.tasks.length && !results.projects.length" class="text-grey q-pa-lg text-center">No matches.</div>
    </div>
   </div>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import TaskItem from "../components/TaskItem.vue";
import { search } from "../store";

const q = ref("");
const results = computed(() => search(q.value || ""));
</script>
