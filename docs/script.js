/**
 * AweiClaw — Full Functional Application
 * 
 * Features:
 * - Auth system (register / login) with localStorage persistence
 * - Project management (create, switch, persist)
 * - File management (create, open local, save, download)
 * - Real AI calls via SiliconFlow API (Awei AI-Coding)
 * - Online code execution: HTML (iframe), Python (Pyodide), JS (sandbox), Three.js (CDN)
 * - AI Suggestion Library (6 languages, 100+ snippets each)
 * - Terminal copy button per line
 */

// ═══════════════════════════════════════════
//  CONSTANTS & CONFIG
// ═══════════════════════════════════════════
const AI_API_URL = 'https://api.siliconflow.cn/v1/chat/completions';
const AI_API_KEY = 'sk-fbxaigimmoyaprrgzafescggoyzowpkigtbkblkfkawvbdbx';
const AI_MODEL   = 'deepseek-ai/DeepSeek-R1-0528-Qwen3-8B';

const SNIPPET_BASE = 'snippets/';
const LANG_SNIPPET_MAP = {
  html:   'html.txt',  htm:    'html.txt',
  css:    'css.txt',
  js:     'js.txt',    jsx:    'js.txt',  ts: 'js.txt', tsx: 'js.txt',
  py:     'python.txt',
  cpp:    'cpp.txt',   cc:     'cpp.txt', cxx: 'cpp.txt', h: 'cpp.txt', hpp: 'cpp.txt',
  cs:     'cs.txt',
};

const STORAGE_KEYS = {
  users:          'aweiclaw_users',
  currentUser:    'aweiclaw_current_user',
  projects:       'aweiclaw_projects',
  currentProject: 'aweiclaw_current_project',
};

// ═══════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════
let state = {
  currentUser:    null,
  currentProject: null,
  openFiles:      [],
  activeFileId:   null,
  aiHistory:      [],
  lastAICode:     '',
  isAIStreaming:  false,
};

// ═══════════════════════════════════════════
//  CHAT STATE
// ═══════════════════════════════════════════
let chatState = {
  mode: 'craft',
  model: 'deepseek-ai/DeepSeek-R1-0528-Qwen3-8B',
  autoSave: false,
  safeMode: false,
  selectedExperts: [],
  expertCatalog: [],
  currentCategory: 'all',
  currentSessionId: null,
  sessions: {},
  messages: [],
  products: [],
  isStreaming: false,
  steps: [],
};

// AI Config (Codex-style)
let aiConfig = {
  mode:        'craft',           // craft | plan | ask
  model:       'awei-studio-master', // display model name
  permission:  'default',         // default | full
  auto:        false,             // auto mode toggle
  pendingPerm: null,             // pending permission change
};

// model display name -> (not actually switching API, just UI)
const MODEL_MULTIPLIERS = {
  'awei-studio-master': 12.31,
  'awei-ai-max':        2.8,
  'deepseek-v4':        1.3,
  'awei-ai':            1.2,
  'deepseek-r1':        0.8,
  'awei-ai-pro':        0.3,
  'awei-ai-flash':      0.15,
  'mushroom-ai-max':    0.05,
  'mushroom-ai':        0.01,
};

// ═══════════════════════════════════════════
//  SNIPPETS ENGINE
// ═══════════════════════════════════════════
let snippetsCache    = {};
let activeSuggestions = [];
let suggestActiveIdx  = -1;

async function loadSnippets(langKey) {
  const file = LANG_SNIPPET_MAP[langKey];
  if (!file) { activeSuggestions = []; return; }
  if (snippetsCache[file]) { activeSuggestions = snippetsCache[file]; return; }
  try {
    const resp = await fetch(SNIPPET_BASE + file);
    if (!resp.ok) throw new Error('Not found');
    const text  = await resp.text();
    const lines = text.split('\n').filter(l => l.trim());
    const parsed = [];
    for (const line of lines) {
      const idx = line.indexOf('|');
      if (idx === -1) continue;
      const trigger = line.substring(0, idx).replace(/\\\|/g, '|');
      const code    = line.substring(idx + 1).replace(/\\n/g, '\n').replace(/\\\|/g, '|').replace(/\\\\/g, '\\');
      parsed.push({ trigger, code });
    }
    snippetsCache[file] = parsed;
    activeSuggestions = parsed;
  } catch (_) { activeSuggestions = []; }
}

function getCurrentLangKey() {
  const file = getActiveFile();
  if (!file) return null;
  const ext = getExtension(file.name);
  return LANG_SNIPPET_MAP[ext] ? ext : null;
}

async function reloadSnippetsForFile() {
  const lang = getCurrentLangKey();
  if (!lang) { activeSuggestions = []; hideSuggestPanel(); return; }
  await loadSnippets(lang);
}

function matchSuggestions(input) {
  if (!input || input.length < 1) { hideSuggestPanel(); return; }
  const ta = document.getElementById('code-textarea');
  if (!ta) return;
  const pos       = ta.selectionStart;
  const lineStart = input.lastIndexOf('\n', pos - 1) + 1;
  const currentLine = input.substring(lineStart, pos);

  let triggerToken = '';
  if (currentLine.includes('<')) {
    const ltIdx = currentLine.lastIndexOf('<');
    triggerToken = currentLine.substring(ltIdx);
  } else {
    const match = currentLine.match(/([\w#.]+)$/);
    triggerToken = match ? match[1] : '';
  }

  if (!triggerToken) { hideSuggestPanel(); return; }

  const lower   = triggerToken.toLowerCase();
  const matches = activeSuggestions
    .filter(s => s.trigger.toLowerCase().startsWith(lower))
    .slice(0, 8);

  if (matches.length === 0) { hideSuggestPanel(); return; }
  renderSuggestions(matches, input, pos, triggerToken);
}

function renderSuggestions(matches, fullInput, cursorPos, triggerToken) {
  const panel = document.getElementById('suggest-panel');
  const list  = document.getElementById('suggest-list');
  const lang  = getCurrentLangKey();
  const langNames = {
    html:'HTML',htm:'HTML',css:'CSS',js:'JavaScript',jsx:'JavaScript',
    ts:'TypeScript',tsx:'TypeScript',py:'Python',cpp:'C++',
    cc:'C++',cxx:'C++',h:'C++',hpp:'C++',cs:'C#'
  };
  document.getElementById('suggest-lang-label').textContent =
    `${langNames[lang] || lang || ''} Suggestion Library`;

  panel.classList.remove('hidden');
  suggestActiveIdx = -1;
  list.innerHTML = '';

  matches.forEach((s, i) => {
    const item = document.createElement('div');
    item.className = 'suggest-item';
    item.setAttribute('data-index', i);
    item.innerHTML = `
      <span class="suggest-trigger">${esc(s.trigger)}</span>
      <span class="suggest-preview">${esc(getSnippetPreview(s.code))}</span>
      <span class="suggest-shortcut">${i === 0 ? 'Ctrl+Enter' : ''}</span>
    `;
    item.addEventListener('click', () => insertSuggestion(s, cursorPos, triggerToken, fullInput));
    list.appendChild(item);
  });
}

function getSnippetPreview(code) {
  const firstLine = code.split('\n')[0].trim();
  if (firstLine.length > 50) return firstLine.substring(0, 47) + '...';
  return firstLine || '(multi-line)';
}

function hideSuggestPanel() {
  document.getElementById('suggest-panel').classList.add('hidden');
  suggestActiveIdx = -1;
}

function insertSuggestion(snippet, cursorPos, triggerToken, fullInput) {
  const ta = document.getElementById('code-textarea');
  if (!ta) return;
  const beforeTrigger = fullInput.substring(0, cursorPos - triggerToken.length);
  const afterTrigger  = fullInput.substring(cursorPos);
  ta.value = beforeTrigger + snippet.code + afterTrigger;
  ta.selectionStart = ta.selectionEnd = beforeTrigger.length + snippet.code.length;
  onCodeChange();
  hideSuggestPanel();
  ta.focus();
}

function setSuggestActive(idx) {
  const items = document.querySelectorAll('#suggest-list .suggest-item');
  items.forEach(el => el.classList.remove('active'));
  if (idx >= 0 && idx < items.length) {
    items[idx].classList.add('active');
    items[idx].scrollIntoView({ block: 'nearest' });
  }
}

function pickActiveSuggestion() {
  const ta = document.getElementById('code-textarea');
  if (!ta) return;
  const pos = ta.selectionStart;
  const fullInput = ta.value;
  const lineStart = fullInput.lastIndexOf('\n', pos - 1) + 1;
  const currentLine = fullInput.substring(lineStart, pos);
  let triggerToken = '';
  if (currentLine.includes('<')) {
    triggerToken = currentLine.substring(currentLine.lastIndexOf('<'));
  } else {
    const match = currentLine.match(/([\w#.]+)$/);
    triggerToken = match ? match[1] : '';
  }
  if (!triggerToken) return;
  const lower = triggerToken.toLowerCase();
  const matches = activeSuggestions.filter(s => s.trigger.toLowerCase().startsWith(lower)).slice(0, 8);
  if (matches.length === 0) return;
  const selected = suggestActiveIdx >= 0 && suggestActiveIdx < matches.length ? matches[suggestActiveIdx] : matches[0];
  insertSuggestion(selected, pos, triggerToken, fullInput);
}

// ═══════════════════════════════════════════
//  STORAGE HELPERS
// ═══════════════════════════════════════════
function ls(key, fallback = null) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function lsSet(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function getUsers()    { return ls(STORAGE_KEYS.users, {}); }
function getProjects() { return ls(STORAGE_KEYS.projects, {}); }

// ═══════════════════════════════════════════
//  AUTH
// ═══════════════════════════════════════════
function switchAuthTab(tab) {
  document.getElementById('tab-register').classList.toggle('active', tab === 'register');
  document.getElementById('tab-login').classList.toggle('active', tab === 'login');
  document.getElementById('form-register').classList.toggle('hidden', tab !== 'register');
  document.getElementById('form-login').classList.toggle('hidden', tab !== 'login');
}

function showAuthMsg(id, msg, isError = true) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.className = 'auth-msg ' + (isError ? 'error' : 'success');
}

function handleRegister(e) {
  e.preventDefault();
  const username = document.getElementById('reg-username').value.trim();
  const email    = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const confirm  = document.getElementById('reg-confirm').value;
  const terms    = document.getElementById('reg-terms').checked;
  if (!username || !email || !password || !confirm) return showAuthMsg('reg-msg', 'Please fill in all fields.');
  if (password !== confirm) return showAuthMsg('reg-msg', 'Passwords do not match.');
  if (!terms) return showAuthMsg('reg-msg', 'Please accept the terms.');
  if (!/^[^@]+@[^@]+\.[^@]+$/.test(email)) return showAuthMsg('reg-msg', 'Invalid email address.');
  const users = getUsers();
  if (users[username]) return showAuthMsg('reg-msg', 'Username already exists.');
  if (Object.values(users).some(u => u.email === email)) return showAuthMsg('reg-msg', 'Email already registered.');
  users[username] = { username, email, password, createdAt: Date.now() };
  lsSet(STORAGE_KEYS.users, users);
  lsSet(STORAGE_KEYS.currentUser, { username, email });
  showAuthMsg('reg-msg', '\u2713 Account created! Signing in...', false);
  setTimeout(() => enterApp({ username, email }), 800);
}

function handleLogin(e) {
  e.preventDefault();
  const id = document.getElementById('login-id').value.trim();
  const password = document.getElementById('login-password').value;
  if (!id || !password) return showAuthMsg('login-msg', 'Please fill in all fields.');
  const users = getUsers();
  let user = users[id];
  if (!user) user = Object.values(users).find(u => u.email === id);
  if (!user || user.password !== password) return showAuthMsg('login-msg', 'Invalid username or password.');
  showAuthMsg('login-msg', '\u2713 Signed in!', false);
  lsSet(STORAGE_KEYS.currentUser, { username: user.username, email: user.email });
  setTimeout(() => enterApp({ username: user.username, email: user.email }), 500);
}

function handleLogout() {
  lsSet(STORAGE_KEYS.currentUser, null);
  state.currentUser = null; state.currentProject = null;
  state.openFiles = []; state.activeFileId = null; state.aiHistory = [];
  document.getElementById('main-app').classList.add('hidden');
  document.getElementById('auth-overlay').classList.remove('hidden');
  document.getElementById('form-register').reset();
  document.getElementById('form-login').reset();
  document.getElementById('reg-msg').textContent = '';
  document.getElementById('login-msg').textContent = '';
}

function enterApp(user) {
  state.currentUser = user;
  document.getElementById('auth-overlay').classList.add('hidden');
  document.getElementById('main-app').classList.remove('hidden');
  document.getElementById('nav-user-display').textContent = '\u{1F464} ' + user.username;
  const lastProject = ls(STORAGE_KEYS.currentProject);
  const projects = getProjects();
  if (lastProject && projects[lastProject]) state.currentProject = lastProject;
  refreshProjectSelect(); refreshSidebar(); refreshEditorState();
}

// ═══════════════════════════════════════════
//  PAGE NAVIGATION
// ═══════════════════════════════════════════
function switchPage(pageId, tabEl) {
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  if (tabEl) tabEl.classList.add('active');
  // Handle new chat/products views
  if (pageId === 'chat') {
    document.getElementById('main-app').classList.remove('hidden');
    document.getElementById('app-layout').classList.add('hidden');
    document.getElementById('chat-view').classList.remove('hidden');
    document.getElementById('products-view').classList.add('hidden');
    initChatView();
  } else if (pageId === 'products') {
    document.getElementById('main-app').classList.remove('hidden');
    document.getElementById('app-layout').classList.add('hidden');
    document.getElementById('chat-view').classList.add('hidden');
    document.getElementById('products-view').classList.remove('hidden');
    renderProductsGrid();
  } else if (pageId === 'app' || pageId === 'ai') {
    document.getElementById('main-app').classList.remove('hidden');
    document.getElementById('app-layout').classList.remove('hidden');
    document.getElementById('chat-view').classList.add('hidden');
    document.getElementById('products-view').classList.add('hidden');
  }
  const page = document.getElementById('page-' + pageId);
  if (page) page.classList.add('active');
}

// ═══════════════════════════════════════════
//  PROJECTS
// ═══════════════════════════════════════════
function showNewProjectDialog() {
  document.getElementById('new-project-name').value = '';
  document.getElementById('new-project-dialog').classList.remove('hidden');
  setTimeout(() => document.getElementById('new-project-name').focus(), 50);
}
function closeDialog(id) { document.getElementById(id).classList.add('hidden'); }

function createNewProject() {
  const name = document.getElementById('new-project-name').value.trim();
  if (!name) return;
  const projects = getProjects();
  const id = 'proj_' + Date.now();
  projects[id] = { id, name, createdAt: Date.now(), files: {} };
  lsSet(STORAGE_KEYS.projects, projects);
  state.currentProject = id;
  lsSet(STORAGE_KEYS.currentProject, id);
  closeDialog('new-project-dialog');
  refreshProjectSelect(); refreshSidebar(); refreshEditorState();
  termLog(`[AweiClaw] Project "${name}" created.`, 'success');
}

function switchProject(projectId) {
  if (!projectId) {
    state.currentProject = null; lsSet(STORAGE_KEYS.currentProject, null);
    state.openFiles = []; state.activeFileId = null;
    refreshSidebar(); refreshEditorState(); return;
  }
  state.currentProject = projectId; lsSet(STORAGE_KEYS.currentProject, projectId);
  state.openFiles = []; state.activeFileId = null;
  refreshSidebar(); refreshEditorState();
  const proj = getProjects()[projectId];
  if (proj) termLog(`[AweiClaw] Switched to project "${proj.name}".`, 'info');
}

function refreshProjectSelect() {
  const sel = document.getElementById('project-select');
  const projects = getProjects();
  while (sel.options.length > 1) sel.remove(1);
  Object.keys(projects).forEach(id => {
    const opt = document.createElement('option');
    opt.value = id; opt.textContent = projects[id].name;
    if (id === state.currentProject) opt.selected = true;
    sel.appendChild(opt);
  });
}

function getCurrentProject() {
  if (!state.currentProject) return null;
  return getProjects()[state.currentProject] || null;
}

// ═══════════════════════════════════════════
//  FILES
// ═══════════════════════════════════════════
function showNewFileDialog(presetName) {
  if (!state.currentProject) { alert('Please create or select a project first.'); return; }
  document.getElementById('new-file-name').value = presetName || '';
  document.getElementById('new-file-dialog').classList.remove('hidden');
  setTimeout(() => { const inp = document.getElementById('new-file-name'); inp.focus(); if (presetName) inp.select(); }, 50);
}

function createNewFile() {
  const name = document.getElementById('new-file-name').value.trim();
  if (!name) return;
  createFileInProject(name, '');
  closeDialog('new-file-dialog');
}

function createFileInProject(name, content) {
  const projects = getProjects();
  const proj = projects[state.currentProject];
  if (!proj) return null;
  const id = 'file_' + Date.now();
  proj.files[id] = { id, name, content };
  lsSet(STORAGE_KEYS.projects, projects);
  refreshSidebar();
  openFileInEditor(id, name, content);
  termLog(`[AweiClaw] File "${name}" created.`, 'success');
  return id;
}

function openFileInEditor(id, name, content) {
  if (!state.openFiles.find(f => f.id === id)) state.openFiles.push({ id, name, content });
  state.activeFileId = id;
  refreshEditorState();
}

function openLocalFile() { document.getElementById('file-input').click(); }

function handleFileOpen(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(ev) {
    const content = ev.target.result;
    const id = 'local_' + Date.now();
    const fileObj = { id, name: file.name, content, isLocal: true };
    if (state.currentProject) {
      const projects = getProjects();
      projects[state.currentProject].files[id] = fileObj;
      lsSet(STORAGE_KEYS.projects, projects);
      refreshSidebar();
    }
    openFileInEditor(id, file.name, content);
    termLog(`[AweiClaw] Opened local file: ${file.name}`, 'success');
  };
  if (file.size > 10 * 1024 * 1024) { termLog('[AweiClaw] File too large (max 10MB).', 'err'); return; }
  reader.readAsText(file);
  e.target.value = '';
}

function saveCurrentFile() {
  const file = getActiveFile();
  if (!file) return;
  const content = document.getElementById('code-textarea').value;
  file.content = content;
  if (state.currentProject && !file.id.startsWith('local_')) {
    const projects = getProjects();
    const proj = projects[state.currentProject];
    if (proj && proj.files[file.id]) { proj.files[file.id].content = content; lsSet(STORAGE_KEYS.projects, projects); }
  }
  const idx = state.openFiles.findIndex(f => f.id === file.id);
  if (idx !== -1) state.openFiles[idx].content = content;
  termLog(`[AweiClaw] Saved "${file.name}".`, 'success');
}

function downloadCurrentFile() {
  const file = getActiveFile();
  if (!file) return;
  const content = document.getElementById('code-textarea').value;
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = file.name;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  termLog(`[AweiClaw] Downloaded "${file.name}".`, 'success');
}

function deleteFile(fileId) {
  if (!confirm('Delete this file?')) return;
  const projects = getProjects();
  const proj = projects[state.currentProject];
  if (proj && proj.files[fileId]) { delete proj.files[fileId]; lsSet(STORAGE_KEYS.projects, projects); }
  state.openFiles = state.openFiles.filter(f => f.id !== fileId);
  if (state.activeFileId === fileId) state.activeFileId = state.openFiles.length > 0 ? state.openFiles[state.openFiles.length - 1].id : null;
  refreshSidebar(); refreshEditorState();
}

function closeTab(fileId) {
  state.openFiles = state.openFiles.filter(f => f.id !== fileId);
  if (state.activeFileId === fileId) state.activeFileId = state.openFiles.length > 0 ? state.openFiles[state.openFiles.length - 1].id : null;
  refreshEditorState();
}

function getActiveFile() {
  if (!state.activeFileId) return null;
  return state.openFiles.find(f => f.id === state.activeFileId) || null;
}

function getExtension(filename) { return (filename.split('.').pop() || '').toLowerCase(); }

function getExtClass(filename) {
  const ext = getExtension(filename);
  const map = { html:'ext-html',htm:'ext-html',css:'ext-css',js:'ext-js',ts:'ext-ts',md:'ext-md',txt:'ext-txt',py:'ext-py',json:'ext-json',xml:'ext-xml',cpp:'ext-cpp',cc:'ext-cpp',cxx:'ext-cpp',c:'ext-cpp',h:'ext-cpp',hpp:'ext-cpp',cs:'ext-cs' };
  return map[ext] || 'ext-default';
}

// ═══════════════════════════════════════════
//  REFRESH UI
// ═══════════════════════════════════════════
function refreshSidebar() {
  const tree = document.getElementById('sidebar-tree');
  const empty = document.getElementById('sidebar-empty');
  const proj = getCurrentProject();
  if (!proj || Object.keys(proj.files).length === 0) {
    tree.style.display = 'none'; empty.style.display = ''; return;
  }
  tree.style.display = ''; empty.style.display = 'none'; tree.innerHTML = '';
  Object.values(proj.files).forEach(file => {
    const item = document.createElement('div');
    item.className = 'sidebar-file-item' + (file.id === state.activeFileId ? ' active' : '');
    item.innerHTML = `
      <span class="file-ext-badge ${getExtClass(file.name)}">${getExtension(file.name) || '?'}</span>
      <span class="sidebar-file-name">${esc(file.name)}</span>
      <button class="sidebar-file-delete" title="Delete file" onclick="event.stopPropagation(); deleteFile('${file.id}')">&#10005;</button>
    `;
    item.addEventListener('click', () => {
      if (!state.openFiles.find(f => f.id === file.id)) state.openFiles.push({ ...file });
      state.activeFileId = file.id;
      refreshSidebar(); refreshEditorState(); reloadSnippetsForFile();
    });
    tree.appendChild(item);
  });
}

async function refreshEditorState() {
  const editorEmpty  = document.getElementById('editor-empty');
  const editorActive = document.getElementById('editor-active');
  const fileActions  = document.getElementById('file-actions');
  if (!state.activeFileId || state.openFiles.length === 0) {
    editorEmpty.classList.remove('hidden'); editorActive.classList.add('hidden');
    fileActions.style.display = 'none'; hideSuggestPanel(); return;
  }
  editorEmpty.classList.add('hidden'); editorActive.classList.remove('hidden');
  const file = getActiveFile();
  if (!file) return;
  fileActions.style.display = '';

  const ext = getExtension(file.name);
  let runLabel = '⬇ Download';
  if (ext === 'html' || ext === 'htm') runLabel = '▶ Run (HTML)';
  else if (ext === 'py') runLabel = '▶ Run Python';
  else if (ext === 'js') runLabel = '▶ Run JS';
  else if (['cpp','cc','cxx','c','h','hpp'].includes(ext)) runLabel = '▶ Run C++';
  document.getElementById('run-btn').textContent = runLabel;

  document.getElementById('toolbar-filename').textContent = file.name;

  // Tabs bar
  const tabsBar = document.getElementById('editor-tabs-bar');
  tabsBar.innerHTML = '';
  state.openFiles.forEach(f => {
    const tab = document.createElement('div');
    tab.className = 'editor-file-tab' + (f.id === state.activeFileId ? ' active' : '');
    tab.setAttribute('data-file-id', f.id);
    tab.innerHTML = `
      <span class="file-ext-badge ${getExtClass(f.name)}" style="font-size:8px">${getExtension(f.name) || '?'}</span>
      <span>${esc(f.name)}</span>
      <button class="tab-close" onclick="event.stopPropagation(); closeTab('${f.id}')">\u00D7</button>
    `;
    tab.addEventListener('click', () => {
      if (state.activeFileId && state.activeFileId !== f.id) syncActiveFileContent();
      state.activeFileId = f.id;
      refreshEditorState(); reloadSnippetsForFile();
    });
    tabsBar.appendChild(tab);
  });

  const textarea = document.getElementById('code-textarea');
  textarea.value = file.content || '';
  updateLineNumbers();
  textarea.focus();
  await reloadSnippetsForFile();

  const ctxBar = document.getElementById('ai-context-bar');
  document.getElementById('ai-ctx-label').textContent = `\u{1F4C4} AI is reading: ${file.name}`;
  ctxBar.style.display = '';
}

function syncActiveFileContent() {
  const file = getActiveFile();
  if (!file) return;
  file.content = document.getElementById('code-textarea').value;
}

// ═══════════════════════════════════════════
//  EDITOR INTERACTIONS
// ═══════════════════════════════════════════
function onCodeChange() {
  updateLineNumbers();
  syncActiveFileContent();
  const ta = document.getElementById('code-textarea');
  if (ta) matchSuggestions(ta.value);
}

function updateLineNumbers() {
  const textarea = document.getElementById('code-textarea');
  const lnEl = document.getElementById('line-numbers');
  if (!lnEl || !textarea) return;
  const lines = (textarea.value.split('\n')).length;
  lnEl.innerHTML = Array.from({ length: lines }, (_, i) => `<div>${i + 1}</div>`).join('');
}

function handleEditorKey(e) {
  if (e.key === 'Tab') {
    e.preventDefault();
    const ta = e.target;
    const start = ta.selectionStart, end = ta.selectionEnd;
    ta.value = ta.value.substring(0, start) + '  ' + ta.value.substring(end);
    ta.selectionStart = ta.selectionEnd = start + 2;
    onCodeChange(); return;
  }
  // Auto-indent on Enter (Python-style)
  if (e.key === 'Enter') {
    const ta = e.target;
    const start = ta.selectionStart;
    const beforeEnter = ta.value.substring(0, start);
    const currentLine = beforeEnter.split('\n').pop() || '';

    // Close suggestion panel if open
    if (suggestActiveIdx >= 0) {
      const panel = document.getElementById('suggest-panel');
      if (!panel.classList.contains('hidden')) { e.preventDefault(); pickActiveSuggestion(); return; }
    }

    // Auto-indent
    e.preventDefault();
    const indentMatch = currentLine.match(/^(\s*)/);
    let indent = indentMatch ? indentMatch[1] : '';

    // Python-style: if line ends with colon, add extra indent
    if (currentLine.trimEnd().endsWith(':')) {
      indent += '    ';
    }
    // HTML: <tag> content
    else if (/<\w+[^>]*>/.test(currentLine.trimStart()) && !/<\/\w+>/.test(currentLine.trimStart())) {
      indent += '    ';
    }
    // CSS: { block
    else if (currentLine.trimEnd().endsWith('{') && getExtension(getActiveFile()?.name || '') === 'css') {
      indent += '  ';
    }

    // Check for auto-close brace (standalone closing brace on new line)
    let extraClose = '';
    const trimmed = currentLine.trimEnd();
    if (trimmed.endsWith('{')) {
      const lineIndent = indentMatch ? indentMatch[1] : '';
      extraClose = '\n' + lineIndent + '}';
    }

    const afterEnter = ta.value.substring(start);
    ta.value = ta.value.substring(0, start) + '\n' + indent + extraClose + afterEnter;
    const newPos = start + 1 + indent.length;
    ta.selectionStart = ta.selectionEnd = newPos;
    onCodeChange(); return;
  }
  // Auto-close brackets
  const pairs = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'" };
  if (pairs[e.key]) {
    const ta = e.target;
    const start = ta.selectionStart, end = ta.selectionEnd;
    const selectedText = ta.value.substring(start, end);
    if (selectedText) {
      e.preventDefault();
      ta.value = ta.value.substring(0, start) + e.key + selectedText + pairs[e.key] + ta.value.substring(end);
      ta.selectionStart = start + 1;
      ta.selectionEnd = end + 1;
      onCodeChange(); return;
    }
    // Only auto-close if next char is whitespace, newline, or end of string
    const nextChar = ta.value.substring(start, start + 1);
    if (!nextChar || /\s/.test(nextChar) || nextChar === ')' || nextChar === ']' || nextChar === '}' || nextChar === ',' || nextChar === ';') {
      e.preventDefault();
      ta.value = ta.value.substring(0, start) + e.key + pairs[e.key] + ta.value.substring(end);
      ta.selectionStart = ta.selectionEnd = start + 1;
      onCodeChange(); return;
    }
  }
  // Auto-close backtick (for JS/TS)
  if (e.key === '`') {
    const ta = e.target;
    const start = ta.selectionStart;
    const nextChar = ta.value.substring(start, start + 1);
    if (!nextChar || /\s/.test(nextChar)) {
      e.preventDefault();
      ta.value = ta.value.substring(0, start) + '``' + ta.value.substring(start);
      ta.selectionStart = ta.selectionEnd = start + 1;
      onCodeChange(); return;
    }
  }
  // Smart backspace: delete paired bracket
  if (e.key === 'Backspace') {
    const ta = e.target;
    const start = ta.selectionStart, end = ta.selectionEnd;
    if (start === end && start > 0) {
      const leftChar = ta.value[start - 1];
      const rightChar = ta.value[start];
      const pairCheck = {'(' : ')', '[' : ']', '{' : '}', '"' : '"', "'" : "'"};
      if (pairCheck[leftChar] === rightChar) {
        e.preventDefault();
        ta.value = ta.value.substring(0, start - 1) + ta.value.substring(start + 1);
        ta.selectionStart = ta.selectionEnd = start - 1;
        onCodeChange(); return;
      }
    }
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    const panel = document.getElementById('suggest-panel');
    if (!panel.classList.contains('hidden')) { e.preventDefault(); pickActiveSuggestion(); return; }
  }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    const panel = document.getElementById('suggest-panel');
    if (!panel.classList.contains('hidden')) {
      const items = document.querySelectorAll('#suggest-list .suggest-item');
      if (items.length === 0) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); suggestActiveIdx = Math.min(suggestActiveIdx + 1, items.length - 1); setSuggestActive(suggestActiveIdx); }
      else { e.preventDefault(); suggestActiveIdx = Math.max(suggestActiveIdx - 1, -1); setSuggestActive(suggestActiveIdx); }
      return;
    }
  }
  if (e.key === 'Escape') {
    const panel = document.getElementById('suggest-panel');
    if (!panel.classList.contains('hidden')) { e.preventDefault(); hideSuggestPanel(); return; }
  }
  // Removed duplicate Enter handler (now handled above)
}

// ═══════════════════════════════════════════
//  TERMINAL (with copy button)
// ═══════════════════════════════════════════
function termLog(msg, cls = '') {
  const term = document.getElementById('terminal-content');
  if (!term) return;
  const line = document.createElement('div');
  line.className = 'term-line ' + cls;

  const copyBtn = document.createElement('button');
  copyBtn.className = 'term-copy-btn';
  copyBtn.textContent = 'Copy';
  copyBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    copyToClipboard(msg, copyBtn);
  });

  const span = document.createElement('span');
  span.textContent = msg;
  line.appendChild(span); line.appendChild(copyBtn);
  term.appendChild(line);
  term.scrollTop = term.scrollHeight;
}

function clearTerminal() {
  const term = document.getElementById('terminal-content');
  if (term) { term.innerHTML = ''; termLog('AweiClaw Terminal — cleared', 'dim'); }
}

function copyToClipboard(text, feedbackBtn) {
  navigator.clipboard.writeText(text).then(() => {
    if (feedbackBtn) { feedbackBtn.textContent = 'Copied!'; feedbackBtn.classList.add('copied'); setTimeout(() => { feedbackBtn.textContent = 'Copy'; feedbackBtn.classList.remove('copied'); }, 1200); }
  }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
    if (feedbackBtn) { feedbackBtn.textContent = 'Copied!'; feedbackBtn.classList.add('copied'); setTimeout(() => { feedbackBtn.textContent = 'Copy'; feedbackBtn.classList.remove('copied'); }, 1200); }
  });
}

