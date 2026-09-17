/* Offline fixture only. No imports, fetches, product IPC, storage or live sessions. */
'use strict';
const DIRECTIONS = {
  current: { name: 'Current', description: 'Continuous dividers and flush edges. The comparison baseline.', detail: 'A source-informed redraw of your screenshot. Every region meets its neighbour with a straight divider.' },
  inset: { name: 'A · Inset workspace', description: 'One shared perimeter. Familiar dividers inside.', detail: 'Inset the entire workspace beneath the project tabs. One outer frame contains Explorer, the terminal, and Sessions.' },
  surround: { name: 'B · Quiet surround', description: 'One framed work surface; navigation rests in the surround.', detail: 'Closest to the reference. Give the terminal a complete edge and let Explorer and Sessions sit quietly in the window frame.' },
  surfaces: { name: 'C · Separate surfaces', description: 'Three independent surfaces, aligned by one header line.', detail: 'Frame Explorer, the work area, and Sessions separately. Clear ownership of each region, with a little more visual structure.' }
};
const projects = ['gmux', 'runstory', 'tortiedotsh', 'gregstream', 'marketing-factory', 'next-learn', 'specstory-website-sept', 'specfactory', 'runstorydotcom'];
const sessions = [
  { name: 'Architecture Review', agent: 'codex', status: 'idle' },
  { name: 'codex-1', agent: 'codex', status: 'idle', restored: true },
  { name: 'shell-1', agent: 'shell', status: 'idle' },
  { name: 'antigravity-1', agent: 'antigravity', status: 'working' },
  { name: 'codex-2', agent: 'codex', status: 'working' },
  { name: 'claude-1', agent: 'claude', status: 'idle' },
  { name: 'codex-3', agent: 'codex', status: 'idle', worktree: true }
];
const tree = [
  ['.antigravitycli',0,'folder'], ['.claude',0,'folder',true], ['.github',0,'folder'], ['.playwright-mcp',0,'folder'], ['.specstory',0,'folder'], ['.tmp',0,'folder'], ['.tsc',0,'folder'], ['build',0,'folder'], ['demo',0,'folder'],
  ['docs',0,'folder-opened',true], ['arch',1,'folder'], ['audits',1,'folder'], ['brand',1,'folder'], ['designs',1,'folder'], ['method',1,'folder'], ['readme',1,'folder'], ['research',1,'folder-opened',true], ['assets',2,'folder'],
  ['01-durability-and-restore.md',2,'markdown'], ['02-agent-lifecycle.md',2,'markdown'], ['03-existing-tools.md',2,'markdown'], ['04-agent-status.md',2,'markdown'], ['05-terminal-rendering.md',2,'markdown'], ['06-git-control.md',2,'markdown'], ['07-editor-and-diff.md',2,'markdown'], ['08-shell-and-environment.md',2,'markdown'], ['09-reboot-recovery.md',2,'markdown'], ['10-multi-project-ux.md',2,'markdown'], ['11-agent-registry.md',2,'markdown'],
  ['src',0,'folder'], ['package.json',0,'json'], ['README.md',0,'markdown']
];
const state = { variant: 'surround', scenario: 'screenshot', project: 'gmux', session: 6, sidebar: 'Explorer', explorerHidden: false, sessionsHidden: false, expanded: new Set(['docs','research']), filter: '', explorerWidth: null, sessionsWidth: null };
const main = document.querySelector('#main');
const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon = name => `<i class="codicon codicon-${name}" aria-hidden="true"></i>`;
const iconButton = (name,label,action='fixture',extra='') => `<button class="icon-button" aria-label="${label}" title="${label}" data-action="${action}" ${extra}>${icon(name)}</button>`;
const agent = name => `<span class="agent-mark" aria-hidden="true">${window.AGENT_MARKS[name] || icon('terminal')}</span>`;
const statusDot = (status) => `<span class="dot ${status}" title="${status}" aria-label="${status}"></span>`;

