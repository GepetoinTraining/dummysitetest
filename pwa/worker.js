// ============================================================
// StudySync Worker — the entire app
//
// Reads SQLite, builds HTML, runs AI, posts to porthole.
// The main thread is a display surface. This is the brain.
// ============================================================

importScripts('sql-wasm.js');

let db = null;

// -----------------------------------------------------------
// Boot
// -----------------------------------------------------------

async function boot() {
  // Initialize SQLite via sql.js WASM
  const SQL = await initSqlJs({
    locateFile: file => file  // sql-wasm.wasm in same directory
  });

  // Try to load existing DB from IndexedDB
  const saved = await loadFromIndexedDB();
  if (saved) {
    db = new SQL.Database(new Uint8Array(saved));
  } else {
    db = new SQL.Database();
    initSchema();
    seedData();
  }

  postMessage({ type: 'ready' });

  // Render initial view
  renderDashboard();

  // Auto-save DB to IndexedDB periodically
  setInterval(() => saveToIndexedDB(), 30000);
}

// -----------------------------------------------------------
// Schema — same as our schema.sql, inline
// -----------------------------------------------------------

function initSchema() {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS disciplines (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#a68b5b',
      icon TEXT NOT NULL DEFAULT 'book',
      category TEXT NOT NULL DEFAULT 'general',
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS professors (
      id TEXT PRIMARY KEY,
      discipline_id TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT,
      metadata TEXT NOT NULL DEFAULT '{}',
      notes TEXT
    );
    CREATE TABLE IF NOT EXISTS goals (
      id TEXT PRIMARY KEY,
      discipline_id TEXT NOT NULL,
      target_grade REAL NOT NULL,
      set_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS grades (
      id TEXT PRIMARY KEY,
      discipline_id TEXT NOT NULL,
      value REAL NOT NULL,
      source TEXT NOT NULL,
      recorded_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS memory_nodes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      scope TEXT NOT NULL,
      contact_id TEXT,
      discipline_id TEXT,
      tag TEXT NOT NULL,
      label TEXT NOT NULL,
      xp REAL NOT NULL DEFAULT 1,
      tier INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      last_bumped_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS memory_edges (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      relation TEXT NOT NULL,
      weight REAL NOT NULL DEFAULT 0.5,
      label TEXT
    );
    CREATE TABLE IF NOT EXISTS study_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      discipline_id TEXT NOT NULL,
      skill_file TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      duration_seconds INTEGER,
      self_assessment REAL,
      ai_assessment REAL,
      combined_score REAL
    );
    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      session_id TEXT,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);
}

// -----------------------------------------------------------
// Seed — minimal first-run data
// -----------------------------------------------------------

function seedData() {
  const now = Math.floor(Date.now() / 1000);
  db.run(`INSERT INTO users (id, name, created_at) VALUES ('usr_001', 'Student', ${now})`);
}

// -----------------------------------------------------------
// HTML Builder — reads DB, outputs HTML strings
// -----------------------------------------------------------

function renderDashboard() {
  const user = queryOne('SELECT * FROM users WHERE id = ?', ['usr_001']);
  const disciplines = queryAll('SELECT * FROM disciplines WHERE user_id = ? ORDER BY created_at', ['usr_001']);
  const activeSessions = queryAll("SELECT * FROM study_sessions WHERE user_id = ? AND status = 'active'", ['usr_001']);

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
    ? renderDisciplineView(disciplines[0])
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

function renderDisciplineView(disc) {
  const meta = JSON.parse(disc.metadata || '{}');
  const prof = queryOne('SELECT * FROM professors WHERE discipline_id = ?', [disc.id]);
  const goal = queryOne('SELECT target_grade FROM goals WHERE discipline_id = ? ORDER BY set_at DESC LIMIT 1', [disc.id]);
  const grade = queryOne('SELECT value FROM grades WHERE discipline_id = ? ORDER BY recorded_at DESC LIMIT 1', [disc.id]);
  const tags = queryAll("SELECT tag, tier, xp FROM memory_nodes WHERE user_id = 'usr_001' AND discipline_id = ? AND scope = 'global' ORDER BY tier DESC, xp DESC", [disc.id]);

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
      handleInput(msg.bind, msg.value, msg.id);
      break;
  }
};

function handleAction(action, id, value) {
  switch (action) {
    case 'add_discipline':
      renderAddDisciplineModal();
      break;

    case 'select_tab': {
      const discId = id.replace('tab-', '');
      const disc = queryOne('SELECT * FROM disciplines WHERE id = ?', [discId]);
      if (disc) {
        postMessage({
          type: 'patch',
          id: 'main-content',
          payload: `<div id="main-content" style="flex: 1; overflow-y: auto; padding: var(--md);">${renderDisciplineView(disc)}</div>`,
        });
      }
      break;
    }

    case 'start_session': {
      const sessId = uid();
      const now = Math.floor(Date.now() / 1000);
      db.run(
        "INSERT INTO study_sessions (id, user_id, discipline_id, status, started_at) VALUES (?, 'usr_001', ?, 'active', ?)",
        [sessId, id, now]
      );
      renderDashboard();
      break;
    }

    case 'open_chat':
      renderChat();
      break;

    case 'close_modal':
      renderDashboard();
      break;

    default:
      console.log('Unhandled action:', action);
  }
}

function handleSubmit(action, data) {
  switch (action) {
    case 'create_discipline': {
      const discId = uid();
      const profId = uid();
      const goalId = uid();
      const now = Math.floor(Date.now() / 1000);
      const color = ['#a68b5b', '#6b8f4e', '#c46b2a', '#3d7db5', '#5c5c6b', '#8a9ba8'][
        queryAll('SELECT id FROM disciplines WHERE user_id = ?', ['usr_001']).length % 6
      ];

      db.run(
        "INSERT INTO disciplines (id, user_id, name, color, category, created_at) VALUES (?, 'usr_001', ?, ?, 'general', ?)",
        [discId, data.discipline_name, color, now]
      );
      db.run(
        "INSERT INTO professors (id, discipline_id, name) VALUES (?, ?, ?)",
        [profId, discId, data.teacher_name || 'Unknown']
      );
      db.run(
        "INSERT INTO goals (id, discipline_id, target_grade, set_at) VALUES (?, ?, 0.8, ?)",
        [goalId, discId, now]
      );

      saveToIndexedDB();
      renderDashboard();
      break;
    }

    case 'send_chat': {
      const msgId = uid();
      const now = Math.floor(Date.now() / 1000);
      db.run(
        "INSERT INTO chat_messages (id, user_id, role, content, created_at) VALUES (?, 'usr_001', 'user', ?, ?)",
        [msgId, data.message, now]
      );

      // TODO: call Ollama here for AI response
      const aiId = uid();
      db.run(
        "INSERT INTO chat_messages (id, user_id, role, content, created_at) VALUES (?, 'usr_001', 'assistant', ?, ?)",
        [aiId, 'Ollama integration coming soon. The engine is ready.', now]
      );

      renderChat();
      break;
    }
  }
}

function handleInput(bind, value, id) {
  // For live-binding inputs to DB (future)
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
  postMessage({ type: 'html', payload: document.getElementById ? html : html });
}

function renderChat() {
  const messages = queryAll(
    "SELECT role, content, created_at FROM chat_messages WHERE user_id = 'usr_001' ORDER BY created_at DESC LIMIT 50",
    []
  ).reverse();

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
// DB helpers
// -----------------------------------------------------------

function queryOne(sql, params) {
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  if (stmt.step()) {
    const cols = stmt.getColumnNames();
    const vals = stmt.get();
    stmt.free();
    const row = {};
    cols.forEach((c, i) => row[c] = vals[i]);
    return row;
  }
  stmt.free();
  return null;
}

function queryAll(sql, params) {
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  const rows = [];
  const cols = stmt.getColumnNames();
  while (stmt.step()) {
    const vals = stmt.get();
    const row = {};
    cols.forEach((c, i) => row[c] = vals[i]);
    rows.push(row);
  }
  stmt.free();
  return rows;
}

function uid() {
  const arr = new Uint8Array(12);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}

function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// -----------------------------------------------------------
// IndexedDB persistence
// -----------------------------------------------------------

function saveToIndexedDB() {
  if (!db) return;
  const data = db.export();
  const request = indexedDB.open('studysync', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('db');
  request.onsuccess = () => {
    const tx = request.result.transaction('db', 'readwrite');
    tx.objectStore('db').put(data, 'main');
  };
}

function loadFromIndexedDB() {
  return new Promise((resolve) => {
    const request = indexedDB.open('studysync', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('db');
    request.onsuccess = () => {
      const tx = request.result.transaction('db', 'readonly');
      const get = tx.objectStore('db').get('main');
      get.onsuccess = () => resolve(get.result || null);
      get.onerror = () => resolve(null);
    };
    request.onerror = () => resolve(null);
  });
}

// -----------------------------------------------------------
// Boot
// -----------------------------------------------------------

boot();
