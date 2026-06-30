<template>
  <q-page class="q-px-md" style="padding-top: var(--margin-focus); padding-bottom: 96px">
   <div class="focus-col">
    <div class="headline-lg q-mb-lg">Settings</div>

    <!-- Preferences -->
    <q-card flat bordered class="fofo-tile q-mb-md">
      <q-card-section>
        <q-toggle :model-value="state.settings.aiEnabled" @update:model-value="v => save({ aiEnabled: v })"
                  label="AI helpers" color="secondary" />
        <div class="text-caption text-grey q-ml-lg">Master on/off switch. When off, FoFoDo makes zero AI calls and every feature still works.</div>
        <q-separator class="q-my-sm" />
        <q-toggle :model-value="state.settings.cadencePrompts" @update:model-value="v => save({ cadencePrompts: v })"
                  label="Review reminders" />
        <div class="text-caption text-grey q-ml-lg">Gentle daily / weekly nudges to pick your 3 and do a quick review.</div>
        <q-separator class="q-my-sm" />
        <div class="row items-center q-gutter-md">
          <span>Theme</span>
          <q-btn-toggle :model-value="state.settings.theme" @update:model-value="v => save({ theme: v })"
                        no-caps rounded unelevated :options="[{label:'Dark',value:'dark'},{label:'Light',value:'light'}]" color="grey-9" toggle-color="primary" />
        </div>
        <q-separator class="q-my-sm" />
        <q-btn flat dense no-caps color="primary" icon="sym_o_replay" label="Replay the welcome tour" @click="replayTour" />
      </q-card-section>
    </q-card>

    <!-- Hats -->
    <q-card flat bordered class="fofo-tile q-mb-md">
      <q-card-section>
        <div class="text-subtitle2 q-mb-xs">Your hats</div>
        <div class="text-caption text-grey q-mb-sm">The four areas every task belongs to. Rename them to fit your life — the four slots are fixed.</div>
        <div v-for="h in state.hats" :key="h.id" class="row items-center q-gutter-sm q-mb-xs">
          <span class="hat-dot" :style="{ background: hatColor(h.key) }" />
          <q-input dense filled :model-value="h.name" @change="(v: any) => renameHat(h.id, String(v))" style="max-width: 220px" />
          <span class="text-caption text-grey">{{ hatDesc(h.key) }}</span>
        </div>
      </q-card-section>
    </q-card>

    <!-- Connect apps & agents (MCP) -->
    <q-card flat bordered class="fofo-tile q-mb-md">
      <q-card-section>
        <div class="row items-center justify-between">
          <div class="text-subtitle2">Connect apps & agents</div>
          <q-btn dense color="primary" text-color="dark" unelevated icon="sym_o_hub" label="Connect" @click="connectOpen = true" />
        </div>
        <div class="text-caption text-grey">
          Let Claude and other AI agents drive FoFoDo over MCP — one-click browser approval (OAuth) or an API key,
          plus SSE setup and ready-to-paste config. Endpoint: <code>{{ origin }}/mcp</code>.
        </div>
      </q-card-section>
    </q-card>

    <!-- API keys -->
    <q-card flat bordered class="fofo-tile q-mb-md">
      <q-card-section>
        <div class="row items-center justify-between">
          <div class="text-subtitle2">API keys (for REST & MCP)</div>
          <q-btn dense color="primary" outline icon="add" label="New key" @click="newKey" :loading="keysBusy" />
        </div>
        <div class="text-caption text-grey q-mb-sm">Keys authenticate the REST API and the MCP server. Shown once, stored hashed.</div>
        <q-banner v-if="freshKey" dense class="bg-green-9 text-white q-mb-sm">
          Copy now — shown once:<br /><code class="text-caption">{{ freshKey }}</code>
          <template #action><q-btn flat dense label="Copy" @click="copy(freshKey)" /></template>
        </q-banner>
        <q-list>
          <q-item v-for="k in keys" :key="k.id" dense>
            <q-item-section>
              <q-item-label>{{ k.name }} <span class="text-grey text-caption">{{ k.prefix }}…</span></q-item-label>
              <q-item-label caption>{{ k.revoked ? 'revoked' : 'active' }} · created {{ fmt(k.createdAt) }}</q-item-label>
            </q-item-section>
            <q-item-section side v-if="!k.revoked"><q-btn flat dense color="negative" label="Revoke" @click="revoke(k.id)" /></q-item-section>
          </q-item>
          <q-item v-if="!keys.length"><q-item-section class="text-grey">No keys yet.</q-item-section></q-item>
        </q-list>
        <div class="text-caption text-grey q-mt-sm">MCP endpoint: <code>{{ origin }}/mcp</code> · REST base: <code>{{ origin }}/api</code></div>
      </q-card-section>
    </q-card>

    <!-- Data ownership -->
    <q-card flat bordered class="fofo-tile q-mb-md">
      <q-card-section>
        <div class="text-subtitle2 q-mb-sm">Your data</div>
        <div class="row q-gutter-sm">
          <q-btn outline color="primary" icon="download" label="Export JSON" @click="exportJson" :loading="expBusy" />
          <q-btn outline color="primary" icon="table_view" label="Tasks CSV" @click="exportCsv" />
          <q-space />
          <q-btn flat color="negative" icon="delete_forever" label="Delete account" @click="del" />
        </div>
      </q-card-section>
    </q-card>

    <div class="text-caption text-grey text-center">FoFoDo v1 · {{ state.user?.email }} · MIT</div>
    <ConnectModal v-model="connectOpen" @key-created="loadKeys" />
   </div>
  </q-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useQuasar } from "quasar";
