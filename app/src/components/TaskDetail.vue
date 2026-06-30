<template>
  <q-dialog v-model="open" @hide="onHide" position="standard" :maximized="$q.screen.lt.sm">
    <q-card v-if="task" class="fofo-surface-container" style="width:680px; max-width:96vw">
      <!-- Header -->
      <q-card-section class="row items-start no-wrap q-gutter-sm">
        <span class="hat-bar" :style="{ background: hatColor(task.hatId), height:'28px', marginTop:'4px' }" />
        <div class="col">
          <q-input v-model="title" dense borderless class="title-md" input-class="title-md"
                   @blur="saveTitle" placeholder="Task title" />
          <div class="row items-center q-gutter-xs q-mt-xs text-caption" style="color:var(--on-surface-variant)">
            <span class="hat-dot" :style="{ background: hatColor(task.hatId) }" /> {{ hatName(task.hatId) }}
            <span v-if="projectName">· <q-icon name="sym_o_folder" size="13px" /> {{ projectName }}</span>
            <span>· {{ STATUS_LABEL[task.status] }}</span>
            <span v-if="task.due">· due {{ fmtDate(task.due) }}</span>
          </div>
        </div>
        <q-btn flat round dense icon="sym_o_close" v-close-popup aria-label="Close" />
      </q-card-section>

      <q-separator />
      <q-card-section class="q-gutter-md">
        <!-- Work status -->
        <div>
          <div class="label-caps q-mb-xs">Status</div>
          <div class="row q-gutter-xs">
            <q-chip v-for="w in WORK_STATUSES" :key="w.value" clickable dense
                    :selected="(task.workStatus || 'none') === w.value"
                    @click="setWorkStatus(task.id, w.value)"
                    :style="(task.workStatus || 'none') === w.value
                      ? `background:${w.color}; color:#1a1613; font-weight:600`
                      : 'background:var(--surface-container-high); color:var(--on-surface-variant)'">
              <q-icon :name="w.icon" size="15px" class="q-mr-xs" />{{ w.label }}
            </q-chip>
          </div>
        </div>

        <!-- Quick actions -->
        <div class="row q-gutter-xs">
          <q-btn v-if="task.status !== 'active' && task.status !== 'done'" dense unelevated color="primary" text-color="dark"
                 icon="sym_o_bolt" label="Put in focus" @click="activateTask" />
          <q-btn dense outline :color="task.status==='done' ? 'positive' : undefined"
                 :icon="task.status==='done' ? 'sym_o_check_circle' : 'sym_o_check'"
                 :label="task.status==='done' ? 'Done' : 'Complete'" @click="toggleDone" />
          <q-btn dense flat icon="sym_o_snooze" label="Later" @click="snooze(1)" />
          <q-space />
          <q-btn dense flat icon="sym_o_label" label="Hat" @click="changeHat" />
          <q-btn dense flat icon="sym_o_folder" label="Project" @click="changeProject" />
        </div>

        <!-- Notes (markdown) -->
        <div>
          <div class="row items-center justify-between">
            <div class="label-caps">Notes</div>
            <q-btn flat dense size="sm" no-caps :label="editNotes ? 'Preview' : 'Edit'"
                   :icon="editNotes ? 'sym_o_visibility' : 'sym_o_edit'" @click="toggleNotes" />
          </div>
          <q-input v-if="editNotes" v-model="notes" type="textarea" filled autogrow
                   placeholder="Markdown supported…" @blur="saveNotes" />
          <div v-else-if="notes" class="fofo-md q-pa-sm" v-html="md(notes)" />
          <div v-else class="text-caption" style="color:var(--on-surface-variant)">No notes. Click Edit to add markdown.</div>
        </div>
      </q-card-section>

      <q-separator />
      <!-- Comments -->
      <q-card-section>
        <div class="label-caps q-mb-sm">Comments ({{ comments.length }})</div>
        <div v-if="!comments.length" class="text-caption q-mb-sm" style="color:var(--on-surface-variant)">No comments yet.</div>
        <div v-for="c in comments" :key="c.id" class="q-mb-md">
          <div class="row items-center justify-between">
            <div class="text-caption" style="color:var(--on-surface-variant)"><b>{{ c.author || 'you' }}</b> · {{ fmtDate(c.createdAt) }}</div>
            <q-btn flat round dense size="xs" icon="sym_o_delete" @click="removeComment(c.id)" aria-label="Delete comment" />
          </div>
          <div class="fofo-md" v-html="md(c.body)" />
          <div v-if="c.attachments && c.attachments.length" class="row q-gutter-sm q-mt-xs">
            <template v-for="(a, i) in c.attachments" :key="i">
              <img v-if="isImage(a)" :src="a.url" :alt="a.name" style="max-width:160px; max-height:160px; border-radius:8px; border:1px solid var(--surface-border)" />
              <a v-else :href="a.url" target="_blank" rel="noopener" class="status-chip" style="text-decoration:none">
                <q-icon name="sym_o_attach_file" size="14px" /> {{ a.name }}
              </a>
            </template>
          </div>
        </div>

        <!-- Add comment -->
        <q-input v-model="newComment" type="textarea" filled autogrow dense
                 placeholder="Add a comment… markdown & images supported" class="q-mt-sm" />
        <div v-if="pending.length" class="row q-gutter-xs q-mt-xs">
          <q-chip v-for="(p, i) in pending" :key="i" dense removable @remove="pending.splice(i,1)"
                  icon="sym_o_attach_file">{{ p.name }}</q-chip>
        </div>
        <div class="row items-center q-gutter-sm q-mt-xs">
          <q-btn flat dense icon="sym_o_attach_file" :loading="uploading" label="Attach" @click="pickFile" />
          <q-space />
          <q-btn unelevated dense color="primary" text-color="dark" icon="sym_o_send" label="Comment"
                 :disable="!newComment.trim() && !pending.length" @click="postComment" />
        </div>
        <input ref="fileInput" type="file" hidden multiple accept="image/*,video/*,audio/*,.pdf,.txt,.md" @change="onFiles" />
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useQuasar } from "quasar";
import {
  state, openTask, hatName, projectById, setWorkStatus, updateTask, completeTask, uncompleteTask,
  snoozeTask, activate, watchComments, addComment, deleteComment, uploadAttachment, moveTaskToProject,
  type Comment,
} from "../store";
import { hatColor } from "../hats";
import { WORK_STATUSES, STATUS_LABEL } from "../copy";
import { renderMarkdown } from "../markdown";