// ═══════════════════════════════════════════
//  ONLINE CODE EXECUTION ENGINE
// ═══════════════════════════════════════════

// Pyodide state
let pyodideReady = false;
let pyodideLoading = false;
let pyodideInstance = null;

/**
 * Detect if JS code uses Three.js
 */
function isThreeJS(code) {
  return /\bTHREE\./.test(code) ||
         /import\s+.*\bthree\b/i.test(code) ||
         /require\s*\(\s*['"]three['"]/.test(code);
}

/**
 * Main Run dispatcher
 */
async function runCurrentFile() {
  const file = getActiveFile();
  if (!file) return;
  const content = document.getElementById('code-textarea').value;
  const ext = getExtension(file.name);

  if (ext === 'html' || ext === 'htm') {
    showHTMLPreview(file.name, content);
  } else if (ext === 'py') {
    await runPython(file.name, content);
  } else if (ext === 'js') {
    if (isThreeJS(content)) {
      showThreeJSPreview(file.name, content);
    } else {
      await runJavaScript(file.name, content);
    }
  } else if (['cpp','cc','cxx','c','h','hpp'].includes(ext)) {
    await runCpp(file.name, content);
  } else {
    termLog(`[AweiClaw] "${file.name}" — downloading (no online runner for .${ext}).`, 'info');
    downloadCurrentFile();
  }
}

// ─── HTML Preview ──────────────────────────
function showHTMLPreview(fileName, content) {
  document.getElementById('run-modal-title').textContent = fileName;
  const overlay = document.getElementById('run-overlay');
  overlay.classList.remove('hidden');
  document.getElementById('run-iframe').srcdoc = content;
  termLog(`[AweiClaw] Running "${fileName}" in preview...`, 'info');
}

let runTabWindow = null;
function openRunNewTab() {
  const file = getActiveFile();
  if (!file) return;
  const content = document.getElementById('code-textarea').value;
  const blob = new Blob([content], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  runTabWindow = window.open(url, '_blank');
  termLog(`[AweiClaw] Opened "${file.name}" in new tab.`, 'success');
}

function closeRun() {
  document.getElementById('run-overlay').classList.add('hidden');
  document.getElementById('run-iframe').srcdoc = '';
}

// ─── Three.js 3D Preview ──────────────────
function showThreeJSPreview(fileName, code) {
  const threeHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Three.js Preview</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { overflow: hidden; background: #000; font-family: sans-serif; }
    canvas { display: block; }
    .error-overlay {
      position: fixed; top: 12px; left: 12px; right: 12px;
      background: #F8514933; border: 1px solid #F85149; color: #F85149;
      padding: 10px 14px; border-radius: 6px; font-size: 12px;
      white-space: pre-wrap; font-family: monospace; max-height: 200px; overflow-y: auto;
      display: none;
    }
  </style>
</head>
<body>
  <div class="error-overlay" id="err"></div>
  <script type="importmap">
    { "imports": { "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js" } }
  </script>
  <script type="module">
    import * as THREE from 'three';
    window.THREE = THREE;
    const errEl = document.getElementById('err');
    try {
      ${code}
    } catch(e) {
      errEl.style.display = 'block';
      errEl.textContent = '[Three.js Error] ' + e.message + '\\n' + (e.stack || '');
      console.error(e);
    }
  </script>
</body>
</html>`;

  document.getElementById('run-modal-title').textContent = fileName + ' (3D)';
  document.getElementById('run-overlay').classList.remove('hidden');
  document.getElementById('run-iframe').srcdoc = threeHTML;
  termLog(`[AweiClaw] Running Three.js "${fileName}" in 3D preview...`, 'info');
}

// ─── Python (Pyodide) ─────────────────────
async function runPython(fileName, code) {
  showRunOutput('Python', fileName);
  addRunLine('Loading Python runtime (Pyodide)...', 'info');
  termLog(`[AweiClaw] Running Python "${fileName}" via Pyodide...`, 'info');

  const t0 = performance.now();

  try {
    // Load Pyodide if not ready
    if (!pyodideReady) {
      if (!pyodideLoading) {
        pyodideLoading = true;
        await loadPyodide();
      } else {
        // Another run is loading Pyodide — wait
        addRunLine('Waiting for Pyodide to finish loading...', 'info');
        let waited = 0;
        while (!pyodideReady && waited < 60) {
          await new Promise(r => setTimeout(r, 500));
          waited++;
        }
        if (!pyodideReady) { addRunLine('Pyodide failed to load.', 'stderr'); return; }
      }
    }

    addRunLine('Executing Python...', 'info');

    // Capture stdout
    let output = '';
    pyodideInstance.setStdout({
      batched: (text) => { output += text; }
    });
    pyodideInstance.setStderr({
      batched: (text) => { output += '[stderr] ' + text; }
    });

    await pyodideInstance.runPythonAsync(code);

    const elapsed = ((performance.now() - t0) / 1000).toFixed(2);
    if (output.trim()) {
      output.split('\n').forEach(line => {
        const cls = line.startsWith('[stderr]') ? 'stderr' : 'stdout';
        addRunLine(line.replace(/^\[stderr\]\s*/, ''), cls);
      });
    }
    addRunLine(`\n✓ Execution complete (${elapsed}s)`, 'info');
    document.getElementById('run-output-time').textContent = elapsed + 's';
    termLog(`[AweiClaw] Python "${fileName}" finished (${elapsed}s).`, 'success');

  } catch (err) {
    const elapsed = ((performance.now() - t0) / 1000).toFixed(2);
    const msg = err.message || String(err);
    if (msg.includes('browser WASM sandbox')) {
      addRunLine('⚠ ' + msg, 'stderr');
    } else {
      addRunLine('Runtime Error: ' + msg, 'stderr');
    }
    document.getElementById('run-output-time').textContent = elapsed + 's';
    termLog(`[AweiClaw] Python error: ${msg}`, 'err');
  }
}

async function loadPyodide() {
  const statusEl  = document.getElementById('pyodide-status');
  const fillEl    = document.getElementById('pyodide-fill');
  const loaderEl  = document.getElementById('run-output-loader');

  loaderEl.classList.remove('hidden');
  statusEl.textContent = 'Downloading Pyodide (~10MB)...';
  fillEl.style.width = '10%';

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js';
    script.onload = async () => {
      statusEl.textContent = 'Initializing Python runtime...';
      fillEl.style.width = '30%';

      try {
        // Monitor progress
        const origFetch = window.fetch;
        let downloaded = 0;

        pyodideInstance = await loadPyodide({
          indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/',
          stdout: () => {},
          stderr: () => {},
        });

        // Patch os module — sandbox-friendly wrappers
        await pyodideInstance.runPythonAsync(`
import os
import sys
import builtins

_SANDBOX_MSG = "[os] {} is not available in browser WASM sandbox. Use Emscripten virtual FS instead."

# Patch os.system — disabled
_orig_system = getattr(os, 'system', None)
def _patched_system(cmd):
    raise OSError(_SANDBOX_MSG.format('os.system()'))
os.system = _patched_system

# Patch os.popen — disabled
_orig_popen = getattr(os, 'popen', None)
def _patched_popen(cmd, *a, **kw):
    raise OSError(_SANDBOX_MSG.format('os.popen()'))
os.popen = _patched_popen
os.popen2 = lambda *a: (_ for _ in ()).throw(OSError(_SANDBOX_MSG.format('os.popen2()')))
os.popen3 = lambda *a: (_ for _ in ()).throw(OSError(_SANDBOX_MSG.format('os.popen3()')))
os.popen4 = lambda *a: (_ for _ in ()).throw(OSError(_SANDBOX_MSG.format('os.popen4()')))

# Patch os.fork — disabled
def _patched_fork():
    raise OSError(_SANDBOX_MSG.format('os.fork()'))
os.fork = _patched_fork

# Patch os.exec* — disabled (use default arg to bind _fn)
def _make_exec_patch(fn_name):
    return lambda *a, **kw: (_ for _ in ()).throw(OSError(_SANDBOX_MSG.format('os.' + fn_name + '()')))
for _fn in ['execl','execle','execlp','execlpe','execv','execve','execvp','execvpe']:
    if hasattr(os, _fn):
        setattr(os, _fn, _make_exec_patch(_fn))

# Patch os.spawn* — disabled (use default arg to bind _fn)
def _make_spawn_patch(fn_name):
    return lambda *a, **kw: (_ for _ in ()).throw(OSError(_SANDBOX_MSG.format('os.' + fn_name + '()')))
for _fn in ['spawnl','spawnle','spawnlp','spawnlpe','spawnv','spawnve','spawnvp','spawnvpe']:
    if hasattr(os, _fn):
        setattr(os, _fn, _make_spawn_patch(_fn))

# Patch os.kill — disabled
_orig_kill = getattr(os, 'kill', None)
def _patched_kill(pid, sig):
    raise OSError(_SANDBOX_MSG.format('os.kill()'))
os.kill = _patched_kill

# Block subprocess import
_orig_import = builtins.__import__
def _patched_import(name, *args, **kwargs):
    if name == 'subprocess':
        raise ImportError(
            'subprocess is not available in browser WASM sandbox. '
            'Use os virtual filesystem operations instead (os.listdir, os.mkdir, os.remove, etc.).'
        )
    if name in ('multiprocessing', 'signal', 'socket', 'threading'):
        raise ImportError(
            f"'{name}' is not available in browser WASM sandbox."
        )
    return _orig_import(name, *args, **kwargs)
builtins.__import__ = _patched_import

# Ensure /tmp and /home exist in virtual FS
try:
    os.makedirs('/tmp', exist_ok=True)
    os.makedirs('/home/pyodide', exist_ok=True)
    os.chdir('/home/pyodide')
except Exception:
    pass

# Expose useful env vars
os.environ.setdefault('HOME', '/home/pyodide')
os.environ.setdefault('TMPDIR', '/tmp')
os.environ.setdefault('PYODIDE', '1')
os.environ.setdefault('AWEI_SANDBOX', '1')

# Confirm setup
print('[AweiClaw] os module ready — virtual FS operations supported.', file=sys.stderr)
`);

        // Inject openai module (lightweight, pyodide.http-based, API-compatible with openai SDK)
        await pyodideInstance.runPythonAsync(`
import sys
import types
import json as _json
from js import XMLHttpRequest

_module = types.ModuleType('openai')

class _Message:
    """OpenAI-compatible message object."""
    def __init__(self, data):
        self.content = data.get('content', '')
        self.role = data.get('role', 'assistant')
        self.tool_calls = data.get('tool_calls', None)
        self.function_call = data.get('function_call', None)
    def __repr__(self):
        return f'Message(content={self.content!r}, role={self.role!r})'

class _Choice:
    """OpenAI-compatible choice object."""
    def __init__(self, data):
        self.index = data.get('index', 0)
        self.message = _Message(data.get('message', {}))
        self.finish_reason = data.get('finish_reason', 'stop')
        self.delta = _Message(data.get('delta', {}))
    def __repr__(self):
        return f'Choice(index={self.index}, finish_reason={self.finish_reason!r})'

class _Usage:
    """Token usage info."""
    def __init__(self, data):
        self.completion_tokens = data.get('completion_tokens', 0)
        self.prompt_tokens = data.get('prompt_tokens', 0)
        self.total_tokens = data.get('total_tokens', 0)
    def __repr__(self):
        return f'Usage(total={self.total_tokens})'

class ChatCompletion:
    """OpenAI-compatible ChatCompletion response."""
    def __init__(self, data):
        self.id = data.get('id', '')
        self.choices = [_Choice(c) for c in data.get('choices', [])]
        self.created = data.get('created', 0)
        self.model = data.get('model', '')
        self.object = data.get('object', 'chat.completion')
        self.usage = _Usage(data.get('usage', {})) if data.get('usage') else None
    def __repr__(self):
        return f'ChatCompletion(id={self.id!r}, model={self.model!r})'

class _Completions:
    """chat.completions endpoint."""
    def __init__(self, client):
        self._client = client

    def create(self, *, model, messages, **kwargs):
        """Create a chat completion. API compatible with openai SDK."""
        url = self._client.base_url + '/chat/completions'
        clean_kwargs = {k: v for k, v in kwargs.items() if v is not None}
        body = _json.dumps(dict(model=model, messages=messages, **clean_kwargs))
        xhr = XMLHttpRequest.new()
        xhr.open('POST', url, False)
        xhr.setRequestHeader('Content-Type', 'application/json')
        xhr.setRequestHeader('Authorization', 'Bearer ' + self._client.api_key)
        xhr.send(body.encode('utf-8'))
        if xhr.status < 200 or xhr.status >= 300:
            raise RuntimeError(f'HTTP {xhr.status}: {xhr.statusText}\\n{xhr.responseText[:500]}')
        data = _json.loads(xhr.responseText)
        if 'error' in data:
            raise RuntimeError('API Error: ' + str(data['error']))
        return ChatCompletion(data)

class _Chat:
    """chat namespace."""
    def __init__(self, client):
        self.completions = _Completions(client)

class OpenAI:
    """OpenAI-compatible client. Use with any OpenAI-compatible API (SiliconFlow, etc.)."""
    def __init__(self, *, api_key=None, base_url=None, organization=None, **kwargs):
        self.api_key = api_key or ''
        self.base_url = (base_url or 'https://api.openai.com/v1').rstrip('/')
        self.organization = organization
        self.chat = _Chat(self)
    def __repr__(self):
        return f'OpenAI(base_url={self.base_url!r})'

_module.OpenAI = OpenAI
_module.ChatCompletion = ChatCompletion
sys.modules['openai'] = _module

print('[AweiClaw] openai module ready — from openai import OpenAI now works!', file=sys.stderr)
`);

        fillEl.style.width = '100%';
        statusEl.textContent = '✓ Python runtime ready!';
        pyodideReady = true;
        pyodideLoading = false;

        setTimeout(() => { loaderEl.classList.add('hidden'); }, 800);
        resolve();
      } catch (err) {
        statusEl.textContent = 'Failed: ' + (err.message || err);
        pyodideLoading = false;
        reject(err);
      }
    };
    script.onerror = () => {
      statusEl.textContent = 'Failed to download Pyodide. Check network.';
      fillEl.style.width = '0%';
      fillEl.style.background = '#F85149';
      pyodideLoading = false;
      reject(new Error('Pyodide download failed'));
    };
    document.head.appendChild(script);
  });
}

// ─── JavaScript (Sandboxed) ───────────────
async function runJavaScript(fileName, code) {
  showRunOutput('JavaScript', fileName);
  addRunLine('Running in sandboxed environment...', 'info');
  termLog(`[AweiClaw] Running JS "${fileName}" in sandbox...`, 'info');

  const t0 = performance.now();

  try {
    const results = await executeInSandbox(code);

    const elapsed = ((performance.now() - t0) / 1000).toFixed(2);

    if (results.length === 0) {
      addRunLine('(no output)', 'dim');
    } else {
      results.forEach(r => addRunLine(r.text, r.cls));
    }
    addRunLine(`\n✓ Execution complete (${elapsed}s)`, 'info');
    document.getElementById('run-output-time').textContent = elapsed + 's';
    termLog(`[AweiClaw] JS "${fileName}" finished (${elapsed}s).`, 'success');

  } catch (err) {
    const elapsed = ((performance.now() - t0) / 1000).toFixed(2);
    addRunLine(`Error: ${err.message || err}`, 'stderr');
    document.getElementById('run-output-time').textContent = elapsed + 's';
    termLog(`[AweiClaw] JS error: ${err.message || err}`, 'err');
  }
}

function executeInSandbox(code) {
  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.sandbox = 'allow-scripts';
    document.body.appendChild(iframe);

    let resolved = false;
    const done = (logs) => {
      if (resolved) return;
      resolved = true;
      resolve(logs);
      setTimeout(() => { if (document.body.contains(iframe)) document.body.removeChild(iframe); }, 100);
    };

    // Timeout
    const timeout = setTimeout(() => {
      done([{ text: '[TIMEOUT] Execution exceeded 10 seconds.', cls: 'stderr' }]);
    }, 10000);

    const wrappedHTML = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head><body>
<script>
  var __logs = [];
  var __orig = {};
  ['log','error','warn','info','debug'].forEach(function(m) {
    __orig[m] = console[m];
    console[m] = function() {
      var args = [].slice.call(arguments);
      __logs.push({ text: args.map(function(a) {
        try { return typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a); }
        catch(e) { return String(a); }
      }).join(' '), cls: m === 'error' || m === 'warn' ? 'stderr' : 'stdout' });
    };
  });
  window.onerror = function(msg) {
    __logs.push({ text: '[Error] ' + msg, cls: 'stderr' });
  };

  try {
    ${code}
  } catch(e) {
    __logs.push({ text: '[Exception] ' + (e.message || String(e)), cls: 'stderr' });
  }

  // Restore & send
  Object.keys(__orig).forEach(function(m) { console[m] = __orig[m]; });
  parent.postMessage({ type: 'aweiclaw-js-result', logs: __logs }, '*');
<\/script>
</body></html>`;

    const blob = new Blob([wrappedHTML], { type: 'text/html' });
    const url = URL.createObjectURL(blob);

    const handler = function(e) {
      if (e.data && e.data.type === 'aweiclaw-js-result') {
        clearTimeout(timeout);
        window.removeEventListener('message', handler);
        done(e.data.logs.map(l => ({ text: l.text, cls: l.cls })));
        URL.revokeObjectURL(url);
      }
    };

    window.addEventListener('message', handler);
    iframe.src = url;
  });
}

// ─── C++ (Wandbox API) ─────────────────────
async function runCpp(fileName, code) {
  showRunOutput('C++', fileName);
  addRunLine('Compiling & running via Wandbox (GCC)...', 'info');
  termLog(`[AweiClaw] Running C++ "${fileName}" via Wandbox API...`, 'info');

  const t0 = performance.now();

  try {
    const response = await fetch('https://wandbox.org/api/compile.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        compiler: 'gcc-head',
        code: code,
        stdin: '',
        'compiler-option-raw': '-std=c++23 -O2 -Wall',
        save: false,
      }),
    });

    const result = await response.json();
    const elapsed = ((performance.now() - t0) / 1000).toFixed(2);

    if (!response.ok) {
      addRunLine(`HTTP ${response.status}: ${result.message || 'Unknown error'}`, 'stderr');
      document.getElementById('run-output-time').textContent = elapsed + 's';
      termLog(`[AweiClaw] Wandbox API error: ${response.status}`, 'err');
      return;
    }

    // Compiler output (warnings, notes)
    if (result.compiler_output && result.compiler_output.trim()) {
      result.compiler_output.split('\n').forEach(function(line) {
        if (line.trim()) {
          const cls = line.includes('error:') ? 'stderr' : line.includes('warning:') ? 'stderr' : 'dim';
          addRunLine(line, cls);
        }
      });
    }

    if (result.status === '0') {
      // Success — show program output
      if (result.program_output && result.program_output.trim()) {
        result.program_output.split('\n').forEach(function(line) {
          addRunLine(line, 'stdout');
        });
      } else {
        addRunLine('(program produced no output)', 'dim');
      }
      addRunLine('\n\u2713 Compilation & execution succeeded (' + elapsed + 's)', 'info');
      termLog('[AweiClaw] C++ "' + fileName + '" finished (' + elapsed + 's).', 'success');
    } else {
      // Compilation or runtime error
      if (result.compiler_error && result.compiler_error.trim()) {
        addRunLine('--- Compilation Errors ---', 'stderr');
        result.compiler_error.split('\n').forEach(function(line) {
          if (line.trim()) addRunLine(line, 'stderr');
        });
      }
      if (result.program_error && result.program_error.trim()) {
        addRunLine('--- Runtime Errors ---', 'stderr');
        result.program_error.split('\n').forEach(function(line) {
          if (line.trim()) addRunLine(line, 'stderr');
        });
      }
      if (result.signal) {
        addRunLine('Signal: ' + result.signal, 'stderr');
      }
      addRunLine('\n\u2717 Failed (' + elapsed + 's)', 'stderr');
      termLog('[AweiClaw] C++ compilation/runtime error in "' + fileName + '".', 'err');
    }

    document.getElementById('run-output-lang').textContent = 'C++ (GCC C++23)';
    document.getElementById('run-output-time').textContent = elapsed + 's';

  } catch (err) {
    const elapsed = ((performance.now() - t0) / 1000).toFixed(2);
    const msg = err.message || String(err);
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
      addRunLine('Network error: Unable to reach Wandbox API.', 'stderr');
      addRunLine('Check your internet connection or try again later.', 'dim');
    } else {
      addRunLine('Error: ' + msg, 'stderr');
    }
    document.getElementById('run-output-time').textContent = elapsed + 's';
    termLog('[AweiClaw] C++ network error: ' + msg, 'err');
  }
}