function titlebar() {
  return `<div class="titlebar"><div class="traffic-lights" aria-label="macOS window controls, decorative in this study"><i></i><i></i><i></i></div>${iconButton('layout-sidebar-left','Toggle Explorer','toggle-explorer')}${iconButton('chevron-up','Project position options')}<nav class="project-tabs" aria-label="Projects">${projects.map((p,i)=>`<button class="project-tab" data-project="${p}" aria-pressed="${state.project===p}" title="${p}">${statusDot(i<2?'working':'idle')}<span>${p}</span></button>`).join('')}</nav>${iconButton('add','Add project')}${iconButton('bell','Attention')}</div>`;
}
function activity() {
  return `<nav class="activity" aria-label="Workspace views">${[['files','Explorer'],['search','Search'],['source-control','Source Control'],['layers','Context']].map(([glyph,label])=>`<button class="icon-button" data-view="${label}" aria-label="${label}" title="${label}" aria-pressed="${state.sidebar===label&&!state.explorerHidden}">${icon(glyph)}${label==='Source Control'?'<span class="badge">3</span>':''}</button>`).join('')}<button class="icon-button settings" title="Settings" aria-label="Settings" data-action="fixture">${icon('settings-gear')}</button></nav>`;
}
function treeRows() {
  let hiddenDepth = null;
  let matches = 0;
  const rows = tree.map(([name,depth,type,dirty],i)=>{
    if (hiddenDepth !== null && depth <= hiddenDepth) hiddenDepth = null;
    const isFolder = type.startsWith('folder');
    const open = state.expanded.has(name);
    if (!state.filter && hiddenDepth !== null) return '';
    if (!state.filter && isFolder && !open) hiddenDepth = depth;
    if (state.filter && !name.toLowerCase().includes(state.filter.toLowerCase())) return '';
    matches++;
    return `<button class="tree-row" data-tree="${i}" data-depth="${state.filter?0:depth}" title="${name}" ${isFolder?`aria-expanded="${open}"`:''}>${isFolder?`<i class="codicon codicon-chevron-${open?'down':'right'} chevron" aria-hidden="true"></i>`:'<span style="width:13px;flex-shrink:0"></span>'}<i class="codicon codicon-${isFolder?(open?'folder-opened':'folder'):type} ${isFolder?'folder-icon':'file-icon'}" aria-hidden="true"></i><span class="name">${name}</span>${dirty?'<span class="dirty" aria-label="contains changes"></span>':''}</button>`;
  }).join('');
  return matches?rows:'<div class="no-results">No matching files.</div>';
}
function explorer() {
  const controls = state.sidebar==='Explorer' ? `${iconButton('new-file','New file')}${iconButton('new-folder','New folder')}${iconButton('filter','Filter files by name','filter')}${iconButton('three-bars','Row spacing')}${iconButton('refresh','Refresh Explorer')}${iconButton('collapse-all','Collapse folders','collapse-tree')}` : iconButton('ellipsis','View options');
  const body = state.sidebar==='Explorer' ? `<input class="file-filter" placeholder="Filter files by name" aria-label="Filter files by name" value="${escapeHTML(state.filter)}"><div class="tree">${treeRows()}</div>` : sidebarFixture();
  return `<aside class="explorer" aria-label="${state.sidebar}"><div class="panel-header"><span class="panel-label">${state.sidebar}</span><span class="spacer"></span>${controls}</div>${body}<div class="resizer" data-resize="explorer" role="separator" aria-label="Resize Explorer" aria-orientation="vertical" aria-valuemin="190" aria-valuemax="420" aria-valuenow="${state.explorerWidth||232}" tabindex="0"></div></aside>`;
}
function sidebarFixture() {
  if(state.sidebar==='Search') return `<div class="sidebar-fixture"><input class="file-filter" placeholder="Search files" aria-label="Search sample content" id="sample-search"><p>Search this study’s sample filenames.</p><div id="search-results"></div></div>`;
  if(state.sidebar==='Source Control') return `<div class="sidebar-fixture">${icon('git-branch')} main <h3>Changes <span style="float:right">3</span></h3>${['package-lock.json','.claude/scheduled_tasks.lock','docs/research/124-redline-scratch-and-the-shadow-baseline.md'].map((n,i)=>`<div class="tree-row" title="${n}">${icon('file')}<span class="name">${n}</span><span class="spacer"></span>${['M','D','U'][i]}</div>`).join('')}</div>`;
  return `<div class="sidebar-fixture"><h3>Context</h3><p>Sample workspace: ${escapeHTML(state.project)}</p><p>Context controls belong to the existing app. This study only models the containing surface.</p></div>`;
}
function terminalHeader(session) {
  return `<div class="panel-header">${agent(session.agent)}<span class="session-title">${session.name}</span><span class="header-meta">${session.status}</span><span class="header-meta">${icon('folder')} no conversation id yet</span><span class="spacer"></span>${iconButton('ellipsis','Session options')}</div>`;
}
function welcome(session) {
  if(session.agent==='shell') return `<p class="muted">Last login: Thu Sep 17 15:38:11 on ttys004</p><p><span class="green">${escapeHTML(state.project)}</span> <span class="muted">git:(main)</span> ❯ <span class="caret"></span></p>`;
  if(session.agent!=='codex') return `<div class="codex-welcome"><strong>${session.agent==='claude'?'Claude Code':'Antigravity'}</strong><div class="muted">~/ ${escapeHTML(state.project)}</div></div><p class="muted">${session.status==='working'?'Working…':'Ready for your next prompt.'}</p>`;
  return `<div class="codex-welcome"><div class="welcome-title"><span class="muted">&gt;_</span> <strong>OpenAI Codex</strong> <span class="muted">(v0.154.0)</span></div><div><span class="muted">model:&nbsp;&nbsp;&nbsp;&nbsp; </span><strong>gpt-6-astra xhigh</strong>&nbsp; <span class="cyan">/model</span><span class="muted"> to change</span></div><div><span class="muted">directory: </span>~/${escapeHTML(state.project)}</div></div><p class="tip"><strong>Tip:</strong> <em>New</em> Use <strong>/fast</strong> to enable our fastest inference with increased plan usage.</p><div class="terminal-prompt"><span>›</span><div>can we run a design study on the tortie interface similar to what we've done in /users/gdc/runstory/design and use HTML to mock up a few variations that could make <span class="caret"></span> similar to this <span class="cyan">[Image #1]</span>, just from an overall container of each part of the app perspective while not changing any of the functionality?</div></div><div class="terminal-status">gpt-6-astra xhigh <span class="muted">·</span> <span class="green">~/${escapeHTML(state.project)}</span> <span class="muted">·</span> <span style="color:#d89974">0 in · 0 out</span></div>`;
}
function transcript(compact=false) {
  return `<p class="muted">› Study the app containers while preserving the existing workflow.</p><p>I’ve mapped the visible regions: project tabs, the activity rail, Explorer, the terminal, and Sessions.</p><p>The terminal remains the primary work surface. Navigation keeps its current location and density.</p>${compact?'':`<table class="transcript-table"><thead><tr><th>Region</th><th>Keep</th></tr></thead><tbody><tr><td>Project tabs</td><td>Order, status dots, overflow</td></tr><tr><td>Explorer</td><td>Filter, file tree, toolbar</td></tr><tr><td>Terminal</td><td>Header, content, splits</td></tr><tr><td>Sessions</td><td>Agent marks, state, usage</td></tr></tbody></table>`}<p>Each variation uses the same content, so the framing is the only visual variable.</p><p class="muted">The rounded edge belongs to the outer work surface. Internal split dividers stay straight.</p><p>The next comparison is the same workspace with the editor open beside the terminal.</p><div class="command-line">› <span class="muted">Compare the container treatments</span></div><div class="sand">~/gmux <span class="muted">·</span> sample transcript</div>`;
}
function terminal(session,body) { return `<section class="terminal" aria-label="${session.name} terminal">${terminalHeader(session)}<div class="terminal-content">${body}</div></section>`; }
function work() {
  const session = sessions[state.session];
  if(state.scenario==='split') return `<div class="work split">${terminal(session,transcript(true))}${terminal(sessions[5],`<p class="muted">› Inspect the current layout.</p><p>The header, transcript, and input share one work surface.</p><p>The outer frame contains the split. A single divider separates the two sessions.</p><p class="muted">Both sessions keep their existing headers and menus.</p><div class="command-line">❯ <span class="muted">Ready</span></div>`)}</div>`;
  const editor=state.scenario==='editor'?`<section class="editor-panel" aria-label="Markdown editor"><div class="panel-header">${icon('markdown')}<span>PRODUCT.md</span><span class="spacer"></span>${iconButton('split-horizontal','Editor options')}${iconButton('close','Close editor','close-editor')}</div><article class="editor-document"><h1>Product</h1><h2>Product purpose</h2><p>Tortie is a calm, durable place for agentic work: one window where named terminal sessions host coding agents.</p><h2>Product principles</h2><ul><li>Never lose a session.</li><li>Zero new concepts.</li><li>The glance answers “who needs me.”</li><li>One window, everything scoped.</li></ul><h2>Brand commitments</h2><p>Native-macOS feel. Color is spent on state. Brand lives in precise details.</p></article></section>`:'';
  return `<div class="work">${terminal(session,state.scenario==='screenshot'?welcome(session):transcript(state.scenario==='editor'))}${editor}</div>`;
}
function sessionPanel() {
  return `<aside class="session-panel" aria-label="Sessions"><div class="panel-header"><span class="panel-label">Sessions</span><span class="session-count">7</span><span class="spacer"></span>${iconButton(state.sessionsHidden?'chevron-left':'chevron-right',state.sessionsHidden?'Show session names':'Collapse session list','toggle-sessions')}${iconButton('layout-panel','Session position options')}${iconButton('add','New session')}${iconButton('chevron-down','New session options')}</div><div class="session-list">${sessions.map((s,i)=>`<button class="session-row" data-session="${i}" aria-pressed="${state.session===i}" aria-label="${s.name}, ${s.status}" title="${s.name} · ${s.status}">${agent(s.agent)}<span class="row-name">${s.name}</span><span class="spacer"></span>${s.worktree?'<i class="codicon codicon-folder worktree" title="Worktree"></i>':''}${statusDot(s.status)}${s.restored?'<i class="codicon codicon-history restore" title="Restored session"></i>':''}</button>`).join('')}</div><div class="usage"><div class="usage-heading">${agent('claude')} Claude <span class="spacer"></span>${iconButton('refresh','Refresh usage')}</div><div class="usage-line">${agent('codex')}<div class="usage-track"><span></span></div><span>63% wk</span></div></div><div class="resizer" data-resize="sessions" role="separator" aria-label="Resize Sessions" aria-orientation="vertical" aria-valuemin="190" aria-valuemax="420" aria-valuenow="${state.sessionsWidth||300}" tabindex="0"></div></aside>`;
}
function renderShell() {
  const widths = `${state.explorerWidth?`--explorer-width:${state.explorerWidth}px;`:''}${state.sessionsWidth?`--sessions-width:${state.sessionsWidth}px;`:''}`;
  main.innerHTML=`<div class="tortie ${state.explorerHidden?'hide-explorer':''} ${state.sessionsHidden?'hide-sessions':''}" data-variant="${state.variant}" style="${widths}">${titlebar()}<div class="shell-body">${activity()}<div class="workspace">${explorer()}${work()}${sessionPanel()}</div></div></div>`;
  bindResizers();
}
let observer;
function renderGallery() {
  main.innerHTML=`<div class="gallery"><div class="gallery-intro"><div><h1>Same Tortie. A calmer frame.</h1><p>Three container treatments, one unchanged workspace. Open a direction to compare the same content at full size.</p></div><p class="study-scope">17 September 2026<br>Scope: surfaces, spacing, seams, corners.</p></div><div class="gallery-grid">${Object.entries(DIRECTIONS).map(([key,d])=>`<article class="gallery-item"><a class="miniature" href="#${key}" aria-label="Open ${d.name}"><iframe src="index.html?embed=1#${key}" title="${d.name} preview" tabindex="-1" loading="eager"></iframe></a><a class="gallery-item-title" href="#${key}"><h2>${d.name}</h2>${key==='surround'?'<span class="recommended">Closest to reference</span>':''}<span class="open-arrow" aria-hidden="true">↗</span></a><p>${d.detail}</p></article>`).join('')}</div><div class="gallery-note"><p><strong>Start with B.</strong> It gives the terminal the reference’s complete, rounded edge while letting both sidebars recede. A is the smallest structural departure. C makes the individual regions most explicit.</p><p><a href="../README.md">Study notes</a> · Local visual fixtures<br>No connection to the running app.</p></div></div>`;
  observer?.disconnect();
  observer=new ResizeObserver(entries=>entries.forEach(({target,contentRect})=>{target.querySelector('iframe').style.transform=`scale(${contentRect.width/1512})`;}));
  document.querySelectorAll('.miniature').forEach(el=>observer.observe(el));
}
function route() {
  const hash=location.hash.slice(1)||'gallery';
  const gallery = hash==='gallery' || !DIRECTIONS[hash];
  document.body.classList.toggle('gallery-page',gallery);
  document.querySelectorAll('[data-direction]').forEach(a=>{if(a.dataset.direction===hash)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
  observer?.disconnect();
  if(gallery) {document.title='Tortie · Look and feel comparison';renderGallery();return;}
  state.variant=hash;
  document.title=`${DIRECTIONS[hash].name} · Tortie container study`;
  document.querySelector('#direction-name').textContent=DIRECTIONS[hash].name;
  document.querySelector('#direction-description').textContent=DIRECTIONS[hash].description;
  renderShell();
}
let toastTimer;
function toast(message) { const el=document.querySelector('#toast');el.textContent=message;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),4000); }
document.addEventListener('click',e=>{
  const study=e.target.closest('[data-study]');
  if(study) {
    if(study.dataset.study==='reference') document.querySelector('#reference-dialog').showModal();
    if(study.dataset.study==='close-reference') document.querySelector('#reference-dialog').close();
    if(study.dataset.study==='fullscreen') {if(document.body.classList.contains('gallery-page'))location.hash='surround';document.body.classList.toggle('canvas-only');}
    return;
  }
  const project=e.target.closest('[data-project]');
  if(project) {state.project=project.dataset.project;renderShell();return;}
  const session=e.target.closest('[data-session]');
  if(session) {state.session=Number(session.dataset.session);renderShell();return;}
  const view=e.target.closest('[data-view]');
  if(view) {state.explorerHidden=state.sidebar===view.dataset.view?!state.explorerHidden:false;state.sidebar=view.dataset.view;renderShell();return;}
  const row=e.target.closest('[data-tree]');
  if(row) {const [name,,type]=tree[Number(row.dataset.tree)];if(type.startsWith('folder')){if(state.expanded.has(name))state.expanded.delete(name);else state.expanded.add(name);document.querySelector('.tree').innerHTML=treeRows();}else{state.scenario='editor';document.querySelector('#scenario').value='editor';renderShell();toast('Editor fixture: PRODUCT.md. File loading stays in the running app.');}return;}
  const action=e.target.closest('[data-action]');
  if(!action)return;
  switch(action.dataset.action) {
    case 'toggle-explorer': state.explorerHidden=!state.explorerHidden;renderShell();break;
    case 'toggle-sessions': state.sessionsHidden=!state.sessionsHidden;renderShell();break;
    case 'collapse-tree': state.expanded.clear();document.querySelector('.tree').innerHTML=treeRows();break;
    case 'filter': document.querySelector('.file-filter')?.focus();break;
    case 'close-editor': state.scenario='screenshot';document.querySelector('#scenario').value=state.scenario;renderShell();break;
    default: toast(`${action.getAttribute('aria-label')} is shown for placement. This local study does not run app commands.`);
  }
});
document.addEventListener('input',e=>{
  if(e.target.matches('.explorer > .file-filter')) {state.filter=e.target.value;document.querySelector('.tree').innerHTML=treeRows();}
  if(e.target.id==='sample-search') {const q=e.target.value.toLowerCase();document.querySelector('#search-results').innerHTML=q?tree.filter(([n])=>n.toLowerCase().includes(q)).map(([n])=>`<p>${escapeHTML(n)}</p>`).join('')||'<p>No matching files.</p>':'';}
});
document.querySelector('#scenario').addEventListener('change',e=>{state.scenario=e.target.value;renderShell();});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape')document.body.classList.remove('canvas-only');
  if((e.metaKey||e.ctrlKey)&&e.key==='b'&&!document.body.classList.contains('gallery-page')){e.preventDefault();state.explorerHidden=!state.explorerHidden;renderShell();}
});
function bindResizers() {
  document.querySelectorAll('[data-resize]').forEach(handle=>{
    const kind=handle.dataset.resize;
    const update=value=>{
      const shell=document.querySelector('.tortie');
      const other=kind==='explorer'?document.querySelector('.session-panel'):document.querySelector('.explorer');
      const otherWidth=other?.getBoundingClientRect().width||0;
      const maximum=Math.min(420,shell.clientWidth-otherWidth-400);
      const width=Math.max(190,Math.min(Math.max(190,maximum),value));
      state[kind==='explorer'?'explorerWidth':'sessionsWidth']=width;
      shell.style.setProperty(`--${kind==='explorer'?'explorer':'sessions'}-width`,`${width}px`);
      handle.setAttribute('aria-valuenow',Math.round(width));
    };
    handle.addEventListener('pointerdown',e=>{
      e.preventDefault();handle.setPointerCapture(e.pointerId);
      const start=e.clientX;const initial=handle.parentElement.getBoundingClientRect().width;
      const move=event=>update(initial+(event.clientX-start)*(kind==='explorer'?1:-1));
      const end=()=>{handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',end);handle.removeEventListener('pointercancel',end);};
      handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',end);handle.addEventListener('pointercancel',end);
    });
    handle.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();update(handle.parentElement.getBoundingClientRect().width+(e.key==='ArrowRight'?12:-12)*(kind==='explorer'?1:-1));});
  });
}
if(new URLSearchParams(location.search).has('embed')) document.body.classList.add('canvas-only','embedded');
window.addEventListener('hashchange',route);
route();
