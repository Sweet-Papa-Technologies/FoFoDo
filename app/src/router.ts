import { createRouter, createWebHistory } from "vue-router";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", name: "dashboard", component: () => import("./views/Dashboard.vue") },
    { path: "/tasks/:view", name: "tasks", component: () => import("./views/Tasks.vue"), props: true },
    { path: "/search", name: "search", component: () => import("./views/Search.vue") },
    { path: "/settings", name: "settings", component: () => import("./views/Settings.vue") },
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
});