// ─── Run Output Panel ─────────────────────
function showRunOutput(lang, fileName) {
  const panel = document.getElementById('run-output-panel');
  const content = document.getElementById('run-output-content');
  const loader = document.getElementById('run-output-loader');
  const langEl  = document.getElementById('run-output-lang');
  const timeEl  = document.getElementById('run-output-time');

  panel.classList.remove('hidden');
  loader.classList.add('hidden');
  content.innerHTML = '';
  langEl.textContent = lang;
  timeEl.textContent = '';

  // Scroll into view
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function addRunLine(text, cls = '') {
  const content = document.getElementById('run-output-content');
  const line = document.createElement('div');
  line.className = 'run-output-line ' + cls;
  line.textContent = text;
  content.appendChild(line);
  content.scrollTop = content.scrollHeight;
}

function closeRunOutput() {
  document.getElementById('run-output-panel').classList.add('hidden');
}

function copyRunOutput() {
  const content = document.getElementById('run-output-content');
  const text = Array.from(content.querySelectorAll('.run-output-line'))
    .map(el => el.textContent)
    .join('\n');

  const btn = document.querySelector('.run-output-btn');
  copyToClipboard(text, btn);
}

// ═══════════════════════════════════════════
//  AI SYSTEM PROMPT
// ═══════════════════════════════════════════
function buildSystemPrompt() {
  const file = getActiveFile();
  const proj = getCurrentProject();

  let projectFiles = '';
  if (proj && Object.keys(proj.files).length > 0) {
    projectFiles = '\n\nFiles in current project:\n' +
      Object.values(proj.files).map(f => `- ${f.name} (${(f.content || '').length} chars)`).join('\n');
  }

  // Mode-specific behavior instructions
  const modeInstructions = {
    craft: `## MODE: 🔨 Craft (Creative Mode)
You are in CRAFT mode — you build. Your primary job is to WRITE CODE.
- When asked to do something, write the actual code, not just explain it.
- Create files, write functions, build features. Take action.
- Be thorough: write complete, production-quality code.
- Default to creating files when the user describes what they need.`,

    plan: `## MODE: 🔏 Plan (Planning Mode)
You are in PLAN mode — you think first. Your primary job is to CREATE A PLAN.
- Analyze the request and design a solution before any implementation.
- First, output a clear plan in this format:

[FILE:plan.txt]
\`\`\`markdown
# Plan: [Title]
## Overview
...
## Steps
1. ...
2. ...
## Architecture / File Structure
...
## Dependencies / Notes
...
\`\`\`

- After the user confirms the plan, you can switch to implementation.
- Do NOT write any code until the user explicitly says "implement", "go ahead", "do it", or similar.`,

    ask: `## MODE: ❓ Ask (Q&A Mode)
You are in ASK mode — you answer questions. Your primary job is to EXPLAIN.
- Answer questions clearly and thoroughly.
- Provide code examples only as illustrations, not as deliverables.
- Do NOT create files or write executable code unless the user explicitly asks for it.
- Focus on teaching, explaining, and guiding.`,
  };

  let prompt = `You are Awei AI-Coding, an expert AI coding assistant inside AweiClaw, an AI-native developer tool.
You are NOT an "assistant" or generic AI — you are a coding engine designed to produce real, working code.

${modeInstructions[aiConfig.mode] || modeInstructions.craft}

## Your capabilities:
- Write production-quality code in any language
- Create new files in the user's project
- Debug, refactor, explain code
- The user can run code online:
  - HTML files: preview in browser iframe
  - Python files: run via Pyodide (WASM interpreter)
  - JavaScript files: run in sandboxed environment
  - Three.js files: render 3D scene preview
  - C++ files (.cpp/.c/.h/.hpp): compile & run via Wandbox (GCC C++23, real compiler)

## File creation:
When the user asks you to create a file, decide on a good filename yourself (e.g. "app.py", "index.html", "styles.css", "README.md", "3d-demo.js") and output:

[FILE:filename.ext]
\`\`\`language
...complete working code...
\`\`\`

The user will see a "📄 Create & Open" button they can click to create the file instantly.

## Code generation:
When writing code, wrap it in markdown code blocks with the language specified. The user will see a "⤵ Insert" button above each code block to insert it at their cursor position in the open editor.

## Rules:
- Be concise and direct. Write complete, runnable code — never use placeholders or "// ..." for critical logic.
- When creating HTML files, include full <!DOCTYPE html> to <html> — make them self-contained.
- For Three.js, use ES module imports or CDN and create a complete scene.
- Always specify the language in code blocks.`;

  if (file) {
    const content = document.getElementById('code-textarea')?.value || '';
    prompt += `\n\n## Current file: "${file.name}"\nThe user has this file open. Code content:\n\`\`\`\n${content.substring(0, 4000)}\n\`\`\``;
  }

  prompt += projectFiles;
  return prompt;
}

// ═══════════════════════════════════════════
//  AI CONFIG (Mode / Model / Permission)
// ═══════════════════════════════════════════
function setAIMode(mode, btn) {
  aiConfig.mode = mode;
  document.querySelectorAll('#ai-mode-grid .ai-mode-card').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  termLog(`[AweiClaw] AI mode: ${mode}`, 'info');
}

function setModel(model, btn) {
  aiConfig.model = model;
  document.querySelectorAll('#ai-model-list .ai-model-card').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  termLog(`[AweiClaw] AI model: ${model}`, 'info');
}

function toggleAuto() {
  aiConfig.auto = !aiConfig.auto;
  const toggle = document.getElementById('ai-auto-toggle');
  if (aiConfig.auto) {
    toggle.classList.add('active');
    termLog('[AweiClaw] Auto mode enabled.', 'info');
  } else {
    toggle.classList.remove('active');
    termLog('[AweiClaw] Auto mode disabled.', 'info');
  }
}

function setPermission(val) {
  if (val === 'full') {
    // Show safety warning first
    document.getElementById('safety-overlay').classList.remove('hidden');
    aiConfig.pendingPerm = 'full';
    // Reset select back to default until confirmed
    document.getElementById('ai-permission').value = 'default';
  } else {
    aiConfig.permission = 'default';
    updatePermDesc();
    termLog('[AweiClaw] Permission: default.', 'info');
  }
}

function cancelFullPermission() {
  document.getElementById('safety-overlay').classList.add('hidden');
  aiConfig.pendingPerm = null;
  document.getElementById('ai-permission').value = 'default';
}

function confirmFullPermission() {
  aiConfig.permission = 'full';
  aiConfig.pendingPerm = null;
  document.getElementById('safety-overlay').classList.add('hidden');
  document.getElementById('ai-permission').value = 'full';
  updatePermDesc();
  termLog('[AweiClaw] Permission: FULL (all file operations allowed).', 'err');
}

function updatePermDesc() {
  const desc = document.getElementById('ai-perm-desc');
  if (aiConfig.permission === 'full') {
    desc.textContent = 'Full access granted. AI can create, modify, delete, and rename files without confirmation.';
    desc.style.color = '#B45309';
  } else {
    desc.textContent = 'AI operates with standard safety guards. File operations require confirmation.';
    desc.style.color = '';
  }
}

// ═══════════════════════════════════════════
//  AI CHAT
// ═══════════════════════════════════════════
function handleAIKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAIMessage(); }
}

async function sendAIMessage() {
  if (state.isAIStreaming) return;
  const textarea = document.getElementById('ai-textarea');
  const userMsg = textarea.value.trim();
  if (!userMsg) return;
  textarea.value = '';

    const systemPrompt = buildSystemPrompt();
    appendAIMessage('user', userMsg);
    state.aiHistory.push({ role: 'user', content: userMsg });
    if (state.aiHistory.length > 20) state.aiHistory = state.aiHistory.slice(-20);

    // Inject multi-file context into the user message
    let userContent = userMsg;
    const ctxFiles = getMultiFileContext();
    if (ctxFiles) {
      userContent = userMsg + '\n\n' + ctxFiles;
    }

    // Create streaming message element with loading animation
    const container = document.getElementById('ai-messages');
    const msgEl = document.createElement('div');
    msgEl.className = 'ai-msg assistant';
    const streamDiv = document.createElement('div');
    streamDiv.className = 'ai-stream-content';
    streamDiv.innerHTML = '<div class="ai-loading"><div class="ai-loading-pulse"><span class="ai-loading-dot"></span><span class="ai-loading-dot"></span><span class="ai-loading-dot"></span></div><span class="ai-loading-label">' + (currentLang === 'zh' ? 'AI 正在思考...' : 'AI is thinking...') + '</span></div>';
    msgEl.appendChild(streamDiv);
    container.appendChild(msgEl);
    container.scrollTop = container.scrollHeight;
    const loadingId = '_stream_' + Date.now();
    msgEl.id = loadingId;

    state.isAIStreaming = true;
    document.getElementById('ai-send-label').textContent = '...';
    document.querySelector('.ai-send-btn').disabled = true;
    termLog('[AI] Sending streaming request to Awei AI-Coding (ctx: ' + (contextFiles.length || 1) + ' file' + (contextFiles.length !== 1 ? 's' : '') + ')...', 'ai');

    try {
      const messages = [
        { role: 'system', content: systemPrompt },
        ...state.aiHistory.slice(-10),
      ];
      // Replace last user message with context-injected version
      if (ctxFiles && messages.length > 0) {
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i].role === 'user') {
            messages[i] = { role: 'user', content: userContent };
            break;
          }
        }
      }

    const response = await fetch(AI_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${AI_API_KEY}` },
      body: JSON.stringify({ model: AI_MODEL, messages, max_tokens: 4096, temperature: 0.6, stream: true }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errMsg = `API error ${response.status}`;
      try { errMsg = JSON.parse(errorText).error?.message || errMsg; } catch {}
      msgEl.innerHTML = `<p>\u274C Error: ${esc(errMsg)}</p>`;
      termLog(`[AI] Error: ${errMsg}`, 'err');
    } else {
      let fullText = '';
      let thinkText = '';
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep incomplete line

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const dataStr = trimmed.slice(6);
          if (dataStr === '[DONE]') continue;

          try {
            const chunk = JSON.parse(dataStr);
            const delta = chunk.choices?.[0]?.delta;
            if (!delta) continue;

            const content = delta.content || '';
            const reasoning = delta.reasoning_content || '';

            if (reasoning) {
              thinkText += reasoning;
            }
            if (content) {
              fullText += content;
              // Live render
              streamDiv.innerHTML = formatAssistantContent(fullText);
            }
          } catch (e) {
            // Ignore malformed chunks
          }
        }
      }

      if (thinkText && thinkText.trim()) {
        const thinkEl = document.createElement('div');
        thinkEl.className = 'ai-msg thinking';
        thinkEl.innerHTML = `<p>\u{1F4AD} Thinking: ${esc(thinkText.substring(0, 300))}${thinkText.length > 300 ? '...' : ''}</p>`;
        msgEl.parentNode.insertBefore(thinkEl, msgEl);
      }

      if (fullText) {
        streamDiv.innerHTML = formatAssistantContent(fullText);
        state.aiHistory.push({ role: 'assistant', content: fullText });
        const codeMatch = fullText.match(/```(?:\w+)?\n([\s\S]*?)```/g);
        if (codeMatch) {
          state.lastAICode = codeMatch[codeMatch.length - 1].replace(/```\w*\n/, '').replace(/\n```$/, '');
        }
        termLog(`[AI] Streaming complete (${fullText.length} chars).`, 'ai');

        // Track usage
        const estTokens = Math.ceil(fullText.length / 2);
        trackAIUsage(estTokens + (messages.reduce((a, m) => a + (m.content || '').length, 0) / 2), 'Awei AI-Coding');
      }
    }
  } catch (err) {
    streamDiv.innerHTML = `<p>\u274C Network error: ${esc(err.message || String(err))}</p>`;
    termLog(`[AI] Network error: ${err.message || String(err)}`, 'err');
  } finally {
    state.isAIStreaming = false;
    document.getElementById('ai-send-label').textContent = 'Send';
    document.querySelector('.ai-send-btn').disabled = false;
    // Re-attach code block buttons
    attachCodeBlockListeners();
    // Save chat history
    setTimeout(saveChatHistory, 200);
  }
}

// Attach Insert/Create listeners to dynamically added code blocks
function attachCodeBlockListeners() {
  document.querySelectorAll('.cb-btn-insert, .cb-btn-create').forEach(btn => {
    if (btn._attached) return;
    btn._attached = true;
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      const el = this;
      const code = el.getAttribute('data-code');
      const action = el.getAttribute('data-action');
      if (!code) return;
      if (action === 'create-file') {
        const fileName = el.getAttribute('data-file');
        createFileAndInsert(fileName, code);
        flashButton(el);
      } else {
        insertCodeAtCursor(code);
        flashButton(el);
      }
    });
  });
}
// Run on existing blocks
document.addEventListener('DOMContentLoaded', function() {
  setTimeout(attachCodeBlockListeners, 500);
});

function appendAIMessage(role, content) {
  const container = document.getElementById('ai-messages');
  const msg = document.createElement('div');
  msg.className = `ai-msg ${role}`;
  if (role === 'user') msg.innerHTML = `<p>${esc(content)}</p>`;
  else if (role === 'thinking') msg.innerHTML = `<p>${esc(content)}</p>`;
  else msg.innerHTML = formatAssistantContent(content);
  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
}

function formatAssistantContent(text) {
  let processed = text;

  // [FILE:filename.ext] + code block
  processed = processed.replace(
    /\[FILE:([^\]]+)\]\s*```(\w+)?\n([\s\S]*?)```/g,
    (_, fileName, lang, code) => {
      const cleanFileName = fileName.trim();
      const cleanCode = code.replace(/\n$/, '');
      const langLabel = lang || 'code';
      return `<div class="code-block-wrap" data-file="${escAttr(cleanFileName)}" data-code="${escAttr(cleanCode)}">
        <div class="code-block-bar">
          <span class="code-block-lang">\u{1F4C4} ${esc(cleanFileName)} <em>${esc(langLabel)}</em></span>
          <div class="code-block-actions">
            <button class="cb-btn cb-btn-create" data-action="create-file" data-file="${escAttr(cleanFileName)}" data-code="${escAttr(cleanCode)}">\u{1F4C4} Create &amp; Open</button>
            <button class="cb-btn cb-btn-insert" data-action="insert" data-code="${escAttr(cleanCode)}">\u2935 Insert</button>
          </div>
        </div>
        <pre>${esc(cleanCode)}</pre>
      </div>`;
    }
  );

  // Regular code blocks
  processed = processed.replace(
    /```(\w+)?\n([\s\S]*?)```/g,
    (_, lang, code) => {
      const cleanCode = code.replace(/\n$/, '');
      const langLabel = lang || 'code';
      return `<div class="code-block-wrap" data-code="${escAttr(cleanCode)}">
        <div class="code-block-bar">
          <span class="code-block-lang">${esc(langLabel)}</span>
          <div class="code-block-actions">
            <button class="cb-btn cb-btn-insert" data-action="insert" data-code="${escAttr(cleanCode)}">\u2935 Insert at cursor</button>
          </div>
        </div>
        <pre>${esc(cleanCode)}</pre>
      </div>`;
    }
  );

  processed = processed.replace(/`([^`]+)`/g, '<code>$1</code>');
  processed = processed.replace(/\n\n/g, '</p><p>');
  processed = processed.replace(/\n/g, '<br>');
  return `<p>${processed}</p>`;
}

// ═══════════════════════════════════════════
//  CODE BLOCK ACTIONS (event delegation)
// ═══════════════════════════════════════════
document.getElementById('ai-messages').addEventListener('click', function(e) {
  const btn = e.target.closest('.cb-btn');
  if (!btn) return;
  const action = btn.dataset.action;
  const code = btn.dataset.code;
  if (action === 'insert') {
    const ok = insertCodeAtCursor(decodeURIComponent(code));
    if (ok) flashButton(btn, '\u2713 Inserted!', '#22c55e');
  } else if (action === 'create-file') {
    const fileName = btn.dataset.file;
    createFileAndInsert(decodeURIComponent(fileName), decodeURIComponent(code));
    flashButton(btn, '\u2713 Created!', '#22c55e');
  }
});

function flashButton(btn, text, bg) {
  const origText = btn.textContent;
  const origBg = btn.style.background;
  btn.textContent = text; btn.style.background = bg;
  setTimeout(() => { btn.textContent = origText; btn.style.background = origBg; }, 1500);
}

function insertCodeAtCursor(code) {
  const file = getActiveFile();
  if (!file) { alert('No file open. Please open or create a file first, then click Insert again.'); termLog('[AweiClaw] Cannot insert: no file is open.', 'err'); return false; }
  const textarea = document.getElementById('code-textarea');
  const pos = textarea.selectionStart;
  const before = textarea.value.substring(0, pos);
  const after = textarea.value.substring(pos);
  const needsNewline = before.length > 0 && !before.endsWith('\n');
  textarea.value = before + (needsNewline ? '\n' : '') + code + '\n' + after;
  textarea.selectionStart = textarea.selectionEnd = before.length + (needsNewline ? 1 : 0) + code.length;
  onCodeChange(); textarea.focus();
  termLog('[AweiClaw] Code inserted at cursor line. \u2713', 'success');
  return true;
}

function createFileAndInsert(fileName, code) {
  if (!state.currentProject) { alert('Please create or select a project first.'); return; }
  const fileId = createFileInProject(fileName, code);
  if (fileId) {
    termLog(`[AI] Created file "${fileName}" and opened in editor.`, 'ai');
    setTimeout(() => {
      const projects = getProjects();
      const proj = projects[state.currentProject];
      if (proj && proj.files[fileId]) { proj.files[fileId].content = code; proj.files[fileId].aiGenerated = true; lsSet(STORAGE_KEYS.projects, projects); }
    }, 200);
  }
}

// ═══════════════════════════════════════════
//  AI LOADING
// ═══════════════════════════════════════════
function showAILoading() {
  const id = 'loading_' + Date.now();
  const container = document.getElementById('ai-messages');
  const el = document.createElement('div');
  el.className = 'ai-loading'; el.id = id;
  el.innerHTML = '<div class="ai-loading-dot"></div><div class="ai-loading-dot"></div><div class="ai-loading-dot"></div>';
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
  return id;
}
function removeAILoading(id) { const el = document.getElementById(id); if (el) el.remove(); }

// ═══════════════════════════════════════════
//  FEATURE: Dark Mode / Theme Toggle
// ═══════════════════════════════════════════
function toggleTheme() {
  const html = document.documentElement;
  const btn = document.getElementById('theme-btn');
  const isDark = html.getAttribute('data-theme') === 'dark';
  if (isDark) {
    html.removeAttribute('data-theme');
    btn.textContent = '🌙';
    localStorage.setItem('aweiclaw_theme', 'light');
  } else {
    html.setAttribute('data-theme', 'dark');
    btn.textContent = '☀️';
    localStorage.setItem('aweiclaw_theme', 'dark');
  }
}
(function loadTheme() {
  const saved = localStorage.getItem('aweiclaw_theme') || 'light';
  if (saved === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    const btn = document.getElementById('theme-btn');
    if (btn) btn.textContent = '☀️';
  }
})();

// ═══════════════════════════════════════════
//  FEATURE: Global Search (Ctrl+Shift+F)
// ═══════════════════════════════════════════
let searchRegex = false;
let searchCase  = false;

function openSearch() {
  document.getElementById('search-overlay').classList.remove('hidden');
  document.getElementById('search-input').focus();
}
function closeSearch() {
  document.getElementById('search-overlay').classList.add('hidden');
  document.getElementById('search-input').value = '';
  document.getElementById('search-results').innerHTML = '<div class="search-no-results">Type to search across project files...</div>';
}

// ═══════════════════════════════════════════
//  TOOLS DROPDOWN MENU
// ═══════════════════════════════════════════
function toggleToolsMenu(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById('tools-dropdown-menu');
  menu.classList.toggle('hidden');
}

document.addEventListener('click', function(e) {
  const menu = document.getElementById('tools-dropdown-menu');
  const btn = document.querySelector('.tools-dropdown-btn');
  if (menu && !menu.classList.contains('hidden') && !menu.contains(e.target) && e.target !== btn) {
    menu.classList.add('hidden');
  }
});

function toggleSearchRegex() {
  searchRegex = !searchRegex;
  const btn = document.getElementById('search-regex-btn');
  btn.classList.toggle('on', searchRegex);
  performSearch();
}
function toggleSearchCase() {
  searchCase = !searchCase;
  const btn = document.getElementById('search-case-btn');
  btn.classList.toggle('on', searchCase);
  performSearch();
}
function handleSearchKey(e) {
  if (e.key === 'Escape') closeSearch();
  if (e.key === 'Enter' && e.ctrlKey) {
    const first = document.querySelector('.search-result-item');
    if (first) first.click();
  }
}
function performSearch() {
  const q = document.getElementById('search-input').value;
  const container = document.getElementById('search-results');
  if (!q || q.length < 1) {
    container.innerHTML = '<div class="search-no-results">Type to search across project files...</div>';
    return;
  }
  const proj = state.currentProject;
  if (!proj || !proj.files || proj.files.length === 0) {
    container.innerHTML = '<div class="search-no-results">No project files to search.</div>';
    return;
  }
  const results = [];
  for (const file of proj.files) {
    try {
      let pattern;
      if (searchRegex) {
        try { pattern = new RegExp(q, searchCase ? 'g' : 'gi'); } catch (_) { continue; }
      }
      const lines = (file.content || '').split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        let match = false;
        if (searchRegex) {
          pattern.lastIndex = 0;
          match = pattern.test(line);
        } else {
          match = searchCase ? line.includes(q) : line.toLowerCase().includes(q.toLowerCase());
        }
        if (match) {
          const preview = line.trim().substring(0, 120);
          let highlighted = esc(preview);
          if (!searchRegex) {
            const re = new RegExp(escRegex(q), searchCase ? 'g' : 'gi');
            highlighted = highlighted.replace(re, '<em>$&</em>');
          } else {
            highlighted = '<em>' + highlighted + '</em>';
          }
          results.push({ file: file.name, line: i + 1, text: preview, html: highlighted });
        }
      }
    } catch (_) {}
  }
  if (results.length === 0) {
    container.innerHTML = '<div class="search-no-results">No results found for "' + esc(q) + '"</div>';
    return;
  }
  container.innerHTML = results.slice(0, 80).map(r =>
    '<div class="search-result-item" onclick="openSearchResult(\'' + escAttr(r.file) + '\',' + r.line + ')">' +
    '<span class="search-result-file">' + esc(r.file) + '</span>' +
    '<span class="search-result-line">L' + r.line + '</span>' +
    '<span class="search-result-text">' + r.html + '</span></div>'
  ).join('');
}
function openSearchResult(fileName, line) {
  closeSearch();
  openProjectFile(fileName);
  setTimeout(() => {
    const ta = document.getElementById('code-textarea');
    if (!ta) return;
    const lines = ta.value.split('\n');
    let pos = 0;
    for (let i = 0; i < Math.min(line - 1, lines.length); i++) pos += lines[i].length + 1;
    ta.focus();
    ta.setSelectionRange(pos, pos);
    ta.blur(); ta.focus();
  }, 150);
}
function escRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// ═══════════════════════════════════════════
//  FEATURE: AI Code Review
// ═══════════════════════════════════════════
let reviewMarkers = [];
let reviewBubbles = [];

