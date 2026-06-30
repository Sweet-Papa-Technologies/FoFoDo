<template>
  <!-- Hosted-only ad slot (REQ-HOST-01). OSS build (VITE_ADS_ENABLED off) renders nothing.
       House ad now; pluggable adapter hook for real networks later (OPEN-QUESTIONS Q5). -->
  <div v-if="FLAGS.ADS_ENABLED" class="fofo-tile q-pa-md text-center text-grey" data-ad-slot="house">
    <div class="text-overline">Sponsored</div>
    <div class="text-body2">Your focus, your data — FoFoDo is open source & self-hostable.</div>
  </div>
</template>

<script setup lang="ts">
import { FLAGS } from "../firebase";
</script>
