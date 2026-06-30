<template>
  <q-dialog v-model="show" position="standard">
    <q-card class="fofo-surface-container" style="width:640px; max-width:96vw">
      <q-card-section class="row items-center justify-between">
        <div class="title-md">Connect apps & agents</div>
        <q-btn flat round dense icon="sym_o_close" v-close-popup />
      </q-card-section>
      <q-card-section class="q-pt-none text-caption" style="color:var(--on-surface-variant)">
        FoFoDo speaks <b>MCP</b> (Model Context Protocol), so AI agents can capture, list, focus and comment on your
        tasks. Connect with a one-click browser approval (OAuth) or an API key.
      </q-card-section>

      <q-tabs v-model="tab" dense align="left" class="text-primary" active-color="primary" indicator-color="primary">
        <q-tab name="claude" no-caps label="Claude" />
        <q-tab name="cli" no-caps label="Cursor / CLI" />
        <q-tab name="sse" no-caps label="SSE" />
        <q-tab name="key" no-caps label="API key" />
      </q-tabs>
      <q-separator />

      <q-card-section style="max-height:54vh; overflow:auto">
        <!-- Claude -->
        <div v-if="tab === 'claude'">
          <div class="text-body2 q-mb-sm">Add FoFoDo as a remote MCP connector — you'll approve access in a browser, no key to paste.</div>
          <ol class="q-pl-md text-body2" style="line-height:1.7">
            <li>In <b>Claude</b> (claude.ai → Settings → <b>Connectors</b>, or Claude Desktop → Settings → Connectors) choose <b>Add custom connector</b>.</li>
            <li>Paste the MCP URL below as the server URL.</li>
            <li>Click connect → a <b>FoFoDo consent screen</b> opens → sign in and <b>Approve access</b>.</li>
            <li>Done — Claude can now use the FoFoDo tools.</li>
          </ol>
          <CopyRow :text="mcpUrl" label="MCP server URL" />
        </div>

        <!-- Cursor / CLI -->
        <div v-else-if="tab === 'cli'">
          <div class="text-body2 q-mb-sm">For Claude Code, Cursor, Windsurf and other config-file MCP clients, add this server. OAuth works automatically; or use an API key (API key tab).</div>
          <CopyRow :text="cliConfig" label="mcp config (JSON)" block />
          <div class="text-caption q-mt-sm" style="color:var(--on-surface-variant)">
            CLI clients that only support stdio can bridge with <code>npx mcp-remote {{ mcpUrl }}</code>.
          </div>
        </div>

        <!-- SSE -->
        <div v-else-if="tab === 'sse'">
          <div class="text-body2 q-mb-sm">FoFoDo supports both <b>Streamable HTTP</b> (recommended, the URL above) and legacy <b>SSE</b>.</div>
          <div class="text-body2 q-mb-xs">For SSE clients, use the <b>direct function URL</b> (the Firebase CDN buffers SSE, so the clean <code>/mcp</code> host can't stream it):</div>
          <CopyRow :text="sseUrl" label="SSE endpoint (GET stream)" />
          <CopyRow :text="messagesUrl" label="Messages endpoint (POST)" />
          <div class="text-caption q-mt-sm" style="color:var(--on-surface-variant)">
            Authenticate the SSE GET with <code>Authorization: Bearer &lt;token-or-API-key&gt;</code>. Sessions are pinned to one instance for reliability.
          </div>
        </div>

        <!-- API key -->
        <div v-else>
          <div class="text-body2 q-mb-sm">Prefer a static credential (scripts, servers, FOREMAN)? Create an API key and send it as a header.</div>
          <q-btn dense unelevated color="primary" text-color="dark" icon="sym_o_key" label="Create an API key" @click="makeKey" :loading="busy" />
          <q-banner v-if="freshKey" dense class="q-mt-sm" style="background:var(--surface-container-high)">
            Copy now — shown once:
            <CopyRow :text="freshKey" label="API key" block />
          </q-banner>
          <div class="text-body2 q-mt-md q-mb-xs">Then send it with each request:</div>
          <CopyRow :text="curlExample" label="example" block />
          <div class="text-caption q-mt-sm" style="color:var(--on-surface-variant)">Manage/revoke keys below in the API keys section.</div>
        </div>
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useQuasar } from "quasar";
import CopyRow from "./CopyRow.vue";
import { api } from "../api";

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits(["update:modelValue", "key-created"]);
const $q = useQuasar();

const show = computed({ get: () => props.modelValue, set: (v) => emit("update:modelValue", v) });
const tab = ref("claude");
const busy = ref(false);
const freshKey = ref("");

const origin = location.origin;
const mcpUrl = computed(() => `${origin}/mcp`);
// SSE must use the direct Cloud Run function URL (Hosting buffers SSE).
const sseBase = "https://fofodomcp-2ulse5y3hq-uc.a.run.app";
const sseUrl = `${sseBase}/mcp/sse`;
const messagesUrl = `${sseBase}/mcp/messages`;
const cliConfig = computed(() => JSON.stringify({ mcpServers: { fofodo: { url: `${origin}/mcp` } } }, null, 2));
const curlExample = computed(() =>
  [`curl ${origin}/mcp \\`,
   `  -H 'X-API-Key: ${freshKey.value || "fofodo_..."}' \\`,
   `  -H 'content-type: application/json' \\`,
   `  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'`].join("\n"));

async function makeKey() {
  busy.value = true;
  try { const r = await api.createKey("MCP connector"); freshKey.value = r.plaintext; emit("key-created"); }
  catch (e: any) { $q.notify({ type: "negative", message: e?.message || "Needs connection" }); }
  finally { busy.value = false; }
}
</script>