async function runCodeReview() {
  const file = getActiveFile();
  if (!file) { alert('Open a file first to run code review.'); return; }
  const code = document.getElementById('code-textarea').value;
  if (!code.trim()) { alert('The file is empty.'); return; }
  clearReviewMarkers();
  const ext = getExtension(file.name);
  const langNames = { html:'HTML', css:'CSS', js:'JavaScript', py:'Python', cpp:'C++', cs:'C#', ts:'TypeScript', jsx:'React JSX', tsx:'React TSX', json:'JSON' };
  const lang = langNames[ext] || ext.toUpperCase();
  termLog('[AweiClaw] Running AI code review on ' + file.name + '...', 'info');
  const prompt = `Review this ${lang} code for issues. For each issue found, output in strict JSON format:
[{"line": <line_number>, "severity": "error"|"warning"|"info", "title": "<short title>", "description": "<explanation>", "fix": "<suggested fix code or empty string>"}]
Only output the JSON array, no other text. Code:
${code}`;
  try {
    const issues = await callAIForReview(prompt);
    if (!issues || issues.length === 0) {
      termLog('[AweiClaw] Code review complete — no issues found!', 'success');
      return;
    }
    renderReviewMarkers(issues);
    termLog('[AweiClaw] Code review found ' + issues.length + ' issue(s).', issues.some(i=>i.severity==='error')?'err':'warn');
  } catch (e) {
    termLog('[AweiClaw] Code review failed: ' + (e.message || e), 'err');
  }
}
async function callAIForReview(prompt) {
  const resp = await fetch(AI_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + AI_API_KEY },
    body: JSON.stringify({
      model: AI_MODEL,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2048,
      temperature: 0.1,
      stream: false,
    }),
  });
  if (!resp.ok) throw new Error('API error ' + resp.status);
  const data = await resp.json();
  const text = data.choices[0].message.content;
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('No JSON found in response');
  return JSON.parse(jsonMatch[0]);
}
function renderReviewMarkers(issues) {
  clearReviewMarkers();
  const lineNumbers = document.getElementById('line-numbers');
  const ta = document.getElementById('code-textarea');
  const totalLines = ta.value.split('\n').length;
  const lineMap = {};
  for (const issue of issues) {
    const ln = Math.max(1, Math.min(issue.line, totalLines));
    if (!lineMap[ln]) lineMap[ln] = [];
    lineMap[ln].push(issue);
  }
  for (const [ln, list] of Object.entries(lineMap)) {
    const marker = document.createElement('span');
    marker.className = 'editor-gutter-marker ' + (list[0].severity === 'error' ? 'err' : list[0].severity === 'warning' ? 'warn' : 'info');
    marker.style.top = ((parseInt(ln) - 1) * 20) + 'px';
    marker.title = list.length + ' issue(s) on line ' + ln;
    marker.onclick = function(e) { e.stopPropagation(); toggleReviewBubble(parseInt(ln), list); };
    lineNumbers.style.position = 'relative';
    lineNumbers.appendChild(marker);
    reviewMarkers.push(marker);
  }
}
function toggleReviewBubble(lineNum, issues) {
  closeAllReviewBubbles();
  const ta = document.getElementById('code-textarea');
  const editorActive = document.getElementById('editor-active');
  const bubble = document.createElement('div');
  bubble.className = 'review-bubble';
  const topIssues = issues.slice(0, 3);
  bubble.innerHTML = topIssues.map((issue, idx) => {
    const sevClass = issue.severity === 'error' ? 'err' : issue.severity === 'warning' ? 'warn' : 'info';
    const sevLabel = issue.severity === 'error' ? 'ERROR' : issue.severity === 'warning' ? 'WARN' : 'INFO';
    return '<div style="margin-bottom:' + (idx < topIssues.length - 1 ? '12' : '0') + 'px;">' +
      '<div class="review-bubble-header">' +
      '<span class="review-bubble-severity ' + sevClass + '">' + sevLabel + '</span>' +
      '<span class="review-bubble-title">L' + lineNum + ': ' + esc(issue.title) + '</span>' +
      '</div>' +
      '<div class="review-bubble-body">' + esc(issue.description) + '</div>' +
      (issue.fix ? '<div class="review-bubble-code">' + esc(issue.fix) + '</div>' : '') +
      (issue.fix ? '<div class="review-bubble-actions"><button class="btn-primary" onclick="applyReviewFix(event,' + lineNum + ',\'' + escAttr(issue.fix) + '\')" style="font-size:11px;padding:4px 10px;">Apply Fix</button></div>' : '') +
      '</div>';
  }).join('');
  editorActive.appendChild(bubble);
  reviewBubbles.push(bubble);
  setTimeout(() => {
    document.addEventListener('click', function dismissBubble(e) {
      if (!bubble.contains(e.target) && !e.target.classList.contains('editor-gutter-marker')) {
        bubble.remove();
        document.removeEventListener('click', dismissBubble);
      }
    });
  }, 50);
}
function applyReviewFix(event, lineNum, fixCode) {
  const ta = document.getElementById('code-textarea');
  const lines = ta.value.split('\n');
  if (lineNum > 0 && lineNum <= lines.length) {
    lines[lineNum - 1] = fixCode;
    ta.value = lines.join('\n');
  } else {
    ta.value += '\n' + fixCode;
  }
  onCodeChange();
  closeAllReviewBubbles();
  clearReviewMarkers();
  termLog('[AweiClaw] Applied code review fix at line ' + lineNum + '.', 'success');
}
function clearReviewMarkers() {
  reviewMarkers.forEach(m => m.remove());
  reviewMarkers = [];
  closeAllReviewBubbles();
}
function closeAllReviewBubbles() {
  reviewBubbles.forEach(b => b.remove());
  reviewBubbles = [];
}

// ═══════════════════════════════════════════
//  FEATURE: API Tester (Postman-Style)
// ═══════════════════════════════════════════
let apiTab = 'headers';

function showAPITester() {
  document.getElementById('api-tester-overlay').classList.remove('hidden');
  refreshSavedAPIs();
}
function closeAPITester() {
  document.getElementById('api-tester-overlay').classList.add('hidden');
}
function switchAPITab(tab, btn) {
  apiTab = tab;
  document.querySelectorAll('.api-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('api-headers-editor').classList.toggle('hidden', tab !== 'headers');
  document.getElementById('api-body-editor').classList.toggle('hidden', tab !== 'body');
}
async function sendAPIRequest() {
  const method = document.getElementById('api-method').value;
  const url = document.getElementById('api-url').value.trim();
  if (!url) return;
  const btn = document.getElementById('api-send-btn');
  btn.disabled = true; btn.textContent = '...';
  document.getElementById('api-resp-empty').style.display = 'none';
  document.getElementById('api-resp-header').style.display = 'none';
  document.getElementById('api-resp-body').textContent = 'Sending...';
  const t0 = performance.now();
  try {
    let headers = {};
    try { headers = JSON.parse(document.getElementById('api-headers').value || '{}'); } catch (_) {}
    const opts = { method, headers: { ...headers } };
    if (method !== 'GET' && method !== 'HEAD') {
      const bodyText = document.getElementById('api-body').value.trim();
      if (bodyText) {
        try { opts.body = JSON.stringify(JSON.parse(bodyText)); }
        catch (_) { opts.body = bodyText; }
      }
    }
    const resp = await fetch(url, opts);
    const elapsed = ((performance.now() - t0) / 1000).toFixed(2);
    const body = await resp.text();
    let formatted = body;
    try { formatted = JSON.stringify(JSON.parse(body), null, 2); } catch (_) {}
    document.getElementById('api-resp-header').style.display = 'flex';
    const statusEl = document.getElementById('api-resp-status');
    statusEl.textContent = resp.status + ' ' + resp.statusText;
    statusEl.className = 'api-response-status ' + (resp.status < 300 ? 's2xx' : resp.status < 500 ? 's4xx' : 's5xx');
    document.getElementById('api-resp-time').textContent = elapsed + 's · ' + (body.length) + 'B';
    document.getElementById('api-resp-body').textContent = formatted;
  } catch (err) {
    document.getElementById('api-resp-header').style.display = 'none';
    document.getElementById('api-resp-body').textContent = 'Request failed: ' + (err.message || err);
  }
  btn.disabled = false; btn.textContent = 'Send';
}
function saveAPIRequest() {
  const entry = {
    method: document.getElementById('api-method').value,
    url: document.getElementById('api-url').value.trim(),
    headers: document.getElementById('api-headers').value,
    body: document.getElementById('api-body').value,
    savedAt: Date.now(),
  };
  if (!entry.url) return;
  const list = JSON.parse(localStorage.getItem('aweiclaw_saved_apis') || '[]');
  const idx = list.findIndex(e => e.url === entry.url && e.method === entry.method);
  if (idx >= 0) list[idx] = entry; else list.push(entry);
  localStorage.setItem('aweiclaw_saved_apis', JSON.stringify(list));
  refreshSavedAPIs();
  termLog('[AweiClaw] API request saved.', 'success');
}
function loadSavedAPIRequest(key) {
  if (!key) return;
  const list = JSON.parse(localStorage.getItem('aweiclaw_saved_apis') || '[]');
  const entry = list.find(e => (e.url + '|' + e.method) === key);
  if (!entry) return;
  document.getElementById('api-method').value = entry.method;
  document.getElementById('api-url').value = entry.url;
  document.getElementById('api-headers').value = entry.headers;
  document.getElementById('api-body').value = entry.body;
}
function refreshSavedAPIs() {
  const sel = document.getElementById('api-saved-select');
  const list = JSON.parse(localStorage.getItem('aweiclaw_saved_apis') || '[]');
  sel.innerHTML = '<option value="">— Load Saved (' + list.length + ') —</option>';
  list.forEach(e => {
    const opt = document.createElement('option');
    opt.value = e.url + '|' + e.method;
    opt.textContent = e.method + ' ' + e.url.substring(0, 50);
    sel.appendChild(opt);
  });
}

// ═══════════════════════════════════════════
//  FEATURE: Code Statistics Panel
// ═══════════════════════════════════════════
function showCodeStats() {
  const proj = state.currentProject;
  if (!proj) { alert('Open a project first.'); return; }
  const overlay = document.getElementById('stats-overlay');
  overlay.classList.remove('hidden');
  const panel = document.getElementById('stats-panel');
  const files = proj.files || [];
  const totalLines = files.reduce((s, f) => s + (f.content || '').split('\n').length, 0);
  const totalFiles = files.length;
  const langCounts = {};
  let totalChars = 0;
  for (const f of files) {
    const ext = getExtension(f.name);
    const key = ext.toUpperCase() || 'Other';
    const lines = (f.content || '').split('\n').length;
    langCounts[key] = (langCounts[key] || 0) + lines;
    totalChars += (f.content || '').length;
  }
  const sorted = Object.entries(langCounts).sort((a, b) => b[1] - a[1]);
  const aiLines = files.reduce((s, f) => s + (f.aiGenerated ? (f.content || '').split('\n').length : 0), 0);
  const aiRatio = totalLines > 0 ? Math.round(aiLines / totalLines * 100) : 0;
  const colors = { HTML: '#E44D26', CSS: '#264DE4', JS: '#F7DF1E', PY: '#3572A5', CPP: '#F34B7D', CS: '#178600', TS: '#3178C6', JSON: '#292929', OTHER: '#8B949E' };
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    days.push({ date: d, count: Math.floor(Math.random() * 4) });
  }
  panel.innerHTML =
    '<div class="stats-header"><h2>📊 Code Statistics — ' + esc(proj.name) + '</h2><button class="search-close-btn" onclick="closeCodeStats()">✕</button></div>' +
    '<div class="stats-grid">' +
    '<div class="stats-card"><div class="stats-card-value">' + totalFiles + '</div><div class="stats-card-label">Files</div></div>' +
    '<div class="stats-card"><div class="stats-card-value">' + totalLines.toLocaleString() + '</div><div class="stats-card-label">Total Lines</div></div>' +
    '<div class="stats-card"><div class="stats-card-value">' + (totalChars / 1024).toFixed(1) + 'K</div><div class="stats-card-label">Total Size</div></div>' +
    '</div>' +
    '<div class="stats-bar-section"><h3>Language Distribution</h3>' +
    sorted.map(([lang, count]) => {
      const pct = totalLines > 0 ? Math.round(count / totalLines * 100) : 0;
      return '<div class="stats-bar-row"><span class="stats-bar-lang">' + lang + '</span>' +
        '<div class="stats-bar-track"><div class="stats-bar-fill" style="width:' + pct + '%;background:' + (colors[lang] || '#8B949E') + '">' + (pct >= 10 ? pct + '%' : '') + '</div></div>' +
        '<span class="stats-bar-count">' + count + ' ln</span></div>';
    }).join('') + '</div>' +
    '<div class="stats-bar-section"><h3>7-Day Activity</h3>' +
    '<div class="stats-heatmap">' + days.map(d => '<div class="stats-heat-cell l' + d.count + '" title="' + d.date.toLocaleDateString() + ': ' + d.count + ' commits"></div>').join('') + '</div>' +
    '</div>' +
    '<div class="stats-bar-section"><h3>AI-Generated Code</h3>' +
    '<div class="stats-ai-ratio"><span style="font-size:12px;color:var(--text-muted)">AI ratio:</span>' +
    '<div class="stats-ai-bar"><div class="stats-ai-fill" style="width:' + aiRatio + '%">' + (aiRatio >= 15 ? aiRatio + '%' : '') + '</div></div>' +
    '<span style="font-weight:700;color:var(--primary)">' + aiRatio + '%</span></div></div>';
}
function closeCodeStats() {
  document.getElementById('stats-overlay').classList.add('hidden');
}

// ═══════════════════════════════════════════
//  FEATURE: AI Chat History
// ═══════════════════════════════════════════
function showChatHistory() {
  const panel = document.getElementById('chat-history-panel');
  panel.classList.remove('hidden');
  renderChatHistoryList();
}
function closeChatHistory() {
  document.getElementById('chat-history-panel').classList.add('hidden');
}
function renderChatHistoryList() {
  const list = document.getElementById('chat-history-panel-list');
  const empty = document.getElementById('chat-history-empty');
  const history = JSON.parse(localStorage.getItem('aweiclaw_chat_history') || '[]');
  if (history.length === 0) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  list.innerHTML = history.map((h, i) =>
    '<div class="chat-history-item" onclick="restoreChatHistory(' + i + ')">' +
    '<div class="chat-history-item-title">' + esc(h.title || 'Chat ' + (i + 1)) + '</div>' +
    '<div class="chat-history-item-meta"><span>' + new Date(h.savedAt).toLocaleString() + '</span><span>' + (h.msgCount || 0) + ' messages</span></div>' +
    '</div>'
  ).join('');
}
function saveChatHistory() {
  const msgs = document.getElementById('ai-messages');
  if (!msgs) return;
  const bubbles = msgs.querySelectorAll('.ai-msg');
  if (bubbles.length <= 1) return;
  const messages = [];
  bubbles.forEach(b => {
    const role = b.classList.contains('user') ? 'user' : 'assistant';
    const content = b.textContent.trim();
    if (content) messages.push({ role, content });
  });
  if (messages.length === 0) return;
  const firstMsg = messages[0].content.substring(0, 50);
  const history = JSON.parse(localStorage.getItem('aweiclaw_chat_history') || '[]');
  history.unshift({ title: firstMsg, savedAt: Date.now(), msgCount: messages.length, messages });
  if (history.length > 50) history.length = 50;
  localStorage.setItem('aweiclaw_chat_history', JSON.stringify(history));
}
function restoreChatHistory(index) {
  const history = JSON.parse(localStorage.getItem('aweiclaw_chat_history') || '[]');
  if (index < 0 || index >= history.length) return;
  const chat = history[index];
  const msgs = document.getElementById('ai-messages');
  msgs.innerHTML = '';
  for (const m of chat.messages) {
    const div = document.createElement('div');
    div.className = 'ai-msg ' + m.role;
    div.innerHTML = '<div class="ai-msg-bubble"><p>' + esc(m.content).replace(/\n/g, '<br>') + '</p></div>';
    msgs.appendChild(div);
  }
  msgs.scrollTop = msgs.scrollHeight;
  closeChatHistory();
  const aiTab = document.querySelector('[data-page="app"]');
  if (aiTab) switchPage('app', aiTab);
}
function exportChatHistory() {
  const history = JSON.parse(localStorage.getItem('aweiclaw_chat_history') || '[]');
  if (history.length === 0) { alert('No chat history to export.'); return; }
  let md = '# AweiClaw Chat History\n\n';
  history.forEach((h, i) => {
    md += '## ' + (i + 1) + '. ' + (h.title || 'Chat') + '\n';
    md += '_' + new Date(h.savedAt).toLocaleString() + ' · ' + (h.msgCount || 0) + ' messages_\n\n';
    for (const m of h.messages) {
      md += '**' + (m.role === 'user' ? '👤 User' : '🤖 AI') + ':**\n' + m.content + '\n\n---\n\n';
    }
  });
  const blob = new Blob([md], { type: 'text/markdown' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'aweiclaw-chat-history.md';
  a.click();
  URL.revokeObjectURL(a.href);
}

// ═══════════════════════════════════════════
//  FEATURE: Snippet Manager UI
// ═══════════════════════════════════════════
let snippetFilterLang = 'all';

function showSnippetManager() {
  document.getElementById('snippets-overlay').classList.remove('hidden');
  renderSnippetManager();
}
function closeSnippetManager() {
  document.getElementById('snippets-overlay').classList.add('hidden');
}
function renderSnippetManager() {
  const panel = document.getElementById('snippets-panel');
  const langs = [
    { key: 'html', name: 'HTML', icon: '🌐' },
    { key: 'css', name: 'CSS', icon: '🎨' },
    { key: 'js', name: 'JavaScript', icon: '⚡' },
    { key: 'python', name: 'Python', icon: '🐍' },
    { key: 'cpp', name: 'C++', icon: '⚙️' },
    { key: 'cs', name: 'C#', icon: '🎯' },
  ];
  const customSnippets = JSON.parse(localStorage.getItem('aweiclaw_custom_snippets') || '[]');
  panel.innerHTML =
    '<div class="snippets-header"><h2>📋 Snippet Manager</h2><button class="search-close-btn" onclick="closeSnippetManager()">✕</button></div>' +
    '<div class="snippets-filters">' +
    '<button class="snippet-filter-tag' + (snippetFilterLang === 'all' ? ' active' : '') + '" onclick="setSnippetFilter(\'all\')">All</button>' +
    langs.map(l => '<button class="snippet-filter-tag' + (snippetFilterLang === l.key ? ' active' : '') + '" onclick="setSnippetFilter(\'' + l.key + '\')">' + l.icon + ' ' + l.name + '</button>').join('') +
    '</div>' +
    '<div class="snippets-grid" id="snippets-grid"></div>' +
    '<div class="snippet-add-row">' +
    '<select id="snippet-add-lang" style="width:100px;">' + langs.map(l => '<option value="' + l.key + '">' + l.name + '</option>').join('') + '</select>' +
    '<input id="snippet-add-trigger" placeholder="Trigger (e.g. for loop)" style="width:140px;">' +
    '<input id="snippet-add-code" placeholder="Code snippet..." style="flex:1;">' +
    '<button class="btn-primary" onclick="addCustomSnippet()" style="font-size:12px;">+ Add</button>' +
    '</div>';
  renderSnippetGrid();
}
function setSnippetFilter(lang) {
  snippetFilterLang = lang;
  document.querySelectorAll('.snippet-filter-tag').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  renderSnippetGrid();
}
function renderSnippetGrid() {
  const grid = document.getElementById('snippets-grid');
  if (!grid) return;
  const customSnippets = JSON.parse(localStorage.getItem('aweiclaw_custom_snippets') || '[]');
  const allSnippets = [];
  const langKeys = ['html', 'css', 'js', 'python', 'cpp', 'cs'];
  for (const lk of langKeys) {
    const file = LANG_SNIPPET_MAP[lk];
    if (!file || !snippetsCache[file]) continue;
    for (const s of snippetsCache[file]) {
      allSnippets.push({ trigger: s.trigger, code: s.code, lang: lk, custom: false });
    }
  }
  for (const s of customSnippets) {
    allSnippets.push({ trigger: s.trigger, code: s.code, lang: s.lang, custom: true, id: s.id });
  }
  let filtered = snippetFilterLang === 'all' ? allSnippets : allSnippets.filter(s => s.lang === snippetFilterLang);
  if (filtered.length > 60) filtered = filtered.slice(0, 60);
  const langNames = { html: 'HTML', css: 'CSS', js: 'JS', python: 'Python', cpp: 'C++', cs: 'C#' };
  grid.innerHTML = filtered.map(s =>
    '<div class="snippet-card">' +
    '<div class="snippet-card-header">' +
    '<span class="snippet-card-trigger">' + esc(s.trigger) + '</span>' +
    '<span class="snippet-card-lang">' + (langNames[s.lang] || s.lang) + '</span>' +
    '</div>' +
    '<div class="snippet-card-code">' + esc(s.code.substring(0, 200)) + '</div>' +
    '<div class="snippet-card-actions">' +
    '<button class="btn-secondary" onclick="insertSnippet(\'' + escAttr(s.code) + '\')" style="font-size:10px;">Insert</button>' +
    (s.custom ? '<button class="btn-secondary" onclick="deleteCustomSnippet(\'' + s.id + '\')" style="font-size:10px;color:var(--danger);">Delete</button>' : '') +
    '</div></div>'
  ).join('');
}
function insertSnippet(code) {
  const ta = document.getElementById('code-textarea');
  if (!ta) return;
  const pos = ta.selectionStart;
  ta.value = ta.value.substring(0, pos) + code + ta.value.substring(pos);
  ta.focus();
  ta.setSelectionRange(pos + code.length, pos + code.length);
  onCodeChange();
  closeSnippetManager();
  termLog('[AweiClaw] Snippet inserted.', 'info');
}
function addCustomSnippet() {
  const lang = document.getElementById('snippet-add-lang').value;
  const trigger = document.getElementById('snippet-add-trigger').value.trim();
  const code = document.getElementById('snippet-add-code').value.trim();
  if (!trigger || !code) return;
  const snippets = JSON.parse(localStorage.getItem('aweiclaw_custom_snippets') || '[]');
  snippets.push({ id: Date.now().toString(36), trigger, code, lang });
  localStorage.setItem('aweiclaw_custom_snippets', JSON.stringify(snippets));
  document.getElementById('snippet-add-trigger').value = '';
  document.getElementById('snippet-add-code').value = '';
  renderSnippetGrid();
}
function deleteCustomSnippet(id) {
  let snippets = JSON.parse(localStorage.getItem('aweiclaw_custom_snippets') || '[]');
  snippets = snippets.filter(s => s.id !== id);
  localStorage.setItem('aweiclaw_custom_snippets', JSON.stringify(snippets));
  renderSnippetGrid();
}

// ═══════════════════════════════════════════
//  FEATURE: AI Multi-File Context
// ═══════════════════════════════════════════
let contextFiles = [];

function toggleContextPicker() {
  const picker = document.getElementById('ai-ctx-picker');
  const proj = state.currentProject;
  if (!proj || !proj.files) return;
  if (!picker.classList.contains('hidden')) { picker.classList.add('hidden'); return; }
  picker.innerHTML = proj.files.map(f => {
    const size = (f.content || '').length;
    const tokens = Math.ceil(size / 4);
    const isActive = contextFiles.some(cf => cf.name === f.name);
    return '<div class="ai-ctx-picker-item" onclick="toggleContextFile(\'' + escAttr(f.name) + '\')" style="' + (isActive ? 'background:var(--primary-light);' : '') + '">' +
      (isActive ? '☑ ' : '☐ ') + esc(f.name) +
      '<span class="pick-size">~' + tokens + ' tokens</span></div>';
  }).join('');
  picker.classList.remove('hidden');
  setTimeout(() => {
    const dismiss = function(e) {
      if (!picker.contains(e.target) && !e.target.classList.contains('ai-ctx-add-btn')) {
        picker.classList.add('hidden');
        document.removeEventListener('click', dismiss);
      }
    };
    document.addEventListener('click', dismiss);
  }, 10);
}
function toggleContextFile(fileName) {
  const proj = state.currentProject;
  if (!proj) return;
  const idx = contextFiles.findIndex(cf => cf.name === fileName);
  if (idx >= 0) {
    contextFiles.splice(idx, 1);
  } else {
    const file = proj.files.find(f => f.name === fileName);
    if (file) contextFiles.push({ name: file.name, content: file.content, tokens: Math.ceil((file.content || '').length / 4) });
  }
  renderContextChips();
  document.getElementById('ai-ctx-picker').classList.add('hidden');
}
function renderContextChips() {
  const container = document.getElementById('ai-ctx-chips');
  const multiCtx = document.getElementById('ai-multi-context');
  const tokenInfo = document.getElementById('ai-ctx-tokens');
  if (contextFiles.length === 0) {
    multiCtx.classList.add('hidden');
    return;
  }
  multiCtx.classList.remove('hidden');
  container.innerHTML = contextFiles.map(cf =>
    '<span class="ai-ctx-chip">' + esc(cf.name) + '<span class="ctx-remove" onclick="toggleContextFile(\'' + escAttr(cf.name) + '\')">×</span></span>'
  ).join('');
  const total = contextFiles.reduce((s, cf) => s + cf.tokens, 0);
  tokenInfo.textContent = '~' + total + ' tokens';
}
function getMultiFileContext() {
  if (contextFiles.length === 0) return '';
  return '\n\n[Additional context files]\n' + contextFiles.map(cf =>
    '--- FILE: ' + cf.name + ' ---\n' + cf.content + '\n--- END: ' + cf.name + ' ---'
  ).join('\n\n');
}

// ═══════════════════════════════════════════
//  UTILITIES
// ═══════════════════════════════════════════
function esc(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function escAttr(str) {
  if (!str) return '';
  return encodeURIComponent(str);
}

// ═══════════════════════════════════════════
//  KEYBOARD SHORTCUTS
// ═══════════════════════════════════════════
document.addEventListener('keydown', function(e) {
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && e.key === 's') { e.preventDefault(); saveCurrentFile(); return; }
  if (ctrl && e.key === '1') { e.preventDefault(); const b = document.querySelector('[data-page="app"]'); if (b) switchPage('app', b); return; }
  if (ctrl && e.key === '2') { e.preventDefault(); const b = document.querySelector('[data-page="landing"]'); if (b) switchPage('landing', b); return; }
  // Ctrl+R → Run
  if (ctrl && e.key === 'r') { e.preventDefault(); runCurrentFile(); return; }
  // Ctrl+Shift+F → Global Search
  if (ctrl && e.shiftKey && (e.key === 'f' || e.key === 'F')) { e.preventDefault(); openSearch(); return; }
});

// Dialog keyboard dismiss
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    document.querySelectorAll('.dialog-overlay:not(.hidden)').forEach(d => d.classList.add('hidden'));
    closeRun(); closeRunOutput(); closeSearch(); closeAPITester(); closeCodeStats(); closeChatHistory(); closeSnippetManager();
    closeTimestampConverter(); closeUsageDashboard();
    document.getElementById('tab-context-menu').classList.add('hidden');
  }
});

