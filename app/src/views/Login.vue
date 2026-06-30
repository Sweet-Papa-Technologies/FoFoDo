<template>
  <q-page-container>
    <q-page class="flex flex-center column q-pa-md" style="min-height:100vh">
      <div class="display-lg" style="font-size:52px">FoFoDo</div>
      <div class="text-body1 q-mb-xl text-center" style="max-width: 420px; color:var(--on-surface-variant)">
        Capture anything. Focus on three. The limit is the feature.
      </div>

      <div class="glass-panel q-pa-lg" style="width: 380px; max-width: 92vw; border-radius: var(--radius)">
        <q-btn class="full-width q-mb-md" color="primary" text-color="dark" unelevated rounded
               icon="sym_o_login" label="Continue with Google" @click="google" :loading="busy" />
        <div class="row items-center q-my-md">
          <div class="col" style="height:1px; background:var(--surface-border)" />
          <div class="q-px-sm text-caption" style="color:var(--on-surface-variant)">or with email</div>
          <div class="col" style="height:1px; background:var(--surface-border)" />
        </div>
        <q-input v-model="email" dense outlined label="Email" type="email" class="q-mb-sm" />
        <q-input v-model="password" dense outlined label="Password" type="password" class="q-mb-md" @keyup.enter="emailAuth(false)" />
        <div class="row q-gutter-sm">
          <q-btn class="col" outline color="primary" label="Sign in" @click="emailAuth(false)" :loading="busy" />
          <q-btn class="col" flat color="primary" label="Create account" @click="emailAuth(true)" :loading="busy" />
        </div>
      </div>
      <div class="text-caption q-mt-xl" style="color:var(--on-surface-variant)">Self-hostable · MIT · API + MCP first</div>
    </q-page>
  </q-page-container>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useQuasar } from "quasar";
import { signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { auth, googleProvider } from "../firebase";

const $q = useQuasar();
const email = ref(""); const password = ref(""); const busy = ref(false);

async function google() {
  busy.value = true;
  try { await signInWithPopup(auth, googleProvider); }
  catch (e: any) { $q.notify({ type: "negative", message: e?.message || "Sign-in failed" }); }
  finally { busy.value = false; }
}
async function emailAuth(create = false) {
  if (!email.value || !password.value) return;
  busy.value = true;
  try {
    if (create) await createUserWithEmailAndPassword(auth, email.value, password.value);
    else await signInWithEmailAndPassword(auth, email.value, password.value);
  } catch (e: any) {
    $q.notify({ type: "negative", message: e?.message?.replace("Firebase:", "") || "Auth failed" });
  } finally { busy.value = false; }
}
</script>
