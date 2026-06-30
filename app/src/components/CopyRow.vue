<template>
  <div class="q-mt-sm">
    <div v-if="label" class="label-caps q-mb-xs">{{ label }}</div>
    <div class="row items-center no-wrap" style="background:var(--surface-container-high); border:1px solid var(--surface-border); border-radius:10px">
      <pre v-if="block" class="col q-ma-none q-pa-sm" style="overflow-x:auto; font-size:12.5px; white-space:pre-wrap; word-break:break-all">{{ text }}</pre>
      <code v-else class="col q-pa-sm ellipsis" style="font-size:13px">{{ text }}</code>
      <q-btn flat dense round icon="sym_o_content_copy" class="q-mr-xs" @click="copy" aria-label="Copy" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useQuasar } from "quasar";
const props = defineProps<{ text: string; label?: string; block?: boolean }>();
const $q = useQuasar();
function copy() {
  navigator.clipboard?.writeText(props.text);
  $q.notify({ message: "Copied", timeout: 1000 });
}
</script>