// ═══════════════════════════════════════════
//  FEATURE 1: AI Streaming Response (SSE)
// ═══════════════════════════════════════════
// Modified sendAIMessage() — see replacement below

// ═══════════════════════════════════════════
//  FEATURE 2: Explain This Code
// ═══════════════════════════════════════════
function explainCurrentCode() {
  const file = getActiveFile();
  if (!file) return;
  document.getElementById('ai-textarea').value = '请逐行解释这段代码：\n\n```' + (getExtension(file.name) || '') + '\n' + file.content + '\n```';
  sendAIMessage();
}

// ═══════════════════════════════════════════
// ═══════════════════════════════════════════
//  FEATURE 4: Auto-Indent & Bracket Completion
// ═══════════════════════════════════════════
// Already in handleEditorKey — enhanced below

// ═══════════════════════════════════════════
//  FEATURE 5: Timestamp Converter
// ═══════════════════════════════════════════
function showTimestampConverter() {
  document.getElementById('ts-converter-overlay').classList.remove('hidden');
  tsNow();
  document.getElementById('ts-unix-input').focus();
}
function closeTimestampConverter() {
  document.getElementById('ts-converter-overlay').classList.add('hidden');
}
function tsNow() {
  const now = Math.floor(Date.now() / 1000);
  document.getElementById('ts-unix-input').value = now;
  tsToDate();
}
function tsRelative(offsetSeconds) {
  const now = Math.floor(Date.now() / 1000);
  document.getElementById('ts-unix-input').value = now + offsetSeconds;
  tsToDate();
}
function tsToDate() {
  const input = document.getElementById('ts-unix-input').value.trim();
  const unit = document.getElementById('ts-unit').value;
  if (!input) { document.getElementById('ts-date-output').value = ''; return; }
  let ts = parseInt(input, 10);
  if (isNaN(ts)) { document.getElementById('ts-date-output').value = 'Invalid timestamp'; return; }
  if (unit === 'ms') ts = Math.floor(ts / 1000);
  const date = new Date(ts * 1000);
  if (isNaN(date.getTime())) { document.getElementById('ts-date-output').value = 'Invalid timestamp'; return; }
  document.getElementById('ts-date-output').value = date.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
  document.getElementById('ts-date-output').value += ' | ' + date.toLocaleString('zh-CN', {timeZone:'Asia/Shanghai'}) + ' CST';
}
function dateToTs() {
  const input = document.getElementById('ts-date-input').value.trim();
  if (!input) { document.getElementById('ts-unix-output').value = ''; return; }
  const date = new Date(input);
  if (isNaN(date.getTime())) { document.getElementById('ts-unix-output').value = 'Invalid date'; return; }
  document.getElementById('ts-unix-output').value = Math.floor(date.getTime() / 1000) + ' (s) | ' + date.getTime() + ' (ms)';
}

// ═══════════════════════════════════════════
//  FEATURE 7: Tab Context Menu
// ═══════════════════════════════════════════
let tabContextFileId = null;
function showTabContextMenu(e, fileId) {
  e.preventDefault();
  e.stopPropagation();
  tabContextFileId = fileId;
  const menu = document.getElementById('tab-context-menu');
  menu.style.display = 'flex';
  menu.style.left = e.clientX + 'px';
  menu.style.top = e.clientY + 'px';
  menu.classList.remove('hidden');
  // Close on outside click
  setTimeout(() => {
    const close = function(ev) { if (!menu.contains(ev.target)) { menu.classList.add('hidden'); document.removeEventListener('click', close); } };
    document.addEventListener('click', close);
  }, 0);
}
function tabMenuClose() { if (tabContextFileId) closeTab(tabContextFileId); document.getElementById('tab-context-menu').classList.add('hidden'); }
function tabMenuCloseOthers() {
  const proj = state.currentProject;
  if (!proj || !proj.files) return;
  const keep = proj.files.find(f => f.id === tabContextFileId);
  state.openFiles = [keep].filter(Boolean);
  state.activeFileId = tabContextFileId;
  refreshEditorState();
  syncActiveFileContent();
  refreshProjectSelect();
  document.getElementById('tab-context-menu').classList.add('hidden');
}
function tabMenuCloseAll() {
  state.openFiles = [];
  state.activeFileId = null;
  refreshEditorState();
  document.getElementById('tab-context-menu').classList.add('hidden');
}
function tabMenuCopyPath() {
  const file = (state.currentProject?.files || []).find(f => f.id === tabContextFileId);
  if (file) {
    const path = (state.currentProject?.name || 'project') + '/' + file.name;
    navigator.clipboard.writeText(path).then(() => termLog('[AweiClaw] Path copied: ' + path, 'success'));
  }
  document.getElementById('tab-context-menu').classList.add('hidden');
}
// Attach right-click to dynamically created tabs
const _origRefreshEditorState = refreshEditorState;
refreshEditorState = async function() {
  await _origRefreshEditorState();
  document.querySelectorAll('.editor-file-tab').forEach(tab => {
    const fid = tab.getAttribute('data-file-id');
    if (fid && !tab._hasCtxMenu) {
      tab._hasCtxMenu = true;
      tab.addEventListener('contextmenu', function(e) { showTabContextMenu(e, fid); });
    }
  });
};

// ═══════════════════════════════════════════
//  FEATURE 8: Auto-Save
// ═══════════════════════════════════════════
let autoSaveEnabled = false;
let autoSaveTimer = null;
let autoSaveDirty = false;

function toggleAutoSave() {
  autoSaveEnabled = !autoSaveEnabled;
  const toggle = document.getElementById('auto-save-toggle');
  if (autoSaveEnabled) {
    toggle.classList.add('active');
    startAutoSave();
    termLog('[AweiClaw] Auto-save enabled (every 30s).', 'info');
  } else {
    toggle.classList.remove('active');
    stopAutoSave();
    termLog('[AweiClaw] Auto-save disabled.', 'info');
  }
  lsSet('aweiclaw_auto_save', autoSaveEnabled ? '1' : '0');
}
function startAutoSave() {
  if (autoSaveTimer) clearInterval(autoSaveTimer);
  autoSaveTimer = setInterval(autoSaveTick, 30000);
}
function stopAutoSave() {
  if (autoSaveTimer) { clearInterval(autoSaveTimer); autoSaveTimer = null; }
  updateAutoSaveIndicator('saved');
}
function autoSaveTick() {
  if (!autoSaveDirty) return;
  const file = getActiveFile();
  if (!file) return;
  const content = document.getElementById('code-textarea').value;
  if (file.content === content) return;
  updateAutoSaveIndicator('saving');
  file.content = content;
  const proj = state.currentProject;
  if (proj) {
    const idx = proj.files.findIndex(f => f.id === file.id);
    if (idx >= 0) proj.files[idx].content = content;
    const projects = ls('aweiclaw_projects') || {};
    projects[proj.id] = proj;
    lsSet('aweiclaw_projects', projects);
  }
  autoSaveDirty = false;
  setTimeout(() => updateAutoSaveIndicator('saved'), 500);
}
function updateAutoSaveIndicator(state) {
  const el = document.getElementById('auto-save-indicator');
  if (!autoSaveEnabled) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden', 'unsaved', 'saving');
  if (state === 'unsaved') { el.classList.add('unsaved'); el.textContent = '● Unsaved'; }
  else if (state === 'saving') { el.classList.add('saving'); el.textContent = '◌ Saving...'; }
  else { el.textContent = '💾 Saved'; }
}
function markAutoSaveDirty() {
  autoSaveDirty = true;
  if (autoSaveEnabled) updateAutoSaveIndicator('unsaved');
}

// Hook into onCodeChange
const _origOnCodeChange = onCodeChange;
onCodeChange = function() {
  _origOnCodeChange();
  markAutoSaveDirty();
};

// Load auto-save preference on init
(function() { if (ls('aweiclaw_auto_save') === '1') { autoSaveEnabled = true; setTimeout(() => { document.getElementById('auto-save-toggle').classList.add('active'); startAutoSave(); }, 500); } })();

// ═══════════════════════════════════════════
//  LANGUAGE SYSTEM — API-translated Chinese UI
// ═══════════════════════════════════════════
const I18N = {
  'AI Ready': 'AI 就绪',
  'Sign Out': '退出登录',
  'Project:': '项目：',
  '+ New Project': '+ 新建项目',
  '📂 Open File': '📂 打开文件',
  '🛠 Tools ▾': '🛠 工具 ▾',
  '💾 Save': '💾 保存',
  '⬇ Download': '⬇ 下载',
  '▶ Run Locally': '▶ 本地运行',
  '📖 Explain': '📖 解释',
  '📖 Explain This Code': '📖 解释此代码',
  'Saved': '已保存',
  'Unsaved': '未保存',
  'Untitled': '未命名',
  'EXPLORER': '资源管理器',
  'New File': '新建文件',
  'No project open.': '未打开项目。',
  'Create a project to start.': '创建项目开始使用。',
  'No file open': '未打开文件',
  'Create a new project and file, or open a local file to get started.': '创建新项目和文件，或打开本地文件开始。',
  'Open Local File': '打开本地文件',
  'AI Assistant': 'AI 助手',
  'Ask AI anything... (Shift+Enter for new line, Enter to send)': '向 AI 提问... (Shift+Enter 换行, Enter 发送)',
  'Ask AI anything...': '向 AI 提问...',
  'Enter to send · Shift+Enter to wrap': 'Enter 发送 · Shift+Enter 换行',
  'Send': '发送',
  'Viewing current file': '正在查看当前文件',
  'Context:': '上下文：',
  '+ Add File': '+ 添加文件',
  'MODE': '模式',
  'Craft': 'Craft',
  'You say, I do. AI writes code and builds.': '你说，我做。AI 编写并构建代码。',
  'Plan': 'Plan',
  'Think first, do second. AI creates plan.txt.': '先规划，后执行。AI 创建 plan.txt。',
  'Ask': 'Ask',
  'Talk only, hands off. AI answers questions.': '仅对话，不动手。AI 回答问题。',
  'BEHAVIOR': '行为',
  'Auto Mode': '自动模式',
  'Let AI choose the best mode for each request': '让 AI 为每次请求选择最佳模式',
  'PERMISSION': '权限',
  'Default Permission': '默认权限',
  'Full Permission': '完全权限',
  'AI operates with standard safety guards. File operations require confirmation.': 'AI 在标准安全保护下运行。文件操作需要确认。',
  'AI operates with full access. All operations run automatically.': 'AI 以完全权限运行。所有操作自动执行。',
  'AUTO-SAVE': '自动保存',
  'Auto-Save': '自动保存',
  'Save current file every 30 seconds': '每 30 秒自动保存当前文件',
  'LANGUAGE': '语言',
  'AI MODEL': 'AI 模型',
  'API KEY': 'API 密钥',
  'API URL': 'API 地址',
  'Create Account': '创建账户',
  'Sign In': '登录',
  'Username': '用户名',
  'Enter your username': '输入用户名',
  'Email': '邮箱',
  'you@example.com': 'you@example.com',
  'Password': '密码',
  'Confirm Password': '确认密码',
  'Create Account': '创建账户',
  'Already have an account?': '已有账户？',
  "Don't have an account?": '没有账户？',
  'File Size': '文件大小',
  'files': '文件',
  'lines': '行',
  'chars': '字符',
  'words': '单词',
  '🔍 AI Code Review': '🔍 AI 代码审查',
  '🔗 API Tester': '🔗 API 测试',
  '📊 Code Statistics': '📊 代码统计',
  '💬 Chat History': '💬 聊天记录',
  '📋 Snippet Manager': '📋 代码片段',
  '🕐 Timestamp Converter': '🕐 时间戳转换',
  '📊 AI Usage Dashboard': '📊 AI 用量面板',
  'All Tools': '全部工具',
  '— No Project —': '— 无项目 —',
  'Run Output': '运行输出',
  'Ready to run code...': '准备运行代码...',
  'Loading Python runtime...': '正在加载 Python 运行时...',
  'AweiClaw Terminal — ready': 'AweiClaw 终端 — 就绪',
  'Clear': '清空',
  'Close': '关闭',
  'Copy': '复制',
  'Terminal': '终端',
  '✕ Close': '✕ 关闭',
  'Close Others': '关闭其他',
  'Close All': '关闭全部',
  '📋 Copy Path': '📋 复制路径',
  'Copy output': '复制输出',
  '🔍 Explain This Code': '🔍 解释此代码',
  'Awei AI-Coding': 'Awei AI-Coding',
  '👋 Hello! I\'m your AI assistant powered by': '👋 你好！我是你的 AI 助手，由',
  '. I can see your code, create new files, write code, and help you debug or refactor. What would you like to do?': '驱动。我可以查看代码、创建文件、编写代码，并帮助你调试或重构。你想做什么？',
  '🧪 Generate Tests': '🧪 生成测试',
  '📦 Export ZIP': '📦 导出 ZIP',
  '📄 Bundle to HTML': '📄 打包为 HTML',
  '💬 AI Commit Msg': '💬 AI 提交信息',
  'Pinned': '已置顶',
  'Bookmarks': '书签',
  'Tab to accept': 'Tab 接受',
  '📌 Pin': '📌 置顶',
  '📌 Unpin': '📌 取消置顶',
  '📋 Copy Name': '📋 复制名称',
};

let currentLang = 'en';

function setLanguage(lang) {
  currentLang = lang;
  lsSet('aweiclaw_lang', lang);
  // Update toggle buttons
  document.querySelectorAll('.ai-lang-btn').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-lang') === lang);
  });
  // Apply translations
  if (lang === 'zh') {
    applyChineseTranslations();
  } else {
    location.reload(); // Reload to restore English
  }
}

function applyChineseTranslations() {
  // Walk all text-containing nodes
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );
  const nodes = [];
  while (walker.nextNode()) {
    const n = walker.currentNode;
    // Skip script/style/textarea/input placeholder handled separately
    if (n.parentElement && ['SCRIPT','STYLE','TEXTAREA'].includes(n.parentElement.tagName)) continue;
    nodes.push(n);
  }
  // Batch replace
  for (const node of nodes) {
    let text = node.textContent;
    if (!text || !text.trim()) continue;
    // Sort keys by length descending to match longer phrases first
    const keys = Object.keys(I18N).sort((a,b) => b.length - a.length);
    for (const key of keys) {
      if (text.includes(key)) {
        text = text.replace(new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), I18N[key]);
      }
    }
    if (text !== node.textContent) {
      node.textContent = text;
    }
  }
  // Translate placeholders
  const placeholders = {
    'Ask AI anything... (Shift+Enter for new line, Enter to send)': '向 AI 提问... (Shift+Enter 换行, Enter 发送)',
    'Enter your username': '输入用户名',
    'you@example.com': 'you@example.com',
    '••••••••': '••••••••',
  };
  document.querySelectorAll('input[placeholder], textarea[placeholder]').forEach(el => {
    const ph = el.getAttribute('placeholder');
    if (placeholders[ph]) el.setAttribute('placeholder', placeholders[ph]);
  });
  // Translate title attributes
  document.querySelectorAll('[title]').forEach(el => {
    const t = el.getAttribute('title');
    if (I18N[t]) el.setAttribute('title', I18N[t]);
  });
  // Set html lang
  document.documentElement.setAttribute('lang', 'zh-CN');
}

// Init language on load
(function() {
  const saved = ls('aweiclaw_lang');
  if (saved === 'zh') {
    currentLang = 'zh';
    document.querySelectorAll('.ai-lang-btn').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-lang') === 'zh');
    });
    // Apply after DOM ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', applyChineseTranslations);
    } else {
      applyChineseTranslations();
    }
  }
})();

// ═══════════════════════════════════════════
//  FEATURE 9: Drag-Drop File Open
// ═══════════════════════════════════════════
async function handleFileDrop(e) {
  e.preventDefault();
  const items = e.dataTransfer.items;
  if (!items) return;
  const entries = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.kind === 'file') {
      const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
      if (entry) entries.push(entry);
    }
  }
  if (entries.length === 0) {
    const files = e.dataTransfer.files;
    for (let i = 0; i < files.length; i++) {
      await processDroppedFile(files[i]);
    }
    return;
  }
  for (const entry of entries) {
    await processDropEntry(entry);
  }
}
async function processDropEntry(entry) {
  if (entry.isFile) {
    const file = await new Promise(resolve => entry.file(resolve));
    await processDroppedFile(file);
  } else if (entry.isDirectory) {
    const reader = entry.createReader();
    const entries = await new Promise(resolve => reader.readEntries(resolve));
    for (const e of entries) await processDropEntry(e);
  }
}
async function processDroppedFile(file) {
  if (file.name.endsWith('.zip')) {
    await handleZipFile(file);
    return;
  }
  const reader = new FileReader();
  const content = await new Promise((resolve, reject) => {
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsText(file);
  });
  if (!state.currentProject) { showNewProjectDialog(); return; }
  const proj = state.currentProject;
  const existing = proj.files.find(f => f.name === file.name);
  if (existing) {
    existing.content = content;
    openFileInEditor(existing.id);
    termLog(`[AweiClaw] Updated "${file.name}" via drag-drop.`, 'success');
  } else {
    createFileInProject(file.name, content);
    termLog(`[AweiClaw] Opened "${file.name}" via drag-drop.`, 'success');
  }
}
async function handleZipFile(file) {
  termLog(`[AweiClaw] Extracting ZIP: "${file.name}"...`, 'info');
  try {
    const arrayBuffer = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
    // Use JSZip if available, otherwise fallback
    if (typeof JSZip !== 'undefined') {
      const zip = await JSZip.loadAsync(arrayBuffer);
      if (!state.currentProject) { showNewProjectDialog(); return; }
      const proj = state.currentProject;
      const promises = [];
      zip.forEach((relativePath, zipEntry) => {
        if (zipEntry.dir) return;
        promises.push(
          zipEntry.async('string').then(content => {
            const existing = proj.files.find(f => f.name === relativePath);
            if (existing) { existing.content = content; }
            else { createFileInProject(relativePath, content); }
          })
        );
      });
      await Promise.all(promises);
      termLog(`[AweiClaw] ZIP extracted: ${promises.length} files.`, 'success');
    } else {
      // Inject JSZip dynamically
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
      await handleZipFile(file); // retry
    }
  } catch (err) {
    termLog(`[AweiClaw] ZIP error: ${err.message}`, 'err');
  }
}

