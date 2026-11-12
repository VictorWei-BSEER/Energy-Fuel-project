// Every product view stays mounted. Switching tabs preserves forms, solved
// plans, research controls and each view's scroll position.
const tabs = [...document.querySelectorAll('[data-workspace]')];
const panels = [...document.querySelectorAll('.workspace-panel')];
const names = tabs.map(tab => tab.dataset.workspace);
const scrollPositions = new Map();
const titles = {
  calculations: document.body.classList.contains('network-workspace') ? 'Supply-chain model' : 'Global fuel model', 'oil-markets': 'Market data',
  research: 'Research report', briefing: 'Project brief', sources: 'Sources & methods',
};
let active = null;

function readRoute(hash = window.location.hash) {
  let value;
  try { value = decodeURIComponent(hash.replace(/^#/, '')); } catch { return null; }
  const [name, ...parts] = value.split('/');
  if (!names.includes(name)) return null;
  return { name, section: parts.join('/') };
}

function selectWorkspace(route, { navigate = false, focus = false } = {}) {
  if (typeof route === 'string') route = readRoute(route.startsWith('#') ? route : `#${route}`);
  if (!route) return;
  const { name, section = '' } = route;
  const changed = active !== name;
  if (changed && active) scrollPositions.set(active, window.scrollY || 0);
  active = name;
  for (const tab of tabs) {
    const selected = tab.dataset.workspace === name;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    if (selected && focus && !section) tab.focus();
  }
  for (const panel of panels) panel.hidden = panel.id !== `workspace-${name}`;
  document.documentElement.dataset.activeWorkspace = name;
  document.title = `${titles[name] || name} — Fuel Atlas`;
  const hash = `#${name}${section ? `/${encodeURIComponent(section)}` : ''}`;
  if (navigate && window.location.hash !== hash) window.history.pushState(null, '', hash);
  if (changed) document.dispatchEvent(new CustomEvent('workspacechange', { detail: { workspace: name } }));
  const panel = panels.find(item => item.id === `workspace-${name}`);
  const target = section ? document.getElementById(section) : null;
  if (target && panel?.contains(target)) {
    target.scrollIntoView?.({ block: 'start', behavior: 'instant' });
    if (focus) { target.setAttribute('tabindex', '-1'); target.focus({ preventScroll: true }); }
  } else if (changed && (navigate || section)) {
    window.scrollTo({ top: scrollPositions.get(name) || 0, behavior: 'instant' });
  }
}

for (const tab of tabs) {
  tab.addEventListener('click', () => selectWorkspace(tab.dataset.workspace, { navigate: true }));
  tab.addEventListener('keydown', event => {
    let index = tabs.indexOf(tab);
    if (event.key === 'ArrowRight') index = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') index = (index + tabs.length - 1) % tabs.length;
    else if (event.key === 'Home') index = 0;
    else if (event.key === 'End') index = tabs.length - 1;
    else return;
    event.preventDefault();
    selectWorkspace(tabs[index].dataset.workspace, { navigate: true, focus: true });
  });
}
for (const button of document.querySelectorAll('[data-open-workspace]')) {
  button.addEventListener('click', () => selectWorkspace(button.dataset.openWorkspace, { navigate: true, focus: true }));
}
document.addEventListener('click', event => {
  if (event.defaultPrevented || event.button > 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  const link = event.target.closest?.('a[href^="#"]');
  if (!link || link.hasAttribute('download') || link.target) return;
  const route = readRoute(link.getAttribute('href'));
  if (!route) return;
  event.preventDefault();
  selectWorkspace(route, { navigate: true, focus: true });
});
const onHistory = () => selectWorkspace(readRoute() || { name: 'calculations', section: '' });
window.addEventListener('hashchange', onHistory);
window.addEventListener('popstate', onHistory);
if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
selectWorkspace(readRoute() || { name: 'calculations', section: '' });