import { state, saveSettings, renameHat } from "../store";
import { api } from "../api";
import { hatColor } from "../hats";
import { HAT_DESC } from "../copy";
import { startTour } from "../onboarding";
import ConnectModal from "../components/ConnectModal.vue";

const $q = useQuasar();
const hatDesc = (k: string) => HAT_DESC[k] || k;
const replayTour = () => startTour(false);
const connectOpen = ref(false);
const keys = ref<any[]>([]);
const freshKey = ref("");
const keysBusy = ref(false); const expBusy = ref(false);
const origin = location.origin;

const save = (p: Record<string, any>) => saveSettings(p);
const fmt = (ms: number) => new Date(ms).toLocaleDateString();

onMounted(loadKeys);
async function loadKeys() {
  try { keys.value = (await api.listKeys()).keys || []; } catch { /* offline */ }
}
async function newKey() {
  $q.dialog({ title: "New API key", prompt: { model: "", type: "text" }, cancel: true }).onOk(async (name: string) => {
    keysBusy.value = true;
    try { const r = await api.createKey(name || "API key"); freshKey.value = r.plaintext; await loadKeys(); }
    catch (e: any) { $q.notify({ type: "negative", message: e?.message || "Needs connection" }); }
    finally { keysBusy.value = false; }
  });
}
async function revoke(id: string) {
  try { await api.revokeKey(id); await loadKeys(); $q.notify({ message: "Revoked" }); }
  catch (e: any) { $q.notify({ type: "negative", message: e?.message }); }
}
function copy(s: string) { navigator.clipboard?.writeText(s); $q.notify({ message: "Copied" }); }

async function exportJson() {
  expBusy.value = true;
  try {
    const data = await api.exportAll();
    download(JSON.stringify(data, null, 2), "fofodo-export.json", "application/json");
  } catch { $q.notify({ type: "negative", message: "Needs connection" }); }
  finally { expBusy.value = false; }
}
function exportCsv() {
  const rows = [["id", "title", "hat", "status", "due", "createdAt"]];
  for (const t of state.tasks) rows.push([t.id, csv(t.title), t.hatId, t.status, t.due ? new Date(t.due).toISOString() : "", new Date(t.createdAt).toISOString()]);
  download(rows.map((r) => r.join(",")).join("\n"), "fofodo-tasks.csv", "text/csv");
}
function csv(s: string) { return `"${(s || "").replace(/"/g, '""')}"`; }
function download(content: string, name: string, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name; a.click(); URL.revokeObjectURL(a.href);
}
function del() {
  $q.dialog({ title: "Delete account", message: "This permanently deletes ALL your data. Type DELETE to confirm.",
    prompt: { model: "", type: "text" }, cancel: true, persistent: true }).onOk(async (v: string) => {
    if (v !== "DELETE") { $q.notify({ type: "warning", message: "Not confirmed" }); return; }
    try { await api.deleteAccount(); $q.notify({ message: "Deleted. Signing out." }); setTimeout(() => location.reload(), 1200); }
    catch (e: any) { $q.notify({ type: "negative", message: e?.message }); }
  });
}
</script>