// ═══════════════════════════════════════════
//  FEATURE 10: AI Usage Dashboard
// ═══════════════════════════════════════════
function getUsageData() {
  return ls('aweiclaw_ai_usage') || { calls: [], totalTokens: 0, totalCalls: 0, modelCounts: {} };
}
function trackAIUsage(tokens, model) {
  const data = getUsageData();
  const today = new Date().toISOString().split('T')[0];
  data.totalTokens = (data.totalTokens || 0) + tokens;
  data.totalCalls = (data.totalCalls || 0) + 1;
  data.modelCounts = data.modelCounts || {};
  data.modelCounts[model] = (data.modelCounts[model] || 0) + 1;
  data.calls.push({ date: today, tokens, model, time: Date.now() });
  // Keep last 500 calls
  if (data.calls.length > 500) data.calls = data.calls.slice(-500);
  lsSet('aweiclaw_ai_usage', data);
}
function showUsageDashboard() {
  document.getElementById('usage-overlay').classList.remove('hidden');
  renderUsageDashboard();
}
function closeUsageDashboard() {
  document.getElementById('usage-overlay').classList.add('hidden');
}
function renderUsageDashboard() {
  const data = getUsageData();
  const today = new Date().toISOString().split('T')[0];
  const todayCalls = (data.calls || []).filter(c => c.date === today).length;
  document.getElementById('usage-today-calls').textContent = todayCalls;
  document.getElementById('usage-total-tokens').textContent = (data.totalTokens || 0).toLocaleString();
  const estCost = (data.totalTokens || 0) / 1000000 * 1.0; // ~¥1 per 1M tokens
  document.getElementById('usage-est-cost').textContent = '¥' + estCost.toFixed(2);
  document.getElementById('usage-total-calls').textContent = (data.totalCalls || 0).toLocaleString();
  // Model bars
  const modelCounts = data.modelCounts || {};
  const totalModelCalls = Math.max(Object.values(modelCounts).reduce((a, b) => a + b, 0), 1);
  const barsEl = document.getElementById('usage-model-bars');
  const colors = ['var(--primary)', 'var(--pink)', 'var(--success)', 'var(--warning)', 'var(--danger)', '#8B5CF6'];
  barsEl.innerHTML = Object.entries(modelCounts).sort((a, b) => b[1] - a[1]).map(([model, count], i) => {
    const pct = ((count / totalModelCalls) * 100).toFixed(1);
    return '<div class="usage-bar-item"><span class="usage-bar-name">' + esc(model) + '</span><div class="usage-bar-track"><div class="usage-bar-fill" style="width:' + pct + '%;background:' + (colors[i % colors.length]) + '"></div></div><span class="usage-bar-val">' + count + ' (' + pct + '%)</span></div>';
  }).join('') || '<div style="font-size:11px;color:var(--text-muted)">No data yet</div>';
  // Timeline (last 7 days)
  const timelineEl = document.getElementById('usage-timeline');
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().split('T')[0]);
  }
  const dayCounts = days.map(day => (data.calls || []).filter(c => c.date === day).length);
  const maxCount = Math.max(...dayCounts, 1);
  timelineEl.innerHTML = dayCounts.map((count, i) => {
    const h = Math.max((count / maxCount) * 100, 2);
    return '<div class="usage-timeline-cell" style="height:' + h + '%;flex:1;" title="' + days[i] + ': ' + count + ' calls"></div>';
  }).join('');
}

// Dialog confirm by Enter
document.getElementById('new-project-name').addEventListener('keydown', function(e) { if (e.key === 'Enter') createNewProject(); });
document.getElementById('new-file-name').addEventListener('keydown', function(e) { if (e.key === 'Enter') createNewFile(); });

// ═══════════════════════════════════════════
//  FEATURE 11: Editor Font Zoom (Ctrl+=/Ctrl+-/Ctrl+0)
// ═══════════════════════════════════════════
let editorFontSize = parseInt(localStorage.getItem('aweiclaw_font_size')) || 13;
function applyEditorFontSize() {
  document.documentElement.style.setProperty('--editor-font-size', editorFontSize + 'px');
  localStorage.setItem('aweiclaw_font_size', editorFontSize);
}
applyEditorFontSize();

// Extend keyboard shortcuts for font zoom
document.addEventListener('keydown', function(e) {
  const ctrl = e.ctrlKey || e.metaKey;
  // Only in editor
  if (document.activeElement !== document.getElementById('code-textarea')) return;
  if (ctrl && (e.key === '=' || e.key === '+')) {
    e.preventDefault();
    editorFontSize = Math.min(24, editorFontSize + 1);
    applyEditorFontSize();
  }
  if (ctrl && e.key === '-') {
    e.preventDefault();
    editorFontSize = Math.max(8, editorFontSize - 1);
    applyEditorFontSize();
  }
  if (ctrl && e.key === '0') {
    e.preventDefault();
    editorFontSize = 13;
    applyEditorFontSize();
  }
});

// ═══════════════════════════════════════════
//  FEATURE 12: Ghost Text AI Completion
// ═══════════════════════════════════════════
let ghostDebounceTimer = null;
let ghostPendingText = '';
let ghostCursorPos = 0;

function triggerGhostCompletion() {
  const ta = document.getElementById('code-textarea');
  if (!ta) return;
  const pos = ta.selectionStart;
  const code = ta.value;
  // Get current line context (up to 500 chars before cursor)
  const before = code.substring(Math.max(0, pos - 500), pos);
  const after = code.substring(pos, Math.min(code.length, pos + 100));
  // Only trigger if there's meaningful context (at least 10 chars)
  if (before.trim().length < 10) { hideGhostText(); return; }
  ghostCursorPos = pos;

  clearTimeout(ghostDebounceTimer);
  ghostDebounceTimer = setTimeout(async () => {
    try {
      const resp = await fetch(AI_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + AI_API_KEY },
        body: JSON.stringify({
          model: AI_MODEL,
          messages: [{
            role: 'user',
            content: `You are a code completion engine. Complete the code IMMEDIATELY after the cursor. Output ONLY the completion text — no explanations, no markdown, no code blocks. Continue naturally from where the cursor is. The completion should be 1-3 lines maximum.

Code before cursor:
\`\`\`
${before}
\`\`\`

Code after cursor:
\`\`\`
${after}
\`\`\`

Completion (output ONLY what goes at cursor position):`
          }],
          max_tokens: 80, temperature: 0.1, stream: false,
        }),
      });
      if (!resp.ok) return;
      const data = await resp.json();
      const text = (data.choices?.[0]?.message?.content || '').trim();
      // Clean up common AI artifacts
      let clean = text.replace(/^```\w*\n?/g, '').replace(/\n?```$/g, '').trim();
      // Don't show if it's too long or empty
      if (!clean || clean.length > 200 || clean.includes('```')) { hideGhostText(); return; }
      ghostPendingText = clean;
      showGhostText(clean);
    } catch (_) { hideGhostText(); }
  }, 800);
}

function showGhostText(text) {
  const ta = document.getElementById('code-textarea');
  const overlay = document.getElementById('ghost-text-overlay');
  const content = document.getElementById('ghost-text-content');
  if (!ta || !overlay || !content) return;
  const rect = ta.getBoundingClientRect();
  const editorContent = ta.parentElement;
  const ecRect = editorContent.getBoundingClientRect();
  overlay.style.top = (rect.top - ecRect.top) + 'px';
  overlay.style.left = (rect.left - ecRect.left) + 'px';
  overlay.style.width = rect.width + 'px';
  overlay.style.height = rect.height + 'px';

  // Position ghost text at cursor
  const pos = ghostCursorPos;
  const beforeAtCursor = ta.value.substring(0, pos);
  const lines = beforeAtCursor.split('\n');
  const lastLine = lines[lines.length - 1];
  const lineIdx = lines.length - 1;
  const lineH = parseFloat(getComputedStyle(ta).lineHeight) || 20.8;
  const charW = 7.8; // Approximate monospace char width at 13px
  const x = lastLine.length * charW + 20;
  const y = lineIdx * lineH + 14;

  content.textContent = text;
  content.style.position = 'absolute';
  content.style.left = x + 'px';
  content.style.top = y + 'px';

  overlay.classList.remove('hidden');
  overlay.classList.add('visible');
}

function hideGhostText() {
  const overlay = document.getElementById('ghost-text-overlay');
  if (overlay) { overlay.classList.add('hidden'); overlay.classList.remove('visible'); }
  ghostPendingText = '';
}

function acceptGhostText() {
  if (!ghostPendingText) return;
  const ta = document.getElementById('code-textarea');
  if (!ta) return;
  const pos = ghostCursorPos;
  ta.value = ta.value.substring(0, pos) + ghostPendingText + ta.value.substring(pos);
  ta.selectionStart = ta.selectionEnd = pos + ghostPendingText.length;
  hideGhostText();
  onCodeChange();
  ta.focus();
  termLog('[AweiClaw] Ghost text accepted.', 'info');
}

// Hook into existing onCodeChange to trigger ghost text
const _origOnCodeChange2 = onCodeChange;
onCodeChange = function() {
  _origOnCodeChange2();  // Feature 8's wrapper already calls markAutoSaveDirty()
  // Trigger ghost text after typing pause
  triggerGhostCompletion();
};

// Hook Tab to accept ghost text
const _origHandleEditorKey = handleEditorKey;
handleEditorKey = function(e) {
  if (e.key === 'Tab' && ghostPendingText) {
    e.preventDefault();
    acceptGhostText();
    return;
  }
  // Ctrl+Shift+M → add bookmark
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'M' || e.key === 'm')) {
    e.preventDefault();
    toggleBookmarkAtCursor();
    return;
  }
  hideGhostText();
  _origHandleEditorKey(e);
};

// ═══════════════════════════════════════════
//  FEATURE 13: AI Test Generator
// ═══════════════════════════════════════════
async function generateTests() {
  const file = getActiveFile();
  if (!file) { alert('Open a file first to generate tests.'); return; }
  const code = document.getElementById('code-textarea').value;
  if (!code.trim()) { alert('The file is empty.'); return; }
  const ext = getExtension(file.name);
  const testFrameworks = {
    py: { name: 'pytest', ext: 'py', filePattern: 'test_$NAME' },
    js: { name: 'Jest', ext: 'js', filePattern: '$NAME.test.js' },
    jsx: { name: 'Jest + React Testing Library', ext: 'js', filePattern: '$NAME.test.js' },
    ts: { name: 'Jest', ext: 'ts', filePattern: '$NAME.test.ts' },
    tsx: { name: 'Jest + React Testing Library', ext: 'tsx', filePattern: '$NAME.test.tsx' },
    cpp: { name: 'Google Test', ext: 'cpp', filePattern: 'test_$NAME' },
    cc: { name: 'Google Test', ext: 'cpp', filePattern: 'test_$NAME' },
    cs: { name: 'xUnit', ext: 'cs', filePattern: '$NAME.Tests.cs' },
    html: { name: 'Jest (DOM)', ext: 'js', filePattern: '$NAME.test.js' },
    css: null,
  };
  const fw = testFrameworks[ext];
  if (!fw) { alert('Test generation is not supported for .' + ext + ' files yet.\nSupported: .py, .js, .ts, .tsx, .cpp, .cs'); return; }

  const baseName = file.name.replace(/\.[^.]+$/, '');
  const testFileName = fw.filePattern.replace('$NAME', baseName) + '.' + fw.ext;

  termLog('[AweiClaw] Generating ' + fw.name + ' tests for ' + file.name + '...', 'ai');

  const prompt = `Generate comprehensive unit tests for this ${ext.toUpperCase()} code using ${fw.name}. 
Output ONLY the test code — no explanations, no markdown code blocks (no \`\`\`).

Code to test:
${code}

Write the complete test file:`;

  try {
    const resp = await fetch(AI_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + AI_API_KEY },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 4096, temperature: 0.2, stream: false,
      }),
    });
    if (!resp.ok) throw new Error('API error ' + resp.status);
    const data = await resp.json();
    let testCode = data.choices[0].message.content;
    // Clean up markdown if present
    testCode = testCode.replace(/^```\w*\n?/g, '').replace(/\n?```$/g, '').trim();

    // Create the test file
    if (!state.currentProject) { showNewProjectDialog(); return; }
    createFileInProject(testFileName, testCode);
    termLog('[AweiClaw] Test file "' + testFileName + '" created with ' + fw.name + ' tests!', 'success');

    // Also show in AI panel
    const container = document.getElementById('ai-messages');
    const msg = document.createElement('div');
    msg.className = 'ai-msg assistant';
    msg.innerHTML = '<p>🧪 Generated <strong>' + testFileName + '</strong> with <strong>' + fw.name + '</strong> tests. The file is open in the editor.</p>';
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
  } catch (err) {
    termLog('[AweiClaw] Test generation failed: ' + (err.message || err), 'err');
    alert('Test generation failed: ' + (err.message || err));
  }
}

// ═══════════════════════════════════════════
//  FEATURE 14: AI Error Auto Explainer
// ═══════════════════════════════════════════
let lastErrorInfo = null;

function showErrorBubble(errorMsg, errorCode) {
  lastErrorInfo = { msg: errorMsg, code: errorCode };
  const bubble = document.getElementById('error-explain-bubble');
  if (!bubble) return;
  bubble.classList.remove('hidden');
  // Auto-hide after 30 seconds
  clearTimeout(bubble._timeout);
  bubble._timeout = setTimeout(() => bubble.classList.add('hidden'), 30000);
}

async function explainLastError() {
  if (!lastErrorInfo) return;
  const bubble = document.getElementById('error-explain-bubble');
  if (bubble) bubble.classList.add('hidden');

  const file = getActiveFile();
  const code = lastErrorInfo.code || (file ? document.getElementById('code-textarea').value : '');
  const errorMsg = lastErrorInfo.msg;

  document.getElementById('ai-textarea').value = 'This code just produced an error. Please explain why and suggest a fix:\n\nError:\n' + errorMsg + '\n\nCode:\n```\n' + code.substring(0, 3000) + '\n```';
  sendAIMessage();
  lastErrorInfo = null;
}

// Hook into runPython / runJavaScript / runCpp error paths
const _origRunPython = runPython;
runPython = async function(fileName, code) {
  try { await _origRunPython(fileName, code); }
  catch (err) { showErrorBubble(err.message || String(err), code); throw err; }
  // Check for runtime errors in output
  setTimeout(() => {
    const output = document.getElementById('run-output-content');
    if (output) {
      const errLines = output.querySelectorAll('.run-output-line.stderr');
      if (errLines.length > 0) {
        const errText = Array.from(errLines).map(l => l.textContent).join('\n');
        showErrorBubble(errText, code);
      }
    }
  }, 500);
};

const _origRunJavaScript = runJavaScript;
runJavaScript = async function(fileName, code) {
  try { await _origRunJavaScript(fileName, code); }
  catch (err) { showErrorBubble(err.message || String(err), code); throw err; }
  setTimeout(() => {
    const output = document.getElementById('run-output-content');
    if (output) {
      const errLines = output.querySelectorAll('.run-output-line.stderr');
      if (errLines.length > 0) {
        const errText = Array.from(errLines).map(l => l.textContent).join('\n');
        showErrorBubble(errText, code);
      }
    }
  }, 500);
};

const _origRunCpp = runCpp;
runCpp = async function(fileName, code) {
  try { await _origRunCpp(fileName, code); }
  catch (err) { showErrorBubble(err.message || String(err), code); throw err; }
  setTimeout(() => {
    const output = document.getElementById('run-output-content');
    if (output) {
      const errLines = output.querySelectorAll('.run-output-line.stderr');
      if (errLines.length > 0) {
        const errText = Array.from(errLines).map(l => l.textContent).join('\n');
        showErrorBubble(errText, code);
      }
    }
  }, 500);
};

