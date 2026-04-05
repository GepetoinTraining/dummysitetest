// ============================================================
// StudySync Worker — the entire app
//
// Reads SQLite, builds HTML, runs AI, posts to porthole.
// The main thread is a display surface. This is the brain.
// ============================================================

let db = null; // IDBDatabase instance

// -----------------------------------------------------------
// Boot
// -----------------------------------------------------------

async function boot() {
  db = await openDB();

  // Seed if first run
  const userCount = await count('users');
  if (userCount === 0) {
    await seedData();
  }

  postMessage({ type: 'ready' });
  renderDashboard();
}

// -----------------------------------------------------------
// IndexedDB — the database IS the browser
// -----------------------------------------------------------

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('studysync', 1);

    request.onupgradeneeded = (e) => {
      const idb = e.target.result;
      // Each table = an object store
      const stores = [
        'users', 'disciplines', 'professors', 'goals', 'grades',
        'memory_nodes', 'memory_edges', 'study_sessions', 'chat_messages',
        'context_ledger', 'dict_entries', 'graph_blobs', 'skill_files',
      ];
      for (const name of stores) {
        if (!idb.objectStoreNames.contains(name)) {
          idb.createObjectStore(name, { keyPath: 'id' });
        }
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// -----------------------------------------------------------
// Seed — minimal first-run data
// -----------------------------------------------------------

async function seedData() {
  const now = Math.floor(Date.now() / 1000);
  await put('users', { id: 'usr_001', name: 'Student', created_at: now });
}

// -----------------------------------------------------------
// HTML Builder — reads DB, outputs HTML strings
// -----------------------------------------------------------

async function renderDashboard() {
  const user = await get('users', 'usr_001');
  const allDisc = await getAll('disciplines');
  const disciplines = allDisc.filter(d => d.user_id === 'usr_001').sort((a, b) => a.created_at - b.created_at);

  const tabsHtml = disciplines.length > 0
    ? disciplines.map(d => `
        <div class="nav-item" id="tab-${d.id}" data-action="select_tab"
             style="padding: var(--xs) var(--sm); border-radius: 4px; cursor: pointer;
                    color: var(--text); border-left: 3px solid ${d.color};">
          ${esc(d.name)}
        </div>
      `).join('')
    : '<div style="color: var(--text-muted); font-size: 13px; padding: var(--xs);">No disciplines yet</div>';

  const mainHtml = disciplines.length > 0
    ? await renderDisciplineView(disciplines[0])
    : `
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center;
                  height: 100%; gap: var(--md); padding: var(--xl);">
        <div style="font-size: 21px; font-weight: 700;">Welcome to StudySync</div>
        <div style="color: var(--text-secondary); max-width: 400px; text-align: center; font-size: 14px;">
          Add your first discipline to begin. Your AI assistant will help you build a study plan,
          track your progress, and connect ideas across subjects.
        </div>
        <button data-action="add_discipline"
                style="background: var(--tier3); color: #faf6f1; border: none; padding: var(--xs) var(--md);
                       border-radius: 4px; cursor: pointer; font-size: 14px;">
          + Add Discipline
        </button>
      </div>`;

  const html = `
    <!-- Header -->
    <div style="height: 55px; display: flex; align-items: center; justify-content: space-between;
                padding: 0 var(--md); border-bottom: 1px solid var(--border); background: var(--panel);">
      <div style="display: flex; align-items: center; gap: var(--sm);">
        <span style="font-weight: 700; font-size: 16px;">StudySync</span>
        <span style="font-size: 11px; padding: 2px 8px; border-radius: 10px;
                     background: var(--accent-growth); color: #faf6f1; opacity: 0.8;">
          Gemma 4 E2B
        </span>
      </div>
      <div style="display: flex; gap: var(--xs);">
        <div class="icon-btn" data-action="notifications" title="Notifications">🔔</div>
        <div class="icon-btn" data-action="planner" title="Planner">📅</div>
        <div class="icon-btn" data-action="memory_web" title="Memory Web">🕸️</div>
      </div>
    </div>

    <!-- Body -->
    <div style="display: flex; flex: 1; overflow: hidden;">
      <!-- Navbar -->
      <div style="width: 220px; border-right: 1px solid var(--border); padding: var(--sm);
                  display: flex; flex-direction: column; gap: var(--xs); background: var(--panel); overflow-y: auto;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px;">
            Disciplines
          </span>
          <div class="icon-btn" data-action="add_discipline" title="Add discipline" style="font-size: 14px;">+</div>
        </div>
        ${tabsHtml}
        <div style="margin-top: auto; border-top: 1px solid var(--border); padding-top: var(--sm);">
          <div class="nav-item" data-action="open_chat"
               style="padding: var(--xs) var(--sm); cursor: pointer; color: var(--text-secondary); font-size: 13px;">
            💬 AI Assistant
          </div>
        </div>
      </div>

      <!-- Main -->
      <div id="main-content" style="flex: 1; overflow-y: auto; padding: var(--md);">
        ${mainHtml}
      </div>
    </div>

    <style>
      .icon-btn {
        cursor: pointer; padding: 4px 8px; border-radius: 4px; font-size: 16px;
        opacity: 0.6; transition: opacity 0.15s;
      }
      .icon-btn:hover { opacity: 1; }
      .nav-item:hover { background: var(--surface); }
    </style>
  `;

  postMessage({ type: 'html', payload: html });
}

async function renderDisciplineView(disc) {
  const meta = JSON.parse(disc.metadata || '{}');
  const allProfs = await getAll('professors');
  const prof = allProfs.find(p => p.discipline_id === disc.id) || null;
  const allGoals = await getAll('goals');
  const goal = allGoals.filter(g => g.discipline_id === disc.id).sort((a, b) => b.set_at - a.set_at)[0] || null;
  const allGrades = await getAll('grades');
  const grade = allGrades.filter(g => g.discipline_id === disc.id).sort((a, b) => b.recorded_at - a.recorded_at)[0] || null;
  const allNodes = await getAll('memory_nodes');
  const tags = allNodes.filter(n => n.user_id === 'usr_001' && n.discipline_id === disc.id && n.scope === 'global').sort((a, b) => b.tier - a.tier || b.xp - a.xp);

  const gradeVal = grade ? Math.round(grade.value * 100) : 0;
  const goalVal = goal ? Math.round(goal.target_grade * 100) : 80;
  const progressPct = goalVal > 0 ? Math.min(100, (gradeVal / goalVal) * 100) : 0;

  const tagsHtml = tags.length > 0
    ? tags.map(t => `
        <span style="display: inline-block; padding: 2px 10px; border-radius: 10px; font-size: 12px;
                     background: var(--tier${t.tier}); color: #faf6f1; margin: 2px;">
          ${esc(t.tag)} T${t.tier}
        </span>
      `).join('')
    : '<span style="color: var(--text-muted); font-size: 13px;">No tags yet. Start studying to build knowledge.</span>';

  return `
    <div style="display: flex; flex-direction: column; gap: var(--md); max-width: 700px;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div>
          <div style="font-size: 21px; font-weight: 700;">${esc(disc.name)}</div>
          ${prof ? `<div style="color: var(--text-secondary); font-size: 13px;">Prof. ${esc(prof.name)}</div>` : ''}
        </div>
        <button data-action="start_session" data-id="${disc.id}"
                style="background: var(--accent-growth); color: #faf6f1; border: none;
                       padding: var(--xs) var(--md); border-radius: 4px; cursor: pointer; font-size: 13px;">
          Start Session
        </button>
      </div>

      <!-- Progress -->
      <div style="background: var(--panel); border-radius: 4px; padding: var(--sm); border: 1px solid var(--border);">
        <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: var(--xs);">
          <span>Grade: ${gradeVal}%</span>
          <span>Goal: ${goalVal}%</span>
        </div>
        <div style="height: 6px; background: var(--border); border-radius: 3px; overflow: hidden;">
          <div style="height: 100%; width: ${progressPct}%; background: var(--accent-growth);
                      border-radius: 3px; transition: width 0.3s;"></div>
        </div>
      </div>

      <!-- Tags -->
      <div>
        <div style="font-size: 13px; font-weight: 600; margin-bottom: var(--xs);">Knowledge Tags</div>
        <div style="display: flex; flex-wrap: wrap; gap: 4px;">
          ${tagsHtml}
        </div>
      </div>

      ${meta.syllabus ? `
      <div>
        <div style="font-size: 13px; font-weight: 600; margin-bottom: var(--xs);">Syllabus</div>
        <div style="color: var(--text-secondary); font-size: 13px;">${esc(meta.syllabus)}</div>
      </div>` : ''}
    </div>
  `;
}

// -----------------------------------------------------------
// Action handler — DOM events come here from main thread
// -----------------------------------------------------------

onmessage = function(e) {
  const msg = e.data;

  switch (msg.type) {
    case 'action':
      handleAction(msg.action, msg.id, msg.value);
      break;
    case 'submit':
      handleSubmit(msg.action, msg.data);
      break;
    case 'input':
      break;
    case 'restore':
      restore(msg.data);
      break;
  }
};

async function handleAction(action, id, value) {
  switch (action) {
    case 'add_discipline':
      renderAddDisciplineModal();
      break;

    case 'select_tab': {
      const discId = id.replace('tab-', '');
      const disc = await get('disciplines', discId);
      if (disc) {
        postMessage({
          type: 'patch',
          id: 'main-content',
          payload: `<div id="main-content" style="flex: 1; overflow-y: auto; padding: var(--md);">${await renderDisciplineView(disc)}</div>`,
        });
      }
      break;
    }

    case 'start_session': {
      const now = Math.floor(Date.now() / 1000);
      await put('study_sessions', { id: uid(), user_id: 'usr_001', discipline_id: id, status: 'active', started_at: now });
      await backup();
      await renderDashboard();
      break;
    }

    case 'open_chat':
      await renderChat();
      break;

    case 'close_modal':
      await renderDashboard();
      break;

    default:
      console.log('Unhandled action:', action);
  }
}

async function handleSubmit(action, data) {
  switch (action) {
    case 'create_discipline': {
      const now = Math.floor(Date.now() / 1000);
      const allDisc = await getAll('disciplines');
      const color = ['#a68b5b', '#6b8f4e', '#c46b2a', '#3d7db5', '#5c5c6b', '#8a9ba8'][allDisc.length % 6];
      const discId = uid();

      await put('disciplines', { id: discId, user_id: 'usr_001', name: data.discipline_name, color, icon: 'book', category: 'general', metadata: '{}', created_at: now });
      await put('professors', { id: uid(), discipline_id: discId, name: data.teacher_name || 'Unknown', email: null, metadata: '{}', notes: null });
      await put('goals', { id: uid(), discipline_id: discId, target_grade: 0.8, set_at: now });

      await backup();
      await renderDashboard();
      break;
    }

    case 'send_chat': {
      const now = Math.floor(Date.now() / 1000);
      await put('chat_messages', { id: uid(), user_id: 'usr_001', session_id: null, role: 'user', content: data.message, created_at: now });

      // TODO: call Ollama here for AI response
      await put('chat_messages', { id: uid(), user_id: 'usr_001', session_id: null, role: 'assistant', content: 'Ollama integration coming soon. The engine is ready.', created_at: now });

      await backup();
      await renderChat();
      break;
    }
  }
}

// -----------------------------------------------------------
// Modal / Chat views
// -----------------------------------------------------------

function renderAddDisciplineModal() {
  const html = `
    <div style="position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex;
                align-items: center; justify-content: center; z-index: 100;">
      <div style="background: var(--surface); border-radius: 8px; padding: var(--lg);
                  width: 400px; max-width: 90vw; border: 1px solid var(--border);">
        <div style="font-size: 16px; font-weight: 700; margin-bottom: var(--md);">Add Discipline</div>
        <form data-action="create_discipline" style="display: flex; flex-direction: column; gap: var(--sm);">
          <input name="discipline_name" placeholder="Discipline name (e.g. Linear Algebra)" required
                 style="padding: var(--xs) var(--sm); border: 1px solid var(--border); border-radius: 4px;
                        background: var(--panel); color: var(--text); font-size: 14px; outline: none;">
          <input name="teacher_name" placeholder="Teacher name (e.g. Dr. Vasquez)"
                 style="padding: var(--xs) var(--sm); border: 1px solid var(--border); border-radius: 4px;
                        background: var(--panel); color: var(--text); font-size: 14px; outline: none;">
          <div style="display: flex; gap: var(--xs); justify-content: flex-end; margin-top: var(--xs);">
            <button type="button" data-action="close_modal"
                    style="padding: var(--xs) var(--md); border: 1px solid var(--border); border-radius: 4px;
                           background: var(--panel); color: var(--text); cursor: pointer; font-size: 13px;">
              Cancel
            </button>
            <button type="submit"
                    style="padding: var(--xs) var(--md); border: none; border-radius: 4px;
                           background: var(--accent-growth); color: #faf6f1; cursor: pointer; font-size: 13px;">
              Add
            </button>
          </div>
        </form>
      </div>
    </div>
  `;
  postMessage({ type: 'html', payload: html });
}

async function renderChat() {
  const allMsgs = await getAll('chat_messages');
  const messages = allMsgs
    .filter(m => m.user_id === 'usr_001')
    .sort((a, b) => a.created_at - b.created_at)
    .slice(-50);

  const msgsHtml = messages.map(m => `
    <div style="display: flex; flex-direction: column; align-items: ${m.role === 'user' ? 'flex-end' : 'flex-start'}; margin-bottom: var(--xs);">
      <div style="max-width: 80%; padding: var(--xs) var(--sm); border-radius: 8px; font-size: 13px;
                  background: ${m.role === 'user' ? 'var(--accent-growth)' : 'var(--panel)'};
                  color: ${m.role === 'user' ? '#faf6f1' : 'var(--text)'};">
        ${esc(m.content)}
      </div>
    </div>
  `).join('');

  postMessage({
    type: 'patch',
    id: 'main-content',
    payload: `<div id="main-content" style="flex: 1; overflow-y: auto; padding: var(--md); display: flex; flex-direction: column;">
      <div style="font-size: 16px; font-weight: 700; margin-bottom: var(--md);">AI Assistant</div>
      <div style="flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: var(--xs);">
        ${msgsHtml || '<div style="color: var(--text-muted); font-size: 13px;">Start a conversation...</div>'}
      </div>
      <form data-action="send_chat" style="display: flex; gap: var(--xs); margin-top: var(--sm);">
        <input name="message" placeholder="Ask your AI assistant..." required
               style="flex: 1; padding: var(--xs) var(--sm); border: 1px solid var(--border); border-radius: 4px;
                      background: var(--panel); color: var(--text); font-size: 14px; outline: none;">
        <button type="submit"
                style="padding: var(--xs) var(--md); border: none; border-radius: 4px;
                       background: var(--accent-growth); color: #faf6f1; cursor: pointer; font-size: 13px;">
          Send
        </button>
      </form>
    </div>`,
  });
}

// -----------------------------------------------------------
// IndexedDB helpers — replaces SQL queries
// -----------------------------------------------------------

function put(store, obj) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(obj);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function get(store, id) {
  return new Promise((resolve) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => resolve(null);
  });
}

function getAll(store) {
  return new Promise((resolve) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
  });
}

