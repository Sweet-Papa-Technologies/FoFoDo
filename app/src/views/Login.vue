<template>
  <q-page-container>
    <q-page class="flex flex-center column q-pa-md">
      <div class="text-h3 text-weight-bold q-mb-xs">FoFoDo</div>
      <div class="text-subtitle1 text-grey q-mb-lg text-center" style="max-width: 420px">
        Capture anything. Commit to three. The limit is the feature.
      </div>

      <q-card flat bordered class="fofo-tile q-pa-lg" style="width: 360px; max-width: 92vw">
        <q-btn class="full-width q-mb-md" color="primary" icon="login" label="Continue with Google" @click="google" :loading="busy" />
        <q-separator class="q-my-md" /><div class="text-center text-caption text-grey q-mb-sm">or with email</div>
        <q-input v-model="email" dense filled label="Email" type="email" class="q-mb-sm" />
        <q-input v-model="password" dense filled label="Password" type="password" class="q-mb-md" @keyup.enter="emailAuth" />
        <div class="row q-gutter-sm">
          <q-btn class="col" outline color="primary" label="Sign in" @click="emailAuth(false)" :loading="busy" />
          <q-btn class="col" flat color="primary" label="Create account" @click="emailAuth(true)" :loading="busy" />
        </div>
      </q-card>
      <div class="text-caption text-grey q-mt-lg">Self-hostable · MIT · API + MCP first</div>
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