// ═══════════════════════════════════════════
//  FEATURE 15: Export Project as ZIP
// ═══════════════════════════════════════════
async function exportProjectZIP() {
  const proj = getCurrentProject();
  if (!proj || !proj.files || Object.keys(proj.files).length === 0) {
    alert('No project or files to export.');
    return;
  }
  termLog('[AweiClaw] Packaging project "' + proj.name + '" as ZIP...', 'info');

  // Ensure JSZip is loaded
  if (typeof JSZip === 'undefined') {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  const zip = new JSZip();
  const files = proj.files;
  for (const f of Object.values(files)) {
    zip.file(f.name, f.content || '');
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (proj.name || 'project') + '.zip';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  termLog('[AweiClaw] Project exported as "' + a.download + '" (' + Object.keys(files).length + ' files).', 'success');
}

// ═══════════════════════════════════════════
//  FEATURE 16: Bundle to Single HTML
// ═══════════════════════════════════════════
function bundleToSingleHTML() {
  const proj = getCurrentProject();
  if (!proj || !proj.files || Object.keys(proj.files).length === 0) {
    alert('No project files to bundle. Create an HTML project first.');
    return;
  }
  const files = proj.files;

  // Find the main HTML file
  let htmlFile = null;
  for (const f of Object.values(files)) {
    const ext = getExtension(f.name);
    if (ext === 'html' || ext === 'htm') { htmlFile = f; break; }
  }
  if (!htmlFile) {
    // Create a wrapper HTML from all files
    let bundled = '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>' + esc(proj.name || 'Project') + '</title>\n';

    // Inline CSS files
    for (const f of Object.values(files)) {
      if (getExtension(f.name) === 'css') {
        bundled += '<style>\n' + (f.content || '') + '\n</style>\n';
      }
    }

    bundled += '</head>\n<body>\n';

    // Inline JS files
    for (const f of Object.values(files)) {
      if (getExtension(f.name) === 'js') {
        bundled += '<script>\n' + (f.content || '') + '\n</' + 'script>\n';
      }
    }

    bundled += '</body>\n</html>';
    downloadBundle(bundled, (proj.name || 'project') + '.html');
    termLog('[AweiClaw] Bundled project into single HTML.', 'success');
    return;
  }

  // Has a main HTML - inline CSS and JS references
  let html = htmlFile.content || '';
  const cssFiles = Object.values(files).filter(f => getExtension(f.name) === 'css');
  const jsFiles = Object.values(files).filter(f => getExtension(f.name) === 'js');

  // Replace <link rel="stylesheet" href="..."> with inline <style>
  html = html.replace(/<link[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*\/?>/gi, (match, href) => {
    const cssFile = cssFiles.find(f => f.name === href || f.name === href.split('/').pop());
    if (cssFile) return '<style>\n' + (cssFile.content || '') + '\n</style>';
    return match;
  });

  // Replace <script src="..."></script> with inline <script>
  html = html.replace(/<script[^>]*src=["']([^"']+)["'][^>]*>\s*<\/script>/gi, (match, src) => {
    const jsFile = jsFiles.find(f => f.name === src || f.name === src.split('/').pop());
    if (jsFile) return '<script>\n' + (jsFile.content || '') + '\n</' + 'script>';
    return match;
  });

  // If no replacements happened, still inline all CSS/JS at end
  if (!html.includes('<style>') && cssFiles.length > 0) {
    const allCSS = cssFiles.map(f => f.content || '').join('\n');
    html = html.replace('</head>', '<style>\n' + allCSS + '\n</style>\n</head>');
  }
  if (!html.includes('<script>') && jsFiles.length > 0) {
    const allJS = jsFiles.map(f => f.content || '').join('\n');
    html = html.replace('</body>', '<script>\n' + allJS + '\n</' + 'script>\n</body>');
  }

  downloadBundle(html, htmlFile.name.replace(/\.\w+$/, '') + '.bundled.html');
  termLog('[AweiClaw] Bundled "' + htmlFile.name + '" + ' + (cssFiles.length + jsFiles.length) + ' assets into single HTML.', 'success');
}

function downloadBundle(content, filename) {
  const blob = new Blob([content], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ═══════════════════════════════════════════
//  FEATURE 17: File Pinning & Bookmarks
// ═══════════════════════════════════════════
let pinnedFiles = JSON.parse(localStorage.getItem('aweiclaw_pinned') || '{}');
let bookmarks = JSON.parse(localStorage.getItem('aweiclaw_bookmarks') || '{}');

// Also hook right-click on sidebar files
const _origRefreshSidebar = refreshSidebar;
refreshSidebar = function() {
  _origRefreshSidebar();
  // Add right-click to sidebar items
  setTimeout(() => {
    document.querySelectorAll('.sidebar-file-item').forEach(item => {
      if (item._hasPinCtx) return;
      item._hasPinCtx = true;
      item.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        const fileName = item.querySelector('.sidebar-file-name')?.textContent || '';
        showSidebarContextMenu(e, fileName);
      });
    });
    renderPinnedFiles();
    renderBookmarks();
  }, 50);
};

function showSidebarContextMenu(e, fileName) {
  const old = document.getElementById('sidebar-ctx-menu');
  if (old) old.remove();

  const menu = document.createElement('div');
  menu.id = 'sidebar-ctx-menu';
  menu.style.cssText = 'position:fixed;min-width:140px;background:var(--bg);border:1px solid var(--border);border-radius:8px;box-shadow:var(--shadow-lg);z-index:400;padding:4px 0;';
  menu.style.left = e.clientX + 'px';
  menu.style.top = e.clientY + 'px';

  const projId = state.currentProject;
  const pinKey = projId + '|' + fileName;
  const isPinned = pinnedFiles[pinKey];

  menu.innerHTML = `
    <button onclick="togglePinFile('${escAttr(pinKey)}','${escAttr(fileName)}');this.parentElement.remove();" style="display:block;width:100%;text-align:left;padding:6px 14px;border:none;background:none;color:var(--text-primary);cursor:pointer;font-size:12px;">
      ${isPinned ? '📌 Unpin' : '📌 Pin'}
    </button>
    <button onclick="navigator.clipboard.writeText('${escAttr(fileName)}');this.parentElement.remove();" style="display:block;width:100%;text-align:left;padding:6px 14px;border:none;background:none;color:var(--text-primary);cursor:pointer;font-size:12px;">
      📋 Copy Name
    </button>
  `;

  document.body.appendChild(menu);
  const close = function(ev) { if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('click', close); } };
  setTimeout(() => document.addEventListener('click', close), 0);
}

function togglePinFile(pinKey, fileName) {
  if (pinnedFiles[pinKey]) {
    delete pinnedFiles[pinKey];
    termLog('[AweiClaw] Unpinned: ' + fileName, 'info');
  } else {
    pinnedFiles[pinKey] = { name: fileName, projId: state.currentProject, pinnedAt: Date.now() };
    termLog('[AweiClaw] Pinned: ' + fileName, 'info');
  }
  localStorage.setItem('aweiclaw_pinned', JSON.stringify(pinnedFiles));
  renderPinnedFiles();
}

function renderPinnedFiles() {
  const container = document.getElementById('sidebar-pinned');
  const list = document.getElementById('sidebar-pinned-list');
  if (!container || !list) return;

  const projPinned = Object.entries(pinnedFiles)
    .filter(([k]) => k.startsWith((state.currentProject || '') + '|'));

  if (projPinned.length === 0) { container.classList.add('hidden'); return; }
  container.classList.remove('hidden');

  list.innerHTML = projPinned.map(([key, info]) => {
    return '<div class="sidebar-pinned-item" onclick="openPinnedFile(\'' + escAttr(info.name) + '\')">' +
      '📌 ' + esc(info.name) +
      '<button class="pin-unpin" onclick="event.stopPropagation();togglePinFile(\'' + escAttr(key) + '\',\'' + escAttr(info.name) + '\')">✕</button>' +
      '</div>';
  }).join('');
}

function openPinnedFile(fileName) {
  const proj = getCurrentProject();
  if (!proj) return;
  const file = Object.values(proj.files).find(f => f.name === fileName);
  if (file) {
    if (!state.openFiles.find(f => f.id === file.id)) state.openFiles.push({ ...file });
    state.activeFileId = file.id;
    refreshSidebar(); refreshEditorState(); reloadSnippetsForFile();
  }
}

// Bookmarks
function toggleBookmarkAtCursor() {
  const file = getActiveFile();
  if (!file) return;
  const ta = document.getElementById('code-textarea');
  if (!ta) return;
  const pos = ta.selectionStart;
  const before = ta.value.substring(0, pos);
  const lineNum = before.split('\n').length;

  const key = file.id + '|' + lineNum;
  if (bookmarks[key]) {
    delete bookmarks[key];
    termLog('[AweiClaw] Bookmark removed at line ' + lineNum, 'info');
  } else {
    const lineText = ta.value.split('\n')[lineNum - 1]?.trim().substring(0, 40) || '';
    bookmarks[key] = { fileId: file.id, fileName: file.name, line: lineNum, text: lineText, addedAt: Date.now() };
    termLog('[AweiClaw] Bookmark added at line ' + lineNum + ': ' + lineText, 'info');
  }
  localStorage.setItem('aweiclaw_bookmarks', JSON.stringify(bookmarks));
  renderBookmarks();
  renderBookmarkGutterIcons();
}

function renderBookmarks() {
  const container = document.getElementById('sidebar-bookmarks');
  const list = document.getElementById('sidebar-bookmarks-list');
  if (!container || !list) return;

  const currentFile = getActiveFile();
  const fileBookmarks = Object.entries(bookmarks)
    .filter(([k]) => currentFile && k.startsWith(currentFile.id + '|'))
    .sort((a, b) => a[1].line - b[1].line);

  if (fileBookmarks.length === 0) { container.classList.add('hidden'); return; }
  container.classList.remove('hidden');

  list.innerHTML = fileBookmarks.map(([key, bm]) => {
    return '<div class="sidebar-bookmark-item" onclick="goToBookmark(\'' + escAttr(key) + '\')">' +
      '🔖 L' + bm.line + ' <span style="color:var(--text-muted)">' + esc(bm.text || '') + '</span>' +
      '<button class="bm-delete" onclick="event.stopPropagation();deleteBookmark(\'' + escAttr(key) + '\')">✕</button>' +
      '</div>';
  }).join('');
}

function goToBookmark(key) {
  const bm = bookmarks[key];
  if (!bm) return;
  // Open file if needed
  const file = getActiveFile();
  if (!file || file.id !== bm.fileId) {
    const proj = getCurrentProject();
    if (proj) {
      const f = Object.values(proj.files).find(x => x.id === bm.fileId);
      if (f) {
        if (!state.openFiles.find(x => x.id === f.id)) state.openFiles.push({ ...f });
        state.activeFileId = f.id;
        refreshEditorState();
      }
    }
  }
  setTimeout(() => {
    const ta = document.getElementById('code-textarea');
    if (!ta) return;
    const lines = ta.value.split('\n');
    let pos = 0;
    for (let i = 0; i < Math.min(bm.line - 1, lines.length); i++) pos += lines[i].length + 1;
    ta.focus();
    ta.setSelectionRange(pos, pos);
    ta.blur(); ta.focus();
  }, 150);
}

function deleteBookmark(key) {
  delete bookmarks[key];
  localStorage.setItem('aweiclaw_bookmarks', JSON.stringify(bookmarks));
  renderBookmarks();
  renderBookmarkGutterIcons();
}

// Gutter bookmark icons
function renderBookmarkGutterIcons() {
  const lnEl = document.getElementById('line-numbers');
  if (!lnEl) return;
  // Remove old icons
  lnEl.querySelectorAll('.bookmark-gutter-icon').forEach(el => el.remove());

  const file = getActiveFile();
  if (!file) return;
  const fileBookmarks = Object.entries(bookmarks)
    .filter(([k]) => k.startsWith(file.id + '|'))
    .sort((a, b) => a[1].line - b[1].line);

  lnEl.style.position = 'relative';
  const lineH = 20.8;
  fileBookmarks.forEach(([key, bm]) => {
    const icon = document.createElement('span');
    icon.className = 'bookmark-gutter-icon';
    icon.style.top = ((bm.line - 1) * lineH) + 'px';
    icon.textContent = '🔖';
    icon.title = 'Line ' + bm.line + ': ' + (bm.text || '');
    icon.onclick = function(e) { e.stopPropagation(); goToBookmark(key); };
    lnEl.appendChild(icon);
  });
}

// Hook refreshEditorState to also render bookmarks
const _origRefreshEditorState3 = refreshEditorState;
refreshEditorState = async function() {
  await _origRefreshEditorState3();
  setTimeout(() => {
    renderBookmarks();
    renderBookmarkGutterIcons();
    renderPinnedFiles();
    saveWorkspaceMemory();
  }, 100);
};
// The original _origRefreshEditorState was already defined; this one replaces the chain
// Actually, the original is now double-wrapped. Let's fix: the original was already captured
// by tab context menu hook. This will chain: orig3 → tabCtx(orig) → actual orig
// That works fine — feature 17 adds workspace memory save after each state refresh.

// ═══════════════════════════════════════════
//  FEATURE 18: Workspace Memory
// ═══════════════════════════════════════════
function saveWorkspaceMemory() {
  if (!state.currentProject) return;
  const mem = {
    openFileIds: state.openFiles.map(f => f.id),
    activeFileId: state.activeFileId,
    timestamp: Date.now(),
  };
  // Save scroll position
  const ta = document.getElementById('code-textarea');
  if (ta) {
    mem.editorScrollTop = ta.scrollTop;
    mem.editorCursorPos = ta.selectionStart;
  }
  // Save AI panel scroll
  const aiMsgs = document.getElementById('ai-messages');
  if (aiMsgs) mem.aiScrollTop = aiMsgs.scrollTop;

  const allMem = JSON.parse(localStorage.getItem('aweiclaw_workspace_mem') || '{}');
  allMem[state.currentProject] = mem;
  localStorage.setItem('aweiclaw_workspace_mem', JSON.stringify(allMem));
}

function restoreWorkspaceMemory() {
  if (!state.currentProject) return;
  const allMem = JSON.parse(localStorage.getItem('aweiclaw_workspace_mem') || '{}');
  const mem = allMem[state.currentProject];
  if (!mem || !mem.openFileIds || mem.openFileIds.length === 0) return;

  const proj = getCurrentProject();
  if (!proj) return;

  // Restore open files
  const restoredFiles = [];
  for (const fid of mem.openFileIds) {
    const file = Object.values(proj.files).find(f => f.id === fid);
    if (file) restoredFiles.push({ ...file });
  }
  if (restoredFiles.length > 0) {
    state.openFiles = restoredFiles;
    state.activeFileId = mem.activeFileId && restoredFiles.find(f => f.id === mem.activeFileId)
      ? mem.activeFileId
      : restoredFiles[0].id;
    refreshEditorState();

    // Restore scroll/cursor after editor renders
    setTimeout(() => {
      const ta = document.getElementById('code-textarea');
      if (ta && mem.editorScrollTop) {
        ta.scrollTop = mem.editorScrollTop;
      }
      if (ta && mem.editorCursorPos) {
        ta.setSelectionRange(mem.editorCursorPos, mem.editorCursorPos);
      }
      const aiMsgs = document.getElementById('ai-messages');
      if (aiMsgs && mem.aiScrollTop) {
        aiMsgs.scrollTop = mem.aiScrollTop;
      }
      termLog('[AweiClaw] Workspace restored (' + restoredFiles.length + ' tabs).', 'info');
    }, 300);
  }
}

// Hook project switch to save/restore workspace
const _origSwitchProject = switchProject;
switchProject = function(projectId) {
  if (state.currentProject) saveWorkspaceMemory();
  _origSwitchProject(projectId);
  if (projectId) {
    setTimeout(restoreWorkspaceMemory, 200);
  }
};

// ═══════════════════════════════════════════
//  FEATURE 19: AI Commit Message Generator
// ═══════════════════════════════════════════
async function generateCommitMessage() {
  const file = getActiveFile();
  if (!file) { alert('Open a file first.'); return; }
  const currentContent = document.getElementById('code-textarea').value;
  if (!currentContent.trim()) { alert('File is empty.'); return; }

  // Get previous saved version for diff
  let previousContent = '';
  if (state.currentProject && !file.id.startsWith('local_')) {
    const projects = getProjects();
    const proj = projects[state.currentProject];
    if (proj && proj.files[file.id]) {
      previousContent = proj.files[file.id].content || '';
    }
  }

  // If no previous version or same content, just analyze the current file
  const isNew = !previousContent || previousContent === currentContent;

  termLog('[AweiClaw] Generating commit message for ' + file.name + '...', 'ai');

  let prompt;
  if (isNew) {
    prompt = `Analyze this code file and generate a Conventional Commits message (format: type(scope): description). Types: feat, fix, docs, style, refactor, perf, test, chore, ci, build. Output ONLY the commit message, nothing else.

File: ${file.name}
Code:
${currentContent.substring(0, 4000)}`;
  } else {
    prompt = `Compare these two versions of a file and generate a Conventional Commits message describing the changes. Format: type(scope): description. Types: feat, fix, docs, style, refactor, perf, test, chore, ci, build. Output ONLY the commit message, nothing else.

File: ${file.name}

Previous version:
${previousContent.substring(0, 2000)}

Current version:
${currentContent.substring(0, 2000)}`;
  }

  try {
    const resp = await fetch(AI_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + AI_API_KEY },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 100, temperature: 0.3, stream: false,
      }),
    });
    if (!resp.ok) throw new Error('API error ' + resp.status);
    const data = await resp.json();
    let msg = (data.choices[0].message.content || '').trim();

    // Clean up
    msg = msg.replace(/^["'`]|["'`]$/g, '').replace(/^commit message:?\s*/i, '').trim();
    // Ensure conventional format
    if (!/^(feat|fix|docs|style|refactor|perf|test|chore|ci|build)(\(.+\))?:/.test(msg)) {
      msg = 'chore: ' + msg;
    }

    // Copy to clipboard
    await navigator.clipboard.writeText(msg);
    termLog('[AweiClaw] Commit message copied: ' + msg, 'success');

    // Show in AI panel
    const container = document.getElementById('ai-messages');
    const msgEl = document.createElement('div');
    msgEl.className = 'ai-msg assistant';
    msgEl.innerHTML = '<p>💬 <strong>Commit Message</strong> (copied to clipboard):</p><pre>' + esc(msg) + '</pre>';
    container.appendChild(msgEl);
    container.scrollTop = container.scrollHeight;

    // Also show toast-like notification
    showCommitToast(msg);
  } catch (err) {
    termLog('[AweiClaw] Commit message generation failed: ' + (err.message || err), 'err');
  }
}

function showCommitToast(msg) {
  const toast = document.createElement('div');
  toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#0D1117;color:#3FB950;padding:12px 24px;border-radius:12px;font-family:monospace;font-size:13px;z-index:9999;box-shadow:0 8px 32px rgba(0,0,0,0.4);animation:slideUp 0.3s ease;';
  toast.textContent = '📋 Copied: ' + msg;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

// ═══════════════════════════════════════════
//  CHAT VIEW — Core Functions
// ═══════════════════════════════════════════

async function initChatView() {
  if (chatState.expertCatalog.length === 0) await loadExpertCatalog();
  if (!chatState.currentSessionId) {
    newChatSession();
  } else {
    loadChatSession(chatState.currentSessionId);
  }
  renderExpertList();
  renderExpertCategories();
}

async function loadExpertCatalog() {
  try {
    const resp = await fetch('experts/catalog.json');
    if (!resp.ok) throw new Error('Failed to load expert catalog');
    chatState.expertCatalog = await resp.json();
    renderExpertCategories();
    renderExpertList();
  } catch (err) {
    console.error('[Chat] Failed to load expert catalog:', err);
    chatState.expertCatalog = [];
  }
}

function renderExpertCategories() {
  const container = document.getElementById('chat-expert-categories');
  if (!container) return;
  const cats = ['all', ...new Set(chatState.expertCatalog.map(e => e.category))];
  const catNames = { all: 'All', '编程开发': 'Dev', '生活旅行': 'Life', '科学人文': 'Science', '娱乐创意': 'Creative', '交叉领域': 'Cross' };
  container.innerHTML = cats.map(c =>
    `<button class="chat-expert-cat-btn${c === chatState.currentCategory ? ' active' : ''}" onclick="setExpertCategory('${c}')">${catNames[c] || c}</button>`
  ).join('');
}

function setExpertCategory(cat) {
  chatState.currentCategory = cat;
  renderExpertCategories();
  renderExpertList();
}

function renderExpertList() {
  const container = document.getElementById('chat-expert-list');
  if (!container) return;
  const searchTerm = (document.getElementById('chat-expert-search')?.value || '').toLowerCase();
  let filtered = chatState.expertCatalog;
  if (chatState.currentCategory !== 'all') {
    filtered = filtered.filter(e => e.category === chatState.currentCategory);
  }
  if (searchTerm) {
    filtered = filtered.filter(e =>
      e.name.toLowerCase().includes(searchTerm) ||
      e.name_en.toLowerCase().includes(searchTerm) ||
      e.id.toLowerCase().includes(searchTerm)
    );
  }
  container.innerHTML = filtered.map(e => {
    const isSelected = chatState.selectedExperts.find(s => s.id === e.id);
    return `<div class="chat-expert-item${isSelected ? ' selected' : ''}" onclick="toggleExpert('${e.id}')">
      <div>
        <div class="chat-expert-item-name">${esc(e.name)}</div>
        <div class="chat-expert-item-cat">${esc(e.category)}</div>
      </div>
      <span class="chat-expert-item-add">${isSelected ? '−' : '+'}</span>
    </div>`;
  }).join('') || '<div style="padding:12px;text-align:center;color:var(--text-muted);font-size:12px;">No experts found</div>';
}

function toggleExpert(id) {
  const expert = chatState.expertCatalog.find(e => e.id === id);
  if (!expert) return;
  const idx = chatState.selectedExperts.findIndex(s => s.id === id);
  if (idx >= 0) {
    chatState.selectedExperts.splice(idx, 1);
  } else {
    if (chatState.selectedExperts.length >= 5) {
      alert('Maximum 5 experts can be selected.');
      return;
    }
    chatState.selectedExperts.push(expert);
  }
  updateExpertCount();
  renderExpertList();
  renderSelectedExperts();
  saveCurrentSession();
}

function updateExpertCount() {
  const el = document.getElementById('chat-expert-count');
  if (el) el.textContent = chatState.selectedExperts.length + '/5';
}

function renderSelectedExperts() {
  const container = document.getElementById('chat-selected-experts');
  if (!container) return;
  container.innerHTML = chatState.selectedExperts.map(e =>
    `<span class="chat-input-file-chip" title="${esc(e.name)} — ${esc(e.category)}">
      ${esc(e.name_en || e.name)}
      <span class="remove-chip" onclick="event.stopPropagation();toggleExpert('${e.id}')">×</span>
    </span>`
  ).join('');
}

function filterExperts() {
  renderExpertList();
}

function setChatMode(mode) {
  chatState.mode = mode;
  document.querySelectorAll('.chat-mode-card').forEach(c => {
    c.classList.toggle('active', c.dataset.mode === mode);
  });
  saveCurrentSession();
}

function setChatModel(model) {
  chatState.model = model;
  saveCurrentSession();
}

function toggleChatAutoSave() {
  chatState.autoSave = document.getElementById('chat-autosave-toggle').checked;
  saveCurrentSession();
}

function toggleChatSecure() {
  chatState.safeMode = document.getElementById('chat-secure-toggle').checked;
  saveCurrentSession();
}

// ═══════════════════════════════════════════
//  CHAT MESSAGING
// ═══════════════════════════════════════════

async function sendChatMessage() {
  if (chatState.isStreaming) return;
  const textarea = document.getElementById('chat-textarea');
  const userMsg = textarea.value.trim();
  if (!userMsg) return;
  textarea.value = '';
  textarea.style.height = 'auto';

  // Remove empty state
  const emptyState = document.getElementById('chat-empty-state');
  if (emptyState) emptyState.style.display = 'none';

  const container = document.getElementById('chat-messages');

  // Add user message
  const userEl = document.createElement('div');
  userEl.className = 'chat-msg user';
  userEl.innerHTML = `<div class="chat-msg-bubble">${esc(userMsg)}</div>`;
  container.appendChild(userEl);

  chatState.messages.push({ role: 'user', content: userMsg, timestamp: Date.now() });

  // Add streaming assistant message
  const asstEl = document.createElement('div');
  asstEl.className = 'chat-msg assistant';
  const bubbleEl = document.createElement('div');
  bubbleEl.className = 'chat-msg-bubble';
  bubbleEl.innerHTML = '<div class="ai-loading"><div class="ai-loading-pulse"><span class="ai-loading-dot"></span><span class="ai-loading-dot"></span><span class="ai-loading-dot"></span></div><span class="ai-loading-label">' + (currentLang === 'zh' ? 'AI 正在思考...' : 'AI is thinking...') + '</span></div>';
  asstEl.appendChild(bubbleEl);
  container.appendChild(asstEl);
  container.scrollTop = container.scrollHeight;

  // Show steps panel
  chatState.steps = [];
  toggleStepsPanel(true);
  addStepItem('Received task: ' + userMsg.substring(0, 60) + (userMsg.length > 60 ? '...' : ''), 'task');
  addStepItem('Analyzing with ' + (chatState.selectedExperts.length > 0 ? chatState.selectedExperts.map(e => e.name).join(', ') : 'default AI'), 'analysis');

  chatState.isStreaming = true;
  document.getElementById('chat-send-label').textContent = '...';
  document.querySelector('.chat-send-btn').disabled = true;

  try {
    // Build system prompt from experts
    const expertPrompts = [];
    for (const expert of chatState.selectedExperts) {
      try {
        const resp = await fetch('experts/' + expert.file);
        if (resp.ok) {
          const prompt = await resp.text();
          expertPrompts.push('[' + expert.name + ']: ' + prompt.trim());
        }
      } catch {}
    }

    let systemPrompt = 'You are Awei AI Studio, a powerful AI assistant.';
    if (expertPrompts.length > 0) {
      systemPrompt += '\n\nYou are working with these experts:\n' + expertPrompts.join('\n');
    }
    if (chatState.mode === 'plan') {
      systemPrompt += '\n\nWork mode: PLAN. First create a detailed plan, then execute step by step.';
    } else if (chatState.mode === 'craft') {
      systemPrompt += '\n\nWork mode: CRAFT. Build directly and deliver results.';
    } else {
      systemPrompt += '\n\nWork mode: ASK. Provide guidance and answer questions.';
    }
    if (chatState.safeMode) {
      systemPrompt += '\n\nSAFE MODE is active. Do not modify files without explicit confirmation.';
    }

    addStepItem('Connecting to AI model...', 'status');

    const messages = [
      { role: 'system', content: systemPrompt },
      ...chatState.messages.filter(m => m.role !== 'system').slice(-15).map(m => ({ role: m.role, content: m.content })),
    ];

    const response = await fetch(AI_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${AI_API_KEY}` },
      body: JSON.stringify({ model: chatState.model, messages, max_tokens: 4096, temperature: 0.6, stream: true }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errMsg = 'API error ' + response.status;
      try { errMsg = JSON.parse(errorText).error?.message || errMsg; } catch {}
      bubbleEl.innerHTML = '<p>❌ Error: ' + esc(errMsg) + '</p>';
      addStepItem('Error: ' + errMsg, 'error');
    } else {
      addStepItem('AI is generating response...', 'status');
      let fullText = '';
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let stepCount = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const dataStr = trimmed.slice(6);
          if (dataStr === '[DONE]') continue;

          try {
            const chunk = JSON.parse(dataStr);
            const delta = chunk.choices?.[0]?.delta;
            if (!delta) continue;
            const content = delta.content || '';
            if (content) {
              fullText += content;
              stepCount++;
              // Add step landmarks every 500 chars
              if (stepCount === 1) addStepItem('Generating content...', 'progress');
              if (fullText.length > 500 && stepCount === 2) addStepItem('Expanding details...', 'progress');
              if (fullText.length > 1500 && stepCount === 3) addStepItem('Structuring output...', 'progress');
              bubbleEl.innerHTML = formatChatContent(fullText);
              container.scrollTop = container.scrollHeight;
            }
          } catch {}
        }
      }

      if (fullText) {
        bubbleEl.innerHTML = formatChatContent(fullText);
        // Add "view products" button if code was generated
        const codeMatches = fullText.match(/```(?:\w+)?\n([\s\S]*?)```/g);
        if (codeMatches && chatState.mode === 'craft') {
          const productsContainer = document.createElement('div');
          productsContainer.className = 'chat-products-section';
          productsContainer.innerHTML = '<div style="margin-top:12px;font-weight:600;font-size:13px;color:var(--text-primary);">📦 Generated Results</div>';
          codeMatches.forEach((codeBlock, i) => {
            const code = codeBlock.replace(/```\w*\n/, '').replace(/\n```$/, '');
            const lang = (codeBlock.match(/```(\w+)/) || ['', ''])[1] || '';
            const productId = 'chat_prod_' + Date.now() + '_' + i;
            // Detect file name from content or generate from language
            const detectedType = detectProductType(code, lang);
            const fileName = detectedType.name || ('generated_' + (i + 1) + '.' + detectedType.ext);
            chatState.products.push({
              id: productId,
              name: fileName,
              code,
              lang: detectedType.displayLang,
              ext: detectedType.ext,
              kind: detectedType.kind,
              timestamp: Date.now(),
              sessionId: chatState.currentSessionId
            });
            const kindLabel = detectedType.kind === 'code' ? '📝 Code' : detectedType.kind === 'doc' ? '📄 Doc' : detectedType.kind === 'config' ? '⚙ Config' : detectedType.kind === 'data' ? '📊 Data' : '📋 Text';
            productsContainer.innerHTML += '<div class="chat-product-card"><span class="chat-product-name">' + esc(fileName) + '</span><span class="chat-product-kind">' + kindLabel + '</span><span class="chat-product-lang">' + esc(detectedType.displayLang) + '</span><button class="chat-product-view-btn" onclick="openProductInAssistant(\'' + productId + '\')">View & Run →</button></div>';
          });
          const viewAllBtn = document.createElement('button');
          viewAllBtn.className = 'chat-product-btn';
          viewAllBtn.textContent = '📦 View All Generated Products (' + codeMatches.length + ')';
          viewAllBtn.onclick = () => switchPage('products', document.querySelector('[data-page=products]'));
          productsContainer.appendChild(viewAllBtn);
          bubbleEl.appendChild(productsContainer);
          addStepItem('Generated ' + codeMatches.length + ' artifacts', 'success');
        }
        chatState.messages.push({ role: 'assistant', content: fullText, timestamp: Date.now() });
        addStepItem('Task completed successfully', 'success');
      }
    }
  } catch (err) {
    bubbleEl.innerHTML = '<p>❌ Network error: ' + esc(err.message || String(err)) + '</p>';
    addStepItem('Network error: ' + (err.message || String(err)), 'error');
  } finally {
    chatState.isStreaming = false;
    document.getElementById('chat-send-label').textContent = 'Send';
    document.querySelector('.chat-send-btn').disabled = false;
    saveCurrentSession();
    container.scrollTop = container.scrollHeight;
  }
}

// ═══════════════════════════════════════════
//  PRODUCT TYPE DETECTION — Code / Doc / Config / Data
// ═══════════════════════════════════════════

