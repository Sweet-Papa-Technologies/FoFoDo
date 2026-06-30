<template>
  <q-layout view="hHh lpR fFf">
    <!-- Auth gate -->
    <template v-if="!state.ready">
      <q-page-container><q-page class="flex flex-center"><q-spinner size="40px" color="primary" /></q-page></q-page-container>
    </template>

    <Login v-else-if="!state.user" />

    <template v-else>
      <q-header elevated class="bg-dark">
        <q-toolbar>
          <q-btn flat dense round icon="menu" @click="drawer = !drawer" aria-label="Menu" />
          <q-toolbar-title class="row items-center no-wrap">
            <span class="text-weight-bold">FoFoDo</span>
            <q-chip dense square class="wip-pill q-ml-sm" :color="activeCount >= 3 ? 'negative' : 'primary'" text-color="white">
              {{ activeCount }}/3 active
            </q-chip>
            <q-icon v-if="!state.online" name="cloud_off" class="q-ml-sm" size="18px">
              <q-tooltip>Offline — changes sync on reconnect</q-tooltip>
            </q-icon>
          </q-toolbar-title>
          <q-btn flat dense round icon="search" to="/search" aria-label="Search" />
        </q-toolbar>
        <CaptureBox />
      </q-header>

      <q-drawer v-model="drawer" :width="240" show-if-above bordered class="bg-dark">
        <q-list padding>
          <q-item clickable v-ripple :to="'/'" exact><q-item-section avatar><q-icon name="dashboard" /></q-item-section><q-item-section>Home</q-item-section></q-item>
          <q-item clickable v-ripple to="/tasks/today"><q-item-section avatar><q-icon name="bolt" /></q-item-section><q-item-section>Your 3 (Active)</q-item-section></q-item>
          <q-item clickable v-ripple to="/tasks/next"><q-item-section avatar><q-icon name="arrow_forward" /></q-item-section><q-item-section>Next</q-item-section></q-item>
          <q-item clickable v-ripple to="/tasks/inbox"><q-item-section avatar><q-icon name="inbox" /></q-item-section><q-item-section>Inbox</q-item-section>
            <q-item-section side v-if="inboxCount"><q-badge color="accent" text-color="dark">{{ inboxCount }}</q-badge></q-item-section></q-item>
          <q-item clickable v-ripple to="/tasks/snoozed"><q-item-section avatar><q-icon name="snooze" /></q-item-section><q-item-section>Snoozed</q-item-section></q-item>
          <q-item clickable v-ripple to="/tasks/done"><q-item-section avatar><q-icon name="check_circle" /></q-item-section><q-item-section>Done</q-item-section></q-item>
          <q-separator class="q-my-sm" />
          <q-item-label header>By Hat</q-item-label>
          <q-item v-for="h in state.hats" :key="h.id" clickable v-ripple dense
                  :to="`/tasks/by_hat?hat=${h.key}`"
                  :active="route.path === '/tasks/by_hat' && route.query.hat === h.key"
                  active-class="text-primary bg-grey-9">
            <q-item-section avatar><span class="hat-dot" :style="{ background: hatColor(h.key) }" /></q-item-section>
            <q-item-section>{{ h.name }}</q-item-section>
          </q-item>

          <q-separator class="q-my-sm" />
          <q-item-label header class="row items-center justify-between no-wrap">
            <span>Projects</span>
            <q-btn flat dense round size="sm" icon="add" to="/projects" aria-label="New project" />
          </q-item-label>
          <q-item v-for="p in activeProjects" :key="p.id" clickable v-ripple dense
                  :to="`/tasks/by_project?project=${p.id}`"
                  :active="route.path === '/tasks/by_project' && route.query.project === p.id"
                  active-class="text-primary bg-grey-9">
            <q-item-section avatar><span class="hat-dot" :style="{ background: hatColor(p.hatId) }" /></q-item-section>
            <q-item-section class="ellipsis">{{ p.name }}</q-item-section>
            <q-item-section side><q-icon v-if="p.isActiveBet" name="star" size="15px" color="accent" /></q-item-section>
          </q-item>
          <q-item v-if="!activeProjects.length" dense>
            <q-item-section class="text-grey text-caption">No projects yet</q-item-section>
          </q-item>
          <q-item clickable v-ripple to="/projects" dense>
            <q-item-section avatar><q-icon name="folder_open" size="20px" /></q-item-section>
            <q-item-section class="text-caption">Manage projects</q-item-section>
          </q-item>

          <q-separator class="q-my-sm" />
          <q-item clickable v-ripple to="/settings"><q-item-section avatar><q-icon name="settings" /></q-item-section><q-item-section>Settings</q-item-section></q-item>
          <q-item clickable v-ripple @click="logout"><q-item-section avatar><q-icon name="logout" /></q-item-section><q-item-section>Sign out</q-item-section></q-item>
        </q-list>
      </q-drawer>

      <q-page-container>
        <router-view />
      </q-page-container>
    </template>
  </q-layout>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useRoute } from "vue-router";
import Login from "./views/Login.vue";
import CaptureBox from "./components/CaptureBox.vue";
import { state, activeCount, logout } from "./store";
import { hatColor } from "./hats";

const route = useRoute();
const drawer = ref(false);
const inboxCount = computed(() => state.tasks.filter((t) => t.status === "inbox").length);
// Active + snoozed projects shown in the sidebar (paused ones live on the manager page).
const activeProjects = computed(() => state.projects.filter((p) => p.status !== "paused"));
</script>
