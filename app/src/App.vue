<template>
  <q-layout view="lHh Lpr lFf">
    <template v-if="!state.ready">
      <q-page-container><q-page class="flex flex-center"><q-spinner size="40px" color="primary" /></q-page></q-page-container>
    </template>

    <Login v-else-if="!state.user" />

    <template v-else>
      <!-- Left sidenav (desktop) / drawer (mobile) -->
      <q-drawer v-model="drawer" :width="288" show-if-above bordered class="fofo-surface-container">
        <div class="column full-height">
          <div class="q-px-lg q-pt-lg q-pb-md">
            <div class="display-lg">FoFoDo</div>
            <div class="text-body2" style="color: var(--on-surface-variant)">Stay focused.</div>
          </div>

          <q-scroll-area class="col">
            <q-list class="q-py-sm">
              <q-item v-for="it in primaryNav" :key="it.to" clickable v-ripple :to="it.to" :exact="it.exact"
                      :active="isActive(it)" active-class="fofo-active"
                      class="sidenav-item q-py-sm" :class="{ 'is-active': isActive(it) }"
                      :data-tour="it.tour">
                <q-item-section avatar style="min-width:40px"><q-icon :name="it.icon" size="22px" /></q-item-section>
                <q-item-section class="title-md">{{ it.label }}</q-item-section>
                <q-item-section side v-if="it.badge && it.badge.value">
                  <q-badge rounded color="primary" text-color="dark">{{ it.badge.value }}</q-badge>
                </q-item-section>
              </q-item>

              <div class="q-mx-md q-my-sm" style="border-top:1px solid var(--surface-border)" />
              <div class="q-px-lg q-py-xs label-caps" data-tour="hats">{{ NAV.hats }}</div>
              <q-item v-for="h in state.hats" :key="h.id" clickable v-ripple dense
                      :to="`/tasks/by_hat?hat=${h.key}`"
                      :active="isHat(h.key)" active-class="fofo-active"
                      class="sidenav-item q-py-sm" :class="{ 'is-active': isHat(h.key) }">
                <q-item-section avatar style="min-width:40px">
                  <q-icon :name="hatIcon(h.key)" size="22px" :style="{ color: hatColor(h.key) }" />
                </q-item-section>
                <q-item-section>
                  <div class="title-md">{{ h.name }}</div>
                  <div class="text-caption" style="color:var(--on-surface-variant); font-size:11px">{{ hatDesc(h.key) }}</div>
                </q-item-section>
              </q-item>

              <div class="q-mx-md q-my-sm" style="border-top:1px solid var(--surface-border)" />
              <div class="q-px-lg q-py-xs row items-center justify-between">
                <span class="label-caps">{{ NAV.projects }}</span>
                <q-btn flat dense round size="sm" icon="sym_o_add" to="/projects" aria-label="New project" />
              </div>
              <q-item v-for="p in activeProjects" :key="p.id" clickable v-ripple dense
                      :to="`/tasks/by_project?project=${p.id}`"
                      :active="isProject(p.id)" active-class="fofo-active"
                      class="sidenav-item q-py-sm" :class="{ 'is-active': isProject(p.id) }">
                <q-item-section avatar style="min-width:40px"><span class="hat-bar" :style="{ background: hatColor(p.hatId), height:'18px' }" /></q-item-section>
                <q-item-section class="ellipsis">{{ p.name }}</q-item-section>
                <q-item-section side v-if="p.isActiveBet"><q-icon name="sym_o_rocket_launch" size="16px" color="secondary" /></q-item-section>
              </q-item>
              <q-item v-if="!activeProjects.length" dense class="sidenav-item">
                <q-item-section class="text-caption" style="color:var(--on-surface-variant)">No projects yet</q-item-section>
              </q-item>
              <q-item clickable v-ripple dense to="/projects" class="sidenav-item q-py-sm">
                <q-item-section avatar style="min-width:40px"><q-icon name="sym_o_folder_open" size="20px" /></q-item-section>
                <q-item-section class="text-caption">Manage projects</q-item-section>
              </q-item>
            </q-list>
          </q-scroll-area>

          <div class="q-pa-md" style="border-top:1px solid var(--surface-border)">
            <q-item clickable v-ripple to="/settings" class="sidenav-item q-py-sm">
              <q-item-section avatar style="min-width:40px"><q-icon name="sym_o_settings" size="20px" /></q-item-section>
              <q-item-section>
                <div class="title-md" style="font-size:15px">{{ NAV.settings }}</div>
                <div class="text-caption ellipsis" style="color:var(--on-surface-variant); font-size:11px">{{ state.user.email }}</div>
              </q-item-section>
            </q-item>
            <q-item clickable v-ripple @click="logout" class="sidenav-item q-py-sm">
              <q-item-section avatar style="min-width:40px"><q-icon name="sym_o_logout" size="20px" /></q-item-section>
              <q-item-section>{{ NAV.signout }}</q-item-section>
            </q-item>
          </div>
        </div>
      </q-drawer>

      <!-- Top app bar -->
      <q-header class="fofo-header">
        <q-toolbar class="q-px-md">
          <q-btn flat dense round icon="sym_o_menu" class="lt-md" @click="drawer = !drawer" aria-label="Menu" />
          <span class="display-lg lt-md" style="font-size:24px">FoFoDo</span>
          <q-space />
          <div class="wip-pill q-mr-sm" :class="{ 'is-full': activeCount >= 3 }" data-tour="wip">
            <span class="pulse-dot" :style="{ background: activeCount >= 3 ? 'var(--primary-container)' : 'var(--hat-build)' }" />
            {{ wipText(activeCount) }}
          </div>
          <q-btn flat dense round icon="sym_o_search" to="/search" aria-label="Search" />
          <q-icon v-if="!state.online" name="sym_o_cloud_off" size="20px" class="q-ml-sm" style="color:var(--on-surface-variant)">
            <q-tooltip>Offline — changes sync when you reconnect</q-tooltip>
          </q-icon>
        </q-toolbar>
        <!-- Quick capture, centered focus column -->
        <div class="q-px-md q-pb-sm" data-tour="capture">
          <div class="focus-col"><CaptureBox /></div>
        </div>
      </q-header>

      <q-page-container>
        <router-view />
      </q-page-container>

      <!-- Global task detail modal (statuses, notes, comments) -->
      <TaskDetail />

      <!-- Mobile bottom nav (labels aligned with the sidenav) -->
      <q-footer class="lt-md" style="background:rgba(17,19,23,0.85); backdrop-filter:blur(14px); border-top:1px solid var(--surface-border)">
        <div class="row justify-around items-center q-py-xs">
          <q-btn v-for="b in bottomNav" :key="b.to" flat stack dense :to="b.to" :exact="b.exact"
                 :color="isActive(b) ? 'primary' : undefined" no-caps class="col">
            <q-icon :name="b.icon" size="22px" />
            <div style="font-size:11px; letter-spacing:0.04em">{{ b.label }}</div>
          </q-btn>
        </div>
      </q-footer>
    </template>
  </q-layout>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useRoute } from "vue-router";