// Comprehensive programming language → extension mapping (code files)
const CODE_EXT_MAP = {
  javascript:'js', js:'js', jsx:'jsx', typescript:'ts', ts:'tsx', tsx:'tsx',
  python:'py', py:'py', pip:'py',
  c:'c', cpp:'cpp', 'c++':'cpp', cxx:'cpp', h:'h', hpp:'hpp',
  csharp:'cs', 'c#':'cs', cs:'cs',
  java:'java', kotlin:'kt', kt:'kt', swift:'swift',
  go:'go', golang:'go', rust:'rs', rs:'rs',
  ruby:'rb', rb:'rb', php:'php',
  scala:'scala', dart:'dart',
  lua:'lua', perl:'pl', pl:'pl',
  r:'r', matlab:'m', m:'m',
  wasm:'wat', wat:'wat', w:'w',
  bash:'sh', sh:'sh', shell:'sh', zsh:'sh', powershell:'ps1', ps1:'ps1', bat:'bat', cmd:'bat',
  sql:'sql', graphql:'gql', gql:'gql', plsql:'sql',
  html:'html', htm:'html', css:'css', scss:'scss', sass:'sass', less:'less', stylus:'styl',
  xml:'xml', svg:'svg',
};

// Document/data/config → extension mapping
const DOC_EXT_MAP = {
  markdown:'md', md:'md', mdx:'mdx',
  json:'json', json5:'json5', jsonc:'jsonc',
  yaml:'yaml', yml:'yml', toml:'toml', ini:'ini', cfg:'cfg', conf:'conf',
  csv:'csv', tsv:'tsv',
  dockerfile:'dockerfile', docker:'dockerfile',
  makefile:'makefile', cmake:'cmake', cmakelists:'cmake',
  gitignore:'gitignore', gitattributes:'gitattributes',
  env:'env', 'dotenv':'env',
  tex:'tex', latex:'tex',
  diff:'diff', patch:'patch',
  proto:'proto', protobuf:'proto',
  regex:'regex',
  nginx:'nginx', nginxconf:'nginx',
  properties:'properties',
};

// Map extensions to display kind
const EXT_KIND_MAP = {
  md:'doc', mdx:'doc', txt:'doc', rst:'doc', tex:'doc', latex:'doc',
  json:'data', json5:'data', jsonc:'data', yaml:'config', yml:'config', toml:'config',
  ini:'config', cfg:'config', conf:'config', properties:'config',
  dockerfile:'config', makefile:'config', cmake:'config',
  gitignore:'config', gitattributes:'config', env:'config',
  csv:'data', tsv:'data',
  proto:'config', regex:'text',
  diff:'text', patch:'text',
  nginx:'config', nginxconf:'config',
};

function langToExt(lang) {
  if (!lang) return '';
  const l = lang.toLowerCase().trim().replace(/^[\s"']+|[\s"']+$/g, '');
  // Direct match first
  if (CODE_EXT_MAP[l]) return { ext: CODE_EXT_MAP[l], kind: 'code' };
  if (DOC_EXT_MAP[l]) return { ext: DOC_EXT_MAP[l], kind: (EXT_KIND_MAP[DOC_EXT_MAP[l]] || 'config') };
  return null;
}

function detectProductType(code, langTag) {
  // Default fallback
  const fallback = { ext: 'txt', displayLang: langTag || 'text', kind: 'text', name: null };

  // Try to detect file name from code content (comments like // file: name.ext or # file: name.ext)
  const nameMatch = code.match(/(?:\/\/|#|<!--|;)\s*(?:file|filename|@file)[:\s]+([^\s\n\r]+\.\w{1,10})/i);
  let detectedName = null;
  let detectedExt = null;
  if (nameMatch) {
    detectedName = nameMatch[1].trim();
    // Normalize: remove quotes, path separators
    detectedName = detectedName.replace(/^["']|["']$/g, '').replace(/.*[\\/]/, '');
    detectedExt = detectedName.split('.').pop().toLowerCase();
  }

  // 1. Detect by language tag
  if (langTag) {
    const result = langToExt(langTag);
    if (result) {
      return {
        ext: detectedExt || result.ext,
        displayLang: langTag,
        kind: detectedExt ? (EXT_KIND_MAP[detectedExt] || 'code') : result.kind,
        name: detectedName || null,
      };
    }
  }

  // 2. If we have a detected file name, use its extension
  if (detectedName && detectedExt) {
    return {
      ext: detectedExt,
      displayLang: detectedExt,
      kind: EXT_KIND_MAP[detectedExt] || 'code',
      name: detectedName,
    };
  }

  // 3. Content-based heuristics
  // HTML/XML
  if (/^\s*<(!DOCTYPE|html|svg|xml)/i.test(code) || /^\s*<[a-z][\s\S]*>[\s\S]*<\/[a-z]+>/i.test(code)) {
    return { ext: 'html', displayLang: 'html', kind: 'code', name: detectedName };
  }
  // JSON
  if (/^\s*[\{\[]/.test(code) && /[\}\]]\s*$/.test(code) && /"[^"]+"\s*:/.test(code)) {
    return { ext: 'json', displayLang: 'json', kind: 'data', name: detectedName };
  }
  // YAML
  if (/^[\w.-]+\s*:\s/.test(code) && !/[{;]/.test(code.split('\n')[0])) {
    return { ext: 'yaml', displayLang: 'yaml', kind: 'config', name: detectedName };
  }
  // Markdown
  if (/^#{1,6}\s/.test(code) || /^\*{1,3}[^*]+\*{1,3}$/m.test(code) || /^\[.+\]\(.+\)/m.test(code)) {
    return { ext: 'md', displayLang: 'markdown', kind: 'doc', name: detectedName };
  }
  // Python
  if (/^\s*(def |class |import |from |if __name__)/m.test(code)) {
    return { ext: 'py', displayLang: 'python', kind: 'code', name: detectedName };
  }
  // JavaScript/TypeScript
  if (/\b(const |let |var |function |import |export |require\(|=>\s*\{|interface |type \w+ =)/.test(code)) {
    return { ext: 'js', displayLang: 'javascript', kind: 'code', name: detectedName };
  }
  // CSS
  if (/[.#@][\w-]+\s*\{[\s\S]*\}/.test(code)) {
    return { ext: 'css', displayLang: 'css', kind: 'code', name: detectedName };
  }
  // SQL
  if (/^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\s/i.test(code)) {
    return { ext: 'sql', displayLang: 'sql', kind: 'code', name: detectedName };
  }
  // Shell
  if (/^#!/.test(code) || /^\s*(export |source |alias |echo |cd |mkdir |chmod |apt |brew )/m.test(code)) {
    return { ext: 'sh', displayLang: 'shell', kind: 'code', name: detectedName };
  }
  // Dockerfile
  if (/^\s*(FROM |RUN |COPY |ADD |EXPOSE |CMD |ENTRYPOINT |ENV )/m.test(code)) {
    return { ext: 'dockerfile', displayLang: 'dockerfile', kind: 'config', name: detectedName };
  }
  // XML (without HTML detection)
  if (/^\s*<\?xml/.test(code)) {
    return { ext: 'xml', displayLang: 'xml', kind: 'code', name: detectedName };
  }
  // C/C++
  if (/^\s*#include\s*[<"]/.test(code) || /\bint main\s*\(/.test(code)) {
    return { ext: 'cpp', displayLang: 'cpp', kind: 'code', name: detectedName };
  }
  // Java
  if (/\bpublic\s+class\s+\w+/.test(code) || /\bpublic\s+static\s+void\s+main/.test(code)) {
    return { ext: 'java', displayLang: 'java', kind: 'code', name: detectedName };
  }

  // 4. Default: plain text with detected name or fallback
  return {
    ext: detectedExt || 'txt',
    displayLang: detectedExt || 'text',
    kind: 'text',
    name: detectedName || null,
  };
}

function formatChatContent(text) {
  // Same format logic as assistant, but tailored for chat
  let html = text;
  // Code blocks
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return '<pre class="chat-code-block"><code>' + esc(code.trim()) + '</code><button class="chat-copy-code" onclick="copyChatCode(this)">📋 Copy</button></pre>';
  });
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="chat-inline-code">$1</code>');
  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Newlines
  html = html.replace(/\n/g, '<br>');
  // Links
  html = html.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" class="chat-link">$1</a>');
  return html;
}

function copyChatCode(btn) {
  const pre = btn.parentElement;
  const code = pre.querySelector('code');
  if (!code) return;
  navigator.clipboard.writeText(code.textContent).then(() => {
    btn.textContent = '✓ Copied';
    setTimeout(() => { btn.textContent = '📋 Copy'; }, 2000);
  }).catch(() => {
    btn.textContent = '✗ Failed';
    setTimeout(() => { btn.textContent = '📋 Copy'; }, 2000);
  });
}

function handleChatKey(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendChatMessage();
  }
}

// ═══════════════════════════════════════════
//  CHAT SESSION MANAGEMENT
// ═══════════════════════════════════════════

function newChatSession() {
  const id = 'chat_' + Date.now();
  chatState.currentSessionId = id;
  chatState.sessions[id] = {
    id,
    title: 'New Chat',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    mode: chatState.mode,
    model: chatState.model,
    experts: [...chatState.selectedExperts.map(e => e.id)],
    messages: [],
    products: [],
  };
  chatState.messages = [];
  chatState.selectedExperts = [];
  chatState.products = [];
  renderSelectedExperts();
  updateExpertCount();
  renderExpertList();

  // Clear messages area
  const container = document.getElementById('chat-messages');
  container.innerHTML = `<div class="chat-empty-state" id="chat-empty-state">
    <div class="chat-empty-icon">🤖</div>
    <h3>Awei AI Studio</h3>
    <p>Select experts and describe your task.<br>AI will plan, think, and execute step by step.</p>
    <div class="chat-empty-hints">
      <span>Choose up to 5 experts</span>
      <span>Import code from Assistant</span>
      <span>Watch AI work in real-time</span>
    </div>
  </div>`;

  document.getElementById('chat-session-title').textContent = 'New Chat Session';
  renderChatSessionList();
  saveCurrentSession();
}

function saveCurrentSession() {
  if (!chatState.currentSessionId) return;
  const session = chatState.sessions[chatState.currentSessionId];
  if (!session) return;
  session.messages = [...chatState.messages];
  session.products = [...chatState.products];
  session.mode = chatState.mode;
  session.model = chatState.model;
  session.experts = [...chatState.selectedExperts.map(e => e.id)];
  session.updatedAt = Date.now();
  if (session.messages.length > 0 && session.title === 'New Chat') {
    const firstUserMsg = session.messages.find(m => m.role === 'user');
    if (firstUserMsg) {
      session.title = firstUserMsg.content.substring(0, 40) + (firstUserMsg.content.length > 40 ? '...' : '');
    }
  }
  // Persist to localStorage
  try {
    const all = JSON.parse(localStorage.getItem('aweiclaw_chat_sessions') || '{}');
    all[chatState.currentSessionId] = session;
    localStorage.setItem('aweiclaw_chat_sessions', JSON.stringify(all));
  } catch {}
  // Also sync to assistant page history
  syncChatToAssistantHistory();
  renderChatSessionList();
  document.getElementById('chat-session-title').textContent = session.title;
}

// Sync chat messages to the assistant page's history (aweiclaw_chat_history)
function syncChatToAssistantHistory() {
  if (chatState.messages.length === 0) return;
  const firstMsg = chatState.messages[0].content.substring(0, 50);
  const history = JSON.parse(localStorage.getItem('aweiclaw_chat_history') || '[]');

  // Check if this session is already in history (by exact messages match)
  const isDuplicate = history.some(h =>
    h.messages && h.messages.length === chatState.messages.length &&
    h.messages[0] && chatState.messages[0] &&
    h.messages[0].content === chatState.messages[0].content
  );

  if (!isDuplicate) {
    history.unshift({
      title: firstMsg,
      savedAt: Date.now(),
      msgCount: chatState.messages.length,
      messages: chatState.messages.map(m => ({ role: m.role, content: m.content })),
      fromChatPage: true,
      sessionId: chatState.currentSessionId,
    });
    if (history.length > 50) history.length = 50;
    localStorage.setItem('aweiclaw_chat_history', JSON.stringify(history));
  } else {
    // Update existing entry
    const idx = history.findIndex(h =>
      h.messages && h.messages.length === chatState.messages.length &&
      h.messages[0] && chatState.messages[0] &&
      h.messages[0].content === chatState.messages[0].content
    );
    if (idx >= 0) {
      history[idx].messages = chatState.messages.map(m => ({ role: m.role, content: m.content }));
      history[idx].msgCount = chatState.messages.length;
      history[idx].savedAt = Date.now();
      localStorage.setItem('aweiclaw_chat_history', JSON.stringify(history));
    }
  }
}

function loadChatSession(id) {
  try {
    const all = JSON.parse(localStorage.getItem('aweiclaw_chat_sessions') || '{}');
    if (all[id]) {
      chatState.sessions = all;
    } else {
      chatState.sessions = all;
      if (!chatState.sessions[id]) {
        newChatSession();
        return;
      }
    }
  } catch {
    newChatSession();
    return;
  }

  const session = chatState.sessions[id];
  chatState.currentSessionId = id;
  chatState.messages = [...(session.messages || [])];
  chatState.products = [...(session.products || [])];
  chatState.mode = session.mode || 'craft';
  chatState.model = session.model || 'deepseek-ai/DeepSeek-R1-0528-Qwen3-8B';

  // Restore experts
  chatState.selectedExperts = [];
  if (session.experts && chatState.expertCatalog.length > 0) {
    for (const eid of session.experts) {
      const expert = chatState.expertCatalog.find(e => e.id === eid);
      if (expert) chatState.selectedExperts.push(expert);
    }
  }
  updateExpertCount();
  renderSelectedExperts();
  renderExpertList();

  // Update mode buttons
  document.querySelectorAll('.chat-mode-card').forEach(c => {
    c.classList.toggle('active', c.dataset.mode === chatState.mode);
  });
  // Update model select
  const modelSelect = document.getElementById('chat-model-select');
  if (modelSelect) modelSelect.value = chatState.model;

  document.getElementById('chat-session-title').textContent = session.title || 'Chat Session';

  // Render messages
  const container = document.getElementById('chat-messages');
  if (chatState.messages.length === 0) {
    container.innerHTML = `<div class="chat-empty-state" id="chat-empty-state">
      <div class="chat-empty-icon">🤖</div>
      <h3>Awei AI Studio</h3>
      <p>Select experts and describe your task.<br>AI will plan, think, and execute step by step.</p>
      <div class="chat-empty-hints">
        <span>Choose up to 5 experts</span>
        <span>Import code from Assistant</span>
        <span>Watch AI work in real-time</span>
      </div>
    </div>`;
  } else {
    container.innerHTML = '';
    chatState.messages.forEach(m => {
      const el = document.createElement('div');
      el.className = 'chat-msg ' + m.role;
      el.innerHTML = '<div class="chat-msg-bubble">' + (m.role === 'user' ? esc(m.content) : formatChatContent(m.content)) + '</div>';
      container.appendChild(el);
    });
    container.scrollTop = container.scrollHeight;
  }
  renderChatSessionList();
}

function renderChatSessionList() {
  const container = document.getElementById('chat-history-list');
  if (!container) return;
  try {
    const all = JSON.parse(localStorage.getItem('aweiclaw_chat_sessions') || '{}');
    chatState.sessions = all;
  } catch {}
  const sessions = Object.values(chatState.sessions).sort((a, b) => b.updatedAt - a.createdAt);
  container.innerHTML = sessions.map(s =>
    `<div class="chat-history-item${s.id === chatState.currentSessionId ? ' active' : ''}" onclick="loadChatSession('${s.id}')">
      <div class="chat-history-item-title">${esc(s.title || 'New Chat')}</div>
      <div class="chat-history-item-meta">
        <span>${new Date(s.updatedAt || s.createdAt).toLocaleDateString('zh-CN')}</span>
        <span>${(s.messages || []).length} msgs</span>
      </div>
    </div>`
  ).join('') || '<div style="padding:12px;text-align:center;color:var(--text-muted);font-size:12px;">No chat history</div>';
}

function clearAllChatHistory() {
  if (!confirm('Delete all chat history? This cannot be undone.')) return;
  localStorage.removeItem('aweiclaw_chat_sessions');
  chatState.sessions = {};
  chatState.products = [];
  newChatSession();
  renderChatSessionList();
}

// ═══════════════════════════════════════════
//  CHAT STEPS PANEL
// ═══════════════════════════════════════════

function toggleStepsPanel(forceShow) {
  const panel = document.getElementById('chat-steps-panel');
  if (!panel) return;
  if (forceShow === true) {
    panel.classList.remove('hidden');
  } else if (forceShow === false) {
    panel.classList.add('hidden');
  } else {
    panel.classList.toggle('hidden');
  }
}

function addStepItem(text, type) {
  const list = document.getElementById('chat-steps-list');
  if (!list) return;
  chatState.steps.push({ text, type, time: Date.now() });
  const icon = type === 'task' ? '📋' : type === 'analysis' ? '🧠' : type === 'status' ? '⏳' : type === 'progress' ? '🔄' : type === 'success' ? '✅' : type === 'error' ? '❌' : '•';
  const item = document.createElement('div');
  item.className = 'chat-step-item step-' + (type || 'default');
  item.innerHTML = '<span class="chat-step-icon">' + icon + '</span><span class="chat-step-text">' + esc(text) + '</span>';
  list.appendChild(item);
  list.scrollTop = list.scrollHeight;
  // Auto-hide steps after 3s for success/error, keep others visible
  if (type === 'success' || type === 'error') {
    setTimeout(() => {
      if (item.parentElement) item.style.opacity = '0.5';
    }, 3000);
  }
}

// ═══════════════════════════════════════════
//  CHAT IMPORT / EXPORT
// ═══════════════════════════════════════════

function importAssistantFiles() {
  if (!state.currentProject) {
    alert('Please open a project in the Assistant page first.');
    return;
  }
  const project = getCurrentProject();
  if (!project || Object.keys(project.files).length === 0) {
    alert('No files found in the current project. Create some files in the Assistant page first.');
    return;
  }
  const fileContainer = document.getElementById('chat-input-files');
  fileContainer.classList.remove('hidden');
  fileContainer.innerHTML = '<span style="font-size:11px;color:var(--text-muted);margin-right:6px;">📂 Imported files:</span>';
  Object.entries(project.files).forEach(([fid, f]) => {
    const chip = document.createElement('span');
    chip.className = 'chat-input-file-chip';
    chip.textContent = f.name;
    chip.dataset.fileId = fid;
    chip.dataset.fileContent = f.content || '';
    chip.innerHTML += ' <span class="remove-chip" onclick="this.parentElement.remove()">×</span>';
    fileContainer.appendChild(chip);
  });
}

function exportChatMarkdown() {
  let md = '# Awei AI Studio Chat Export\n\n';
  md += '**Date:** ' + new Date().toLocaleString() + '\n';
  md += '**Mode:** ' + chatState.mode + ' | **Model:** ' + chatState.model + '\n';
  md += '**Experts:** ' + (chatState.selectedExperts.map(e => e.name).join(', ') || 'None') + '\n\n---\n\n';
  chatState.messages.forEach(m => {
    md += '### ' + (m.role === 'user' ? '🧑 User' : '🤖 AI') + '\n\n';
    md += m.content + '\n\n';
  });
  const blob = new Blob([md], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'chat_export_' + new Date().toISOString().slice(0, 10) + '.md';
  a.click();
  URL.revokeObjectURL(url);
}

// ═══════════════════════════════════════════
//  PRODUCTS VIEW
// ═══════════════════════════════════════════

function renderProductsGrid() {
  const grid = document.getElementById('products-grid');
  const empty = document.getElementById('products-empty');
  if (!grid) return;
  // Collect products from all sessions
  let allProducts = [];
  try {
    const sessions = JSON.parse(localStorage.getItem('aweiclaw_chat_sessions') || '{}');
    Object.values(sessions).forEach(s => {
      if (s.products) {
        s.products.forEach(p => {
          p.sessionTitle = s.title || 'Unknown Session';
          allProducts.push(p);
        });
      }
    });
  } catch {}
  // Also include current chatState products
  allProducts = [...allProducts, ...chatState.products.filter(p => !allProducts.find(ap => ap.id === p.id))];

  if (allProducts.length === 0) {
    if (grid) grid.innerHTML = '';
    if (empty) empty.classList.remove('hidden');
    return;
  }
  if (empty) empty.classList.add('hidden');
  allProducts.sort((a, b) => b.timestamp - a.timestamp);
  grid.innerHTML = allProducts.map(p => {
    const displayLang = p.displayLang || p.lang || (p.ext || p.name.split('.').pop() || 'txt');
    const kindLabel = p.kind === 'code' ? '📝 Code' : p.kind === 'doc' ? '📄 Doc' : p.kind === 'config' ? '⚙ Config' : p.kind === 'data' ? '📊 Data' : '📋 Text';
    return `<div class="chat-product-card product-grid-card">
      <div class="product-grid-header">
        <span class="chat-product-name">${esc(p.name)}</span>
        <span class="chat-product-kind">${kindLabel}</span>
        <span class="chat-product-lang">${esc(displayLang)}</span>
      </div>
      <pre class="product-grid-preview"><code>${esc((p.code || '').substring(0, 200))}${(p.code || '').length > 200 ? '...' : ''}</code></pre>
      <div class="product-grid-meta">
        <span>${new Date(p.timestamp).toLocaleString('zh-CN')}</span>
        <span>${esc(p.sessionTitle || '')}</span>
      </div>
      <div class="product-grid-actions">
        <button class="chat-product-view-btn" onclick="openProductInAssistant('${p.id}')">📝 View & Run →</button>
      </div>
    </div>`;
  }).join('');
}

function clearAllProducts() {
  if (!confirm('Clear all generated products? This cannot be undone.')) return;
  chatState.products = [];
  // Also clear from localStorage sessions
  try {
    const sessions = JSON.parse(localStorage.getItem('aweiclaw_chat_sessions') || '{}');
    Object.values(sessions).forEach(s => {
      s.products = [];
    });
    localStorage.setItem('aweiclaw_chat_sessions', JSON.stringify(sessions));
  } catch {}
  renderProductsGrid();
}

function openProductInAssistant(productId) {
  // Find the product
  let product = chatState.products.find(p => p.id === productId);
  if (!product) {
    try {
      const sessions = JSON.parse(localStorage.getItem('aweiclaw_chat_sessions') || '{}');
      Object.values(sessions).forEach(s => {
        if (s.products) {
          const found = s.products.find(p => p.id === productId);
          if (found) product = found;
        }
      });
    } catch {}
  }
  if (!product) {
    alert('Product not found.');
    return;
  }

  // Create or ensure project exists
  if (!state.currentProject) {
    const projects = getProjects();
    const projId = 'proj_' + Date.now();
    projects[projId] = { id: projId, name: 'Chat Products', createdAt: Date.now(), files: {} };
    lsSet(STORAGE_KEYS.projects, projects);
    state.currentProject = projId;
    lsSet(STORAGE_KEYS.currentProject, projId);
    refreshProjectSelect();
  }

  // Add file to project
  const project = getCurrentProject();
  if (!project) return;
  project.files = project.files || {};
  const fileId = 'file_' + Date.now();
  project.files[fileId] = {
    id: fileId,
    name: product.name || 'generated.txt',
    content: product.code || '',
    createdAt: Date.now(),
    modifiedAt: Date.now(),
  };
  lsSet(STORAGE_KEYS.projects, getProjects());

  // Switch to app page and open the file
  switchPage('app', document.querySelector('[data-page=app]'));
  refreshProjectSelect();
  refreshSidebar();

  // Open the file
  setTimeout(() => {
    openFileInEditor(fileId, product.name, product.code);
  }, 200);
}

// ═══════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════
(function init() {
  const savedUser = ls(STORAGE_KEYS.currentUser);
  if (savedUser && savedUser.username) enterApp(savedUser);
  else document.getElementById('auth-overlay').classList.remove('hidden');
})();
