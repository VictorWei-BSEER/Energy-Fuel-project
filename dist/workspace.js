// Switching workspaces keeps the model, form inputs and result tabs mounted.
const tabs = [...document.querySelectorAll('[data-workspace]')];
const panels = [...document.querySelectorAll('.workspace-panel')];
const names = tabs.map(tab => tab.dataset.workspace);
let active = null;

function selectWorkspace(name, { navigate = false, focus = false } = {}) {
  if (!names.includes(name)) return;
  const changed = active !== name;
  active = name;
  for (const tab of tabs) {
    const selected = tab.dataset.workspace === name;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    if (selected && focus) tab.focus();
  }
  for (const panel of panels) panel.hidden = panel.id !== `workspace-${name}`;
  if (navigate && window.location.hash !== `#${name}`) {
    window.history.pushState(null, '', `#${name}`);
  }
  if (changed) {
    document.dispatchEvent(new CustomEvent('workspacechange', { detail: { workspace: name } }));
    if (navigate) window.scrollTo({ top: 0, behavior: 'instant' });
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
const readHash = () => {
  const name = window.location.hash.slice(1);
  if (names.includes(name)) selectWorkspace(name);
};
window.addEventListener('hashchange', readHash);
window.addEventListener('popstate', readHash);
selectWorkspace(names.includes(window.location.hash.slice(1)) ? window.location.hash.slice(1) : 'calculations');
