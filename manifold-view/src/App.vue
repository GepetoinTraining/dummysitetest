<script setup>
import { ref, onMounted, nextTick } from 'vue'
import axios from 'axios'

const BUS_URL = '/api/bus'
const POLL_RATE = 200 // ms

const rawHtml = ref('<div style="color:gray; padding:20px; font-family:monospace;">Connecting to Manifold...</div>')

// --- 1. THE PULSE (Receiver) ---
const fetchSignal = async () => {
  try {
    // Mode 'view' gets the latest HTML snapshot
    const { data } = await axios.get(`${BUS_URL}?mode=view`)
    
    // Only update DOM if content actually changed (Simple Diff)
    if (data.html && data.html !== rawHtml.value) {
      rawHtml.value = data.html
    }
  } catch (e) {
    // Silent fail to maintain immersion
  }
  setTimeout(fetchSignal, POLL_RATE)
}

// --- 2. THE NERVOUS SYSTEM (Event Delegation) ---
const handleGlobalClick = (e) => {
  // Check if we clicked something with data-manifold-action
  const target = e.target.closest('[data-manifold-action]')
  
  if (target) {
    e.preventDefault()
    const action = target.getAttribute('data-manifold-action')
    // Collect all data- attributes as payload
    const payload = { ...target.dataset }
    
    // Fire back to the Bus
    axios.post(BUS_URL, {
      type: 'EVENT',
      action: action,
      payload: payload
    })
  }
}

onMounted(() => {
  fetchSignal()
})
</script>

<template>
  <div 
    class="manifold-viewport" 
    v-html="rawHtml"
    @click="handleGlobalClick"
  ></div>
</template>

<style>
.manifold-viewport { width: 100vw; height: 100vh; }
</style>