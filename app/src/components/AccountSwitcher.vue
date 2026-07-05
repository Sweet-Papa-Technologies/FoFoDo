<template>
  <q-item clickable v-ripple class="sidenav-item q-py-sm">
    <q-item-section avatar style="min-width:40px">
      <q-avatar size="30px" color="primary" text-color="dark">
        <img v-if="current?.photoURL" :src="current.photoURL" referrerpolicy="no-referrer" alt="" />
        <span v-else>{{ initial(current) }}</span>
      </q-avatar>
    </q-item-section>
    <q-item-section>
      <div class="title-md ellipsis" style="font-size:14px">{{ displayName(current) }}</div>
      <div class="text-caption ellipsis" style="color:var(--on-surface-variant); font-size:11px">
        {{ current?.email || state.user?.email || "Signed in" }}
      </div>
    </q-item-section>
    <q-item-section side><q-icon name="sym_o_unfold_more" size="18px" /></q-item-section>

    <q-menu anchor="top right" self="bottom right" :offset="[0, 8]" class="fofo-surface-container">
      <q-list style="min-width: 260px" class="q-py-xs">
        <q-item-label header class="label-caps">Accounts</q-item-label>

        <!-- Other remembered accounts: switch with no re-login -->
        <template v-for="acc in others" :key="acc.id">
          <q-item clickable v-ripple v-close-popup @click="onSwitch(acc.id)">
            <q-item-section avatar style="min-width:40px">
              <q-avatar size="28px" color="secondary" text-color="dark">
                <img v-if="acc.photoURL" :src="acc.photoURL" referrerpolicy="no-referrer" alt="" />
                <span v-else>{{ initial(acc) }}</span>
              </q-avatar>
            </q-item-section>
            <q-item-section>
              <div class="ellipsis" style="font-size:14px">{{ displayName(acc) }}</div>
              <div class="text-caption ellipsis" style="color:var(--on-surface-variant); font-size:11px">{{ acc.email }}</div>
            </q-item-section>
            <q-item-section side>
              <q-btn flat dense round size="sm" icon="sym_o_close" aria-label="Remove account"
                     @click.stop="onRemove(acc)" />
            </q-item-section>
          </q-item>
        </template>

        <q-separator v-if="others.length" class="q-my-xs" style="border-color:var(--surface-border)" />

        <q-item clickable v-ripple v-close-popup @click="onAdd">
          <q-item-section avatar style="min-width:40px"><q-icon name="sym_o_person_add" size="22px" /></q-item-section>
          <q-item-section>Add another account</q-item-section>
        </q-item>
        <q-item clickable v-ripple v-close-popup @click="onSignOut">
          <q-item-section avatar style="min-width:40px"><q-icon name="sym_o_logout" size="22px" /></q-item-section>
          <q-item-section>{{ others.length ? "Sign out of this account" : "Sign out" }}</q-item-section>
        </q-item>
      </q-list>
    </q-menu>
  </q-item>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useQuasar } from "quasar";
import { state } from "../store";
import { sessions, activeAccount, addAccount, switchAccount, signOutActive, removeAccount, type Account } from "../sessions";

const $q = useQuasar();

const current = computed(() => activeAccount());
const others = computed(() => sessions.accounts.filter((a) => a.id !== sessions.activeId));

function displayName(a: Account | null): string {
  if (!a) return state.user?.displayName || state.user?.email || "Account";
  return a.displayName || a.email || "Account";
}
function initial(a: Account | null): string {
  const s = a?.displayName || a?.email || state.user?.email || "?";
  return s.charAt(0).toUpperCase();
}

function onSwitch(id: string) { switchAccount(id); }
function onAdd() { addAccount(); }

function onSignOut() {
  $q.dialog({
    title: "Sign out",
    message: others.value.length
      ? "Sign out of this account? You'll switch to another signed-in account."
      : "Sign out of FoFoDo?",
    cancel: true, persistent: true, dark: true,
  }).onOk(() => { signOutActive(); });
}

function onRemove(acc: Account) {
  $q.dialog({
    title: "Remove account",
    message: `Remove ${acc.email || "this account"} from this device? You'll need to sign in again to use it.`,
    cancel: true, persistent: true, dark: true,
  }).onOk(async () => {
    await removeAccount(acc.id);
    $q.notify({ type: "positive", message: "Account removed from this device" });
  });
}
</script>
