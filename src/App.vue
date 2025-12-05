<script setup>
import { ref, onMounted, nextTick } from 'vue'
import axios from 'axios'

const rawHtml = ref('');
// Force this to match your Vercel deployment URL
const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

const BUS_URL = isLocal 
    ? 'https://dummysitetest.vercel.app/api/bus' // Absolute URL for Local Dev
    : '/api/bus';                                // Relative URL for Production
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

// ⚡ 1. THE DEFIBRILLATOR (Revive Scripts)
const reviveScripts = () => {
  const container = document.querySelector('.manifold-viewport');
  if (!container) return;

  // Find all scripts that came from the backend
  const scripts = container.querySelectorAll('script');
  
  scripts.forEach(oldScript => {
    const newScript = document.createElement('script');
    
    // Clone attributes (src, id, type)
    Array.from(oldScript.attributes).forEach(attr => {
      newScript.setAttribute(attr.name, attr.value);
    });
    
    // Clone content
    newScript.appendChild(document.createTextNode(oldScript.innerHTML));
    
    // Replace (This triggers execution)
    oldScript.parentNode.replaceChild(newScript, oldScript);
  });
  
  console.log(`[Pulse] Revived ${scripts.length} physics nodes.`);
};

// ⚡ 2. THE HEARTBEAT
const beat = async () => {
  // ... (Keep your existing Vital Signs / Rate logic here) ...

  try {
    const params = new URLSearchParams(window.location.search);
    const path = params.get('q') || 'dashboard';
    
    const { data } = await axios.get(`${BUS_URL}?mode=view&path=${path}`);
    
    // 🟢 THE FIX IS HERE
    if (data.html && data.html !== rawHtml.value) {
      rawHtml.value = data.html;
      
      // 🛑 WAIT for the DOM to actually update
      await nextTick(); 
      
      // ⚡ NOW shock the system
      reviveScripts();
    }
  } catch (e) {
    console.warn("Pulse missed:", e.message);
  }

  pollTimer = setTimeout(beat, currentRate);
};

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