function count(store) {
  return new Promise((resolve) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(0);
  });
}

function del(store, id) {
  return new Promise((resolve) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(id);
    tx.oncomplete = () => resolve();
  });
}

// Filter helper — getAll + filter in JS
async function query(store, filterFn) {
  const all = await getAll(store);
  return filterFn ? all.filter(filterFn) : all;
}

function uid() {
  const arr = new Uint8Array(12);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}

// -----------------------------------------------------------
// Backup — export full DB to a JSON file
// Runs after every write. Student always has a local file.
// If IndexedDB dies, import the backup and keep going.
// -----------------------------------------------------------

async function backup() {
  const stores = ['users', 'disciplines', 'professors', 'goals', 'grades',
    'memory_nodes', 'memory_edges', 'study_sessions', 'chat_messages',
    'context_ledger', 'dict_entries', 'graph_blobs', 'skill_files'];

  const dump = {};
  for (const store of stores) {
    try {
      dump[store] = await getAll(store);
    } catch (e) {
      dump[store] = [];
    }
  }

  // Post to main thread for saving
  postMessage({
    type: 'backup',
    payload: JSON.stringify(dump),
  });
}

// Restore from backup file
async function restore(jsonString) {
  const dump = JSON.parse(jsonString);
  for (const [store, rows] of Object.entries(dump)) {
    for (const row of rows) {
      await put(store, row);
    }
  }
  await renderDashboard();
}

function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// -----------------------------------------------------------
// Boot
// -----------------------------------------------------------

boot();
