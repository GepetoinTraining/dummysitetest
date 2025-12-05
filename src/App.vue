<script setup>
import { ref, onMounted, nextTick } from 'vue'
import axios from 'axios'

const rawHtml = ref('');
// Force this to match your Vercel deployment URL
const BUS_URL = 'https://dummysitetest-gepetointrainings-projects.vercel.app/api/bus'; 
const POLL_RATE = 60;

const fetchSignal = async () => {
  try {
    // Law of Relativity: The Observer dictates the render
    
    // 🔴 OLD: Only sees "/", ignores "?q=students"
    // const currentPath = window.location.pathname; 

    // 🟢 NEW: Grabs the 'q' parameter effectively
    const params = new URLSearchParams(window.location.search);
    const currentPath = params.get('q') || 'dashboard'; // Default to dashboard if empty

    // Now asks the Bus for "students" instead of "/"
    const { data } = await axios.get(`${BUS_URL}?mode=view&path=${currentPath}`);
    
    if (data.html && data.html !== rawHtml.value) {
      rawHtml.value = data.html;
    }
  } catch (e) {
    console.warn("Signal Lost:", e.message);
  }
  setTimeout(fetchSignal, POLL_RATE);
};

onMounted(() => {
    fetchSignal();
});

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