import { createApp } from "vue";
import { Quasar, Notify, Dialog } from "quasar";
import "@quasar/extras/material-icons/material-icons.css";
import "quasar/src/css/index.sass";
import "./styles.sass";
import App from "./App.vue";
import { router } from "./router";
import { initAuthWatch } from "./store";

const app = createApp(App);
app.use(Quasar, { plugins: { Notify, Dialog }, config: { dark: true } });
app.use(router);
initAuthWatch();
app.mount("#app");
