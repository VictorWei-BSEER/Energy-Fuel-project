import { AIRPORT_DIRECTORY, airportLabelLayout } from './airport-directory.js';
import { project, WIDTH, HEIGHT } from './asia-map.js';

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const airports = AIRPORT_DIRECTORY.airports;
const svg = $('#atlas-map');
const select = $('#planning-airport-select');
const layer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
layer.id = 'planning-airports';
svg.append(layer);
$('#workspace-calculations').classList.add('has-airport-directory');
const countries = { CN: 'China', JP: 'Japan', KR: 'South Korea', SG: 'Singapore', HK: 'Hong Kong', MY: 'Malaysia', TH: 'Thailand', PH: 'Philippines', TW: 'Taiwan', VN: 'Vietnam' };
const millions = value => `${(value / 1_000_000).toFixed(1)}M`;
const displayCities = { HND: 'Tokyo Haneda', NRT: 'Tokyo Narita', KUL: 'Kuala Lumpur', TPE: 'Taipei Taoyuan', ITM: 'Osaka Itami', KIX: 'Osaka Kansai', PVG: 'Shanghai Pudong', SHA: 'Shanghai Hongqiao', ICN: 'Seoul Incheon', GMP: 'Seoul Gimpo', TFU: 'Chengdu Tianfu', CTU: 'Chengdu Shuangliu', BKK: 'Bangkok Suvarnabhumi', DMK: 'Bangkok Don Mueang' };
const displayCity = airport => displayCities[airport.iata] || airport.city.replace(/\s*\([^)]*\)/g, '');
let selected = null;
let zoomIndex = 0;
const zoomLevels = [1, 1.5, 2, 3];

select.replaceChildren(new Option('Explore 50 airports…', ''), ...[...airports].sort((a, b) => displayCity(a).localeCompare(displayCity(b)) || a.iata.localeCompare(b.iata)).map(a => new Option(`${a.iata} · ${displayCity(a)}`, a.iata)));
$('#airport-coverage-count').textContent = `${airports.length} airports`;
$('#airport-cutoff').textContent = `2024 passengers · minimum ${millions(AIRPORT_DIRECTORY.minimumAnnualPassengers)}`;

function render() {
  const labels = airportLabelLayout(airports, project, selected);
  layer.innerHTML = airports.map(a => {
    const [x, y] = project(a.lon, a.lat);
    const active = a.iata === selected;
    const label = labels.get(a.iata);
    const radius = active ? 6 : a.rank <= 12 ? 4.5 : 3.4;
    return `<g class="directory-airport${active ? ' selected' : ''}" transform="translate(${x},${y})" data-directory-airport="${a.iata}" role="button" tabindex="${a.iata === (selected || airports[0].iata) ? 0 : -1}" aria-pressed="${active}" aria-label="${esc(a.iata + ' · ' + a.name + ', ' + millions(a.annualPassengers) + ' passengers in 2024')}"><title>${esc(a.iata + ' · ' + a.name + ' · ' + millions(a.annualPassengers) + ' passengers (2024)')}</title><circle class="directory-airport-hit" r="9"/><circle class="directory-airport-dot" r="${radius}"/>${active ? '<circle class="directory-airport-halo" r="10"/>' : ''}${label ? `<text class="directory-airport-label" x="${label.dx}" y="${label.dy}">${a.iata}</text>` : ''}</g>`;
  }).join('');
}

function updateZoom() {
  const zoom = zoomLevels[zoomIndex];
  const width = WIDTH / zoom, height = HEIGHT / zoom;
  const airport = airports.find(a => a.iata === selected);
  const [cx, cy] = airport ? project(airport.lon, airport.lat) : [WIDTH / 2, HEIGHT / 2];
  const x = Math.max(0, Math.min(WIDTH - width, cx - width / 2));
  const y = Math.max(0, Math.min(HEIGHT - height, cy - height / 2));
  svg.setAttribute('viewBox', `${x} ${y} ${width} ${height}`);
  $('#airport-zoom-in').disabled = zoomIndex === zoomLevels.length - 1;
  $('#airport-zoom-out').disabled = zoomIndex === 0;
  $('#airport-zoom-reset').textContent = `${Math.round(zoom * 100)}%`;
}

function chooseAirport(iata, focus = false) {
  const airport = airports.find(a => a.iata === iata);
  selected = airport?.iata || null;
  select.value = selected || '';
  $('#planning-airport-detail').hidden = !airport;
  if (airport) {
    $('#planning-airport-name').textContent = `${airport.iata} · ${airport.name}`;
    $('#planning-airport-meta').textContent = `${countries[airport.country] || airport.country} · ${millions(airport.annualPassengers)} passengers in 2024 · #${airport.rank} in this frame`;
  }
  render();
  updateZoom();
  if (focus && selected) layer.querySelector(`[data-directory-airport="${selected}"]`)?.focus({ preventScroll: true });
}

select.addEventListener('change', () => chooseAirport(select.value));
layer.addEventListener('click', event => {
  const target = event.target.closest('[data-directory-airport]');
  if (target) chooseAirport(target.dataset.directoryAirport);
});
layer.addEventListener('keydown', event => {
  const target = event.target.closest('[data-directory-airport]');
  if (!target) return;
  let index = airports.findIndex(a => a.iata === target.dataset.directoryAirport);
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); chooseAirport(target.dataset.directoryAirport, true); return; }
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') index = (index + 1) % airports.length;
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') index = (index + airports.length - 1) % airports.length;
  else if (event.key === 'Home') index = 0;
  else if (event.key === 'End') index = airports.length - 1;
  else return;
  event.preventDefault();
  chooseAirport(airports[index].iata, true);
});
$('#airport-zoom-in').addEventListener('click', () => { zoomIndex = Math.min(zoomLevels.length - 1, zoomIndex + 1); updateZoom(); });
$('#airport-zoom-out').addEventListener('click', () => { zoomIndex = Math.max(0, zoomIndex - 1); updateZoom(); });
$('#airport-zoom-reset').addEventListener('click', () => { zoomIndex = 0; updateZoom(); });

$('#directory-method').textContent = `The planning map includes the 50 busiest scheduled-service airports within 92–151°E and 6°S–51°N, using 2024 total passenger traffic. The cutoff is ${AIRPORT_DIRECTORY.minimumAnnualPassengers.toLocaleString('en-US')} passengers (${airports.at(-1).iata}). A fixed year keeps the comparison consistent; reported totals may be rounded.`;
$('#directory-rows').innerHTML = airports.map(a => `<tr><td>${a.rank}</td><td><button type="button" class="airport-table-button" data-directory-select="${a.iata}">${a.iata}</button></td><td>${esc(a.name)}</td><td>${esc(displayCity(a))}</td><td>${a.annualPassengers.toLocaleString('en-US')}</td><td>${esc(countries[a.country] || a.country)}</td></tr>`).join('');
$('#directory-rows').addEventListener('click', event => {
  const target = event.target.closest('[data-directory-select]');
  if (!target) return;
  $('#workspace-tab-calculations').click();
  chooseAirport(target.dataset.directorySelect);
  svg.scrollIntoView({ behavior: 'smooth', block: 'center' });
});
$('#directory-sources').innerHTML = `<a href="https://ourairports.com/data/" target="_blank" rel="noopener noreferrer">OurAirports coordinates ↗</a>` + Object.values(AIRPORT_DIRECTORY.sources).map(source => `<a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.title)} ↗</a>`).join('');
render();
updateZoom();
