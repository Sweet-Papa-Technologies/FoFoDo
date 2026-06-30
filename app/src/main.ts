import { createApp } from "vue";
import { Quasar, Notify, Dialog } from "quasar";
import "@quasar/extras/material-icons/material-icons.css";
import "@quasar/extras/material-symbols-outlined/material-symbols-outlined.css";
import "quasar/src/css/index.sass";
import "intro.js/introjs.css";
import "./styles.sass";
import "./theme.css";
import App from "./App.vue";
import { router } from "./router";
import { initAuthWatch } from "./store";

const app = createApp(App);
app.use(Quasar, { plugins: { Notify, Dialog }, config: { dark: true } });
app.use(router);
initAuthWatch();
app.mount("#app");
