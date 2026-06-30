<template>
  <div class="full-width">
    <q-input
      v-model="text"
      dense
      rounded
      outlined
      autofocus
      class="glass-panel fofo-capture-input"
      input-class="fofo-font"
      placeholder="Capture a thought…  try “Email Sam tomorrow 3pm #grow”"
      @keyup.enter="save"
      :loading="saving"
      aria-label="Capture a thought"
    >
      <template #prepend><q-icon name="sym_o_add_circle" /></template>
      <template #append>
        <q-btn v-if="micSupported" flat round dense :icon="listening ? 'sym_o_mic' : 'sym_o_mic_none'"
               :color="listening ? 'negative' : undefined" @click="toggleMic" aria-label="Voice capture" />
        <q-btn flat round dense icon="sym_o_send" @click="save" :disable="!text.trim()" aria-label="Save" />
      </template>
    </q-input>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useQuasar } from "quasar";
import { capture } from "../store";

const $q = useQuasar();
const text = ref("");
const saving = ref(false);

async function save() {
  const v = text.value.trim();
  if (!v) return;
  saving.value = true;
  text.value = "";
  try {
    await capture(v); // offline-capable; Firestore queues if offline
  } catch (e: any) {
    $q.notify({ type: "negative", message: e?.message || "Could not capture" });
    text.value = v;
  } finally {
    saving.value = false;
  }
}

// REQ-CAP-03: Web Speech API voice capture; hidden where unsupported.
const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
const micSupported = !!SR;
const listening = ref(false);
let recog: any = null;

function toggleMic() {
  if (!micSupported) return;
  if (listening.value) { recog?.stop(); return; }
  recog = new SR();
  recog.lang = "en-US";
  recog.interimResults = false;
  recog.onresult = (e: any) => { text.value = (text.value + " " + e.results[0][0].transcript).trim(); };
  recog.onend = () => (listening.value = false);
  recog.onerror = () => (listening.value = false);
  listening.value = true;
  recog.start();
}
</script>