const $q = useQuasar();
const open = computed({
  get: () => !!state.openTaskId && !!task.value,
  set: (v) => { if (!v) openTask(null); },
});
const task = computed(() => state.tasks.find((t) => t.id === state.openTaskId) || null);
const projectName = computed(() => projectById(task.value?.projectId || undefined)?.name || "");

const title = ref(""); const notes = ref(""); const editNotes = ref(false);
const comments = ref<Comment[]>([]); const newComment = ref(""); const pending = ref<any[]>([]);
const uploading = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
let unsub: (() => void) | null = null;

const md = (s: string) => renderMarkdown(s);
const fmtDate = (ms: number) => new Date(ms).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const isImage = (a: any) => (a.contentType || "").startsWith("image/") || /\.(png|jpe?g|gif|webp|svg)$/i.test(a.name || "");

watch(() => state.openTaskId, (id) => {
  unsub?.(); unsub = null;
  comments.value = []; newComment.value = ""; pending.value = []; editNotes.value = false;
  if (id && task.value) {
    title.value = task.value.title;
    notes.value = task.value.notes || "";
    editNotes.value = !notes.value;
    unsub = watchComments(id, (rows) => (comments.value = rows));
  }
}, { immediate: true });

function onHide() { unsub?.(); unsub = null; openTask(null); }
function saveTitle() { if (task.value && title.value.trim() && title.value !== task.value.title) updateTask(task.value.id, { title: title.value.trim() }); }
function toggleNotes() { if (editNotes.value) saveNotes(); editNotes.value = !editNotes.value; }
function saveNotes() { if (task.value && notes.value !== (task.value.notes || "")) updateTask(task.value.id, { notes: notes.value }); }
function toggleDone() { if (!task.value) return; task.value.status === "done" ? uncompleteTask(task.value.id) : completeTask(task.value.id); }
function snooze(days: number) { if (task.value) snoozeTask(task.value.id, Date.now() + days * 86400000); }
async function activateTask() {
  if (!task.value) return;
  try {
    const r = await activate(task.value.id);
    if ("wip3" in r) $q.notify({ type: "warning", message: "You're already focused on 3 — bump one from a list first." });
    else $q.notify({ type: "positive", message: "Now in focus" });
  } catch (e: any) { $q.notify({ type: "negative", message: e?.message || "Needs connection" }); }
}
function changeHat() {
  if (!task.value) return;
  $q.dialog({ title: "Change hat", options: { type: "radio", model: task.value.hatId, items: state.hats.map((h) => ({ label: h.name, value: h.key })) }, cancel: true })
    .onOk((hat: string) => updateTask(task.value!.id, { hatId: hat }));
}
function changeProject() {
  if (!task.value) return;
  const items = [{ label: "— No project —", value: "" }, ...state.projects.map((p) => ({ label: p.name, value: p.id }))];
  $q.dialog({ title: "Move to project", options: { type: "radio", model: task.value.projectId || "", items }, cancel: true })
    .onOk((pid: string) => moveTaskToProject(task.value!.id, pid || null));
}
function pickFile() { fileInput.value?.click(); }
async function onFiles(e: Event) {
  const files = (e.target as HTMLInputElement).files;
  if (!files || !task.value) return;
  uploading.value = true;
  try {
    for (const f of Array.from(files)) pending.value.push(await uploadAttachment(task.value.id, f));
  } catch (err: any) { $q.notify({ type: "negative", message: err?.message || "Upload failed" }); }
  finally { uploading.value = false; if (fileInput.value) fileInput.value.value = ""; }
}
async function postComment() {
  if (!task.value) return;
  try {
    await addComment(task.value.id, newComment.value.trim(), pending.value.slice());
    newComment.value = ""; pending.value = [];
  } catch (e: any) { $q.notify({ type: "negative", message: e?.message || "Failed to comment" }); }
}
function removeComment(id: string) {
  if (task.value) deleteComment(task.value.id, id);
}
</script>