import Login from "./views/Login.vue";
import CaptureBox from "./components/CaptureBox.vue";
import TaskDetail from "./components/TaskDetail.vue";
import { state, activeCount, logout } from "./store";
import { hatColor } from "./hats";
import { NAV, HAT_ICON, HAT_DESC, wipText } from "./copy";
import { maybeStartTour } from "./onboarding";

const route = useRoute();
const drawer = ref(false);
const inboxCount = computed(() => state.tasks.filter((t) => t.status === "inbox").length);
const activeProjects = computed(() => state.projects.filter((p) => p.status !== "paused"));

const hatIcon = (k: string) => HAT_ICON[k] || "sym_o_label";
const hatDesc = (k: string) => HAT_DESC[k] || "";

interface NavItem { label: string; icon: string; to: string; exact?: boolean; tour?: string; badge?: { value: number }; }
const primaryNav = computed<NavItem[]>(() => [
  { label: NAV.home, icon: "sym_o_home", to: "/", exact: true },
  { label: NAV.your3, icon: "sym_o_filter_3", to: "/tasks/today", tour: "nav-your3" },
  { label: NAV.next, icon: "sym_o_arrow_forward", to: "/tasks/next" },
  { label: NAV.inbox, icon: "sym_o_inbox", to: "/tasks/inbox", tour: "nav-inbox", badge: { value: inboxCount.value } },
  { label: NAV.snoozed, icon: "sym_o_snooze", to: "/tasks/snoozed" },
  { label: NAV.done, icon: "sym_o_check_circle", to: "/tasks/done" },
]);
const bottomNav = computed<NavItem[]>(() => [
  { label: NAV.home, icon: "sym_o_home", to: "/", exact: true },
  { label: NAV.your3, icon: "sym_o_filter_3", to: "/tasks/today" },
  { label: NAV.inbox, icon: "sym_o_inbox", to: "/tasks/inbox" },
  { label: "Search", icon: "sym_o_search", to: "/search" },
]);

function isActive(it: { to: string; exact?: boolean }) {
  if (it.to.includes("?")) return route.fullPath === it.to;
  return it.exact ? route.path === it.to : route.path === it.to && !route.query.hat && !route.query.project;
}
const isHat = (k: string) => route.path === "/tasks/by_hat" && route.query.hat === k;
const isProject = (id: string) => route.path === "/tasks/by_project" && route.query.project === id;

// First-run onboarding: fire once the real user settings have loaded.
let tourChecked = false;
watch(
  () => state.settingsLoaded,
  (loaded) => { if (loaded && !tourChecked) { tourChecked = true; maybeStartTour(); } },
  { immediate: true }
);
</script>
