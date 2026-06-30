import { createRouter, createWebHistory } from "vue-router";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", name: "dashboard", component: () => import("./views/Dashboard.vue") },
    { path: "/tasks/:view", name: "tasks", component: () => import("./views/Tasks.vue"), props: true },
    { path: "/projects", name: "projects", component: () => import("./views/Projects.vue") },
    { path: "/board", name: "board", component: () => import("./views/Board.vue") },
    { path: "/analytics", name: "analytics", component: () => import("./views/Analytics.vue") },
    { path: "/search", name: "search", component: () => import("./views/Search.vue") },
    { path: "/settings", name: "settings", component: () => import("./views/Settings.vue") },
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
});
