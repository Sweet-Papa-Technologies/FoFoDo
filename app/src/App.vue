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
          <q-item v-for="h in state.hats" :key="h.id" clickable v-ripple :to="`/tasks/by_hat?hat=${h.key}`" dense>
            <q-item-section avatar><span class="hat-dot" :style="{ background: hatColor(h.key) }" /></q-item-section>
            <q-item-section>{{ h.name }}</q-item-section>
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
import Login from "./views/Login.vue";
import CaptureBox from "./components/CaptureBox.vue";
import { state, activeCount, logout } from "./store";
import { hatColor } from "./hats";

const drawer = ref(false);
const inboxCount = computed(() => state.tasks.filter((t) => t.status === "inbox").length);
</script>
