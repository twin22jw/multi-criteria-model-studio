const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const N = 6;

function switchTab(id) {
  $$('.tab').forEach(button => {
    const active = button.dataset.tab === id;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  $$('.page').forEach(page => page.classList.toggle('active', page.id === id));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
$$('.tab').forEach(button => button.addEventListener('click', () => switchTab(button.dataset.tab)));
$$('[data-tab-link]').forEach(button => button.addEventListener('click', () => switchTab(button.dataset.tabLink)));

function switchStep(id) {
  $$('.step').forEach(button => button.classList.toggle('active', button.dataset.step === id));
  $$('.hugag-step').forEach(panel => panel.classList.toggle('active', panel.id === 'step-' + id));
  $('.steps').scrollIntoView({ block: 'start', behavior: 'smooth' });
}
$$('.step').forEach(button => button.addEventListener('click', () => switchStep(button.dataset.step)));
$$('.next-step').forEach(button => button.addEventListener('click', () => switchStep(button.dataset.next)));

// A small synthetic elevation model; slope and aspect are derived from the same cells.
const dem = Array.from({ length: N * N }, (_, i) => {
  const row = Math.floor(i / N), col = i % N;
  return Math.round(1715 + 35 * row + 45 * col
    + 175 * Math.sin((col + .5) * .88) * Math.cos((row + .7) * .78)
    + 110 * Math.exp(-((row - 1.2) ** 2 + (col - 4.4) ** 2) / 2.6));
});
const at = (row, col) => dem[clamp(row, 0, N - 1) * N + clamp(col, 0, N - 1)];
const slope = [], aspect = [];
for (let row = 0; row < N; row++) for (let col = 0; col < N; col++) {
  const dzdx = (at(row, col + 1) - at(row, col - 1)) / (col === 0 || col === N - 1 ? 1 : 2);
  const dzdy = (at(row + 1, col) - at(row - 1, col)) / (row === 0 || row === N - 1 ? 1 : 2);
  slope.push(Math.round(Math.hypot(dzdx, dzdy) * .3048 / 75 * 100));
  const bearing = (Math.atan2(-dzdx, dzdy) * 180 / Math.PI + 360) % 360;
  aspect.push(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(bearing / 45) % 8]);
}
const elevationMask = dem.map(value => Number(value < 1900));
const slopeMask = slope.map(value => Number(value < 30));
const aspectMask = aspect.map(value => Number(!['N', 'NE', 'NW'].includes(value)));
const defaultWater = [19, 20, 25, 26, 31];
let landMask = Array(N * N).fill(1);
defaultWater.forEach(i => { landMask[i] = 0; });
let studentFinal = Array(N * N).fill(null);
let elevationFlipped = false;
let selectedCell = 20;
const weights = { elevation: 40, slope: 35, aspect: 25 };

const scoreMaps = {
  elevation: dem.map(value => Math.round(clamp((2100 - value) / 500) * 100)),
  slope: slope.map(value => Math.round(clamp(1 - value / 45) * 100)),
  aspect: aspect.map(value => ({ N: 10, NE: 35, E: 70, SE: 90, S: 100, SW: 90, W: 70, NW: 35 })[value])
};
const finalMask = () => elevationMask.map((value, i) => value * slopeMask[i] * aspectMask[i] * landMask[i]);
const totalWeight = () => Object.values(weights).reduce((sum, value) => sum + value, 0);
const indexAt = i => {
  const total = totalWeight();
  return total ? (weights.elevation * scoreMaps.elevation[i] + weights.slope * scoreMaps.slope[i] + weights.aspect * scoreMaps.aspect[i]) / total : null;
};
const cellPosition = i => `row ${Math.floor(i / N) + 1}, column ${i % N + 1}`;
const terrainColor = (value, min, max) => {
  const t = clamp((value - min) / (max - min));
  return `hsl(${100 - t * 65} ${38 + t * 18}% ${87 - t * 36}%)`;
};
const scoreColor = value => `hsl(${28 + value * 1.2} 47% ${91 - value * .43}%)`;

function staticCells(values, kind) {
  return values.map((value, i) => {
    let display = value, className = 'raster-cell', style = '';
    if (kind === 'binary') className += value ? ' binary-yes' : ' binary-no';
    if (kind === 'land') className += value ? ' land-cell' : ' water-cell';
    if (kind === 'land') display = value ? '1' : '0';
    if (kind === 'elevation') style = `background:${terrainColor(value, Math.min(...dem), Math.max(...dem))}`;
    if (kind === 'slope') { style = `background:${terrainColor(value, 0, 55)}`; display = value + '%'; }
    if (kind === 'aspect') style = `background:${['N', 'NE', 'NW'].includes(value) ? '#d6e0db' : '#e7dfbc'}`;
    if (kind === 'score') { style = `background:${scoreColor(value)}`; display = value; }
    return `<div class="${className}" ${style ? `style="${style}"` : ''} aria-label="${cellPosition(i)}: ${display}">${display}</div>`;
  }).join('');
}
function renderBinary() {
  $('#elevationMap').innerHTML = staticCells(elevationFlipped ? elevationMask : dem, elevationFlipped ? 'binary' : 'elevation');
  $('#elevationMapTitle').textContent = elevationFlipped ? 'Binary elevation (0/1)' : 'Original elevation (ft)';
  $('#elevationMapNote').textContent = elevationFlipped ? 'Below 1,900 ft = 1' : 'Continuous source values';
  $('#flipElevation').textContent = elevationFlipped ? '← Show original elevation' : 'Show binary elevation map →';
  $('#flipElevation').setAttribute('aria-pressed', String(elevationFlipped));
  $('#slopeOriginal').innerHTML = staticCells(slope, 'slope');
  $('#slopeBinary').innerHTML = staticCells(slopeMask, 'binary');
  $('#aspectOriginal').innerHTML = staticCells(aspect, 'aspect');
  $('#aspectBinary').innerHTML = staticCells(aspectMask, 'binary');
  $('#finalElevation').innerHTML = staticCells(elevationMask, 'binary');
  $('#finalSlope').innerHTML = staticCells(slopeMask, 'binary');
  $('#finalAspect').innerHTML = staticCells(aspectMask, 'binary');
  $('#finalWater').innerHTML = staticCells(landMask, 'land');
  $('#finalCorrect').innerHTML = staticCells(finalMask(), 'binary');
  renderStudent();
}
$('#flipElevation').addEventListener('click', () => { elevationFlipped = !elevationFlipped; renderBinary(); });

function setSwipe(id, position) {
  const p = clamp(position, 0, 100);
  const handle = $('#' + id + 'Line');
  handle.style.left = p + '%';
  $('#' + id + 'Binary').style.clipPath = `inset(0 0 0 ${p}%)`;
  handle.dataset.position = String(p);
  handle.setAttribute('aria-valuenow', String(Math.round(100 - p)));
  handle.setAttribute('aria-valuetext', p === 100 ? 'Original map fully visible' : p === 0 ? 'Binary map fully visible' : `${Math.round(100 - p)} percent binary map visible`);
}
for (const id of ['slope', 'aspect']) {
  const wrap = $('#' + id + 'Swipe'), handle = $('#' + id + 'Line');
  setSwipe(id, 100);
  let dragging = false;
  handle.addEventListener('pointerdown', event => {
    dragging = true;
    handle.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  handle.addEventListener('pointermove', event => {
    if (!dragging) return;
    const rect = wrap.getBoundingClientRect();
    setSwipe(id, (event.clientX - rect.left) / rect.width * 100);
  });
  const stop = () => { dragging = false; };
  handle.addEventListener('pointerup', stop);
  handle.addEventListener('pointercancel', stop);
  handle.addEventListener('keydown', event => {
    const current = Number(handle.dataset.position);
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      setSwipe(id, current + (event.key === 'ArrowLeft' ? -5 : 5));
    } else if (event.key === 'Home') { event.preventDefault(); setSwipe(id, 0); }
    else if (event.key === 'End') { event.preventDefault(); setSwipe(id, 100); }
  });
}

function renderStudent() {
  const answer = finalMask(), checked = !$('#finalAnswer').hidden;
  $('#finalStudent').innerHTML = studentFinal.map((value, i) => {
    const className = 'raster-cell ' + (value === null ? 'unset' : value ? 'binary-yes' : 'binary-no') + (checked && value !== null ? value === answer[i] ? ' correct' : ' wrong' : '');
    return `<button type="button" class="${className}" data-final-cell="${i}" aria-label="${cellPosition(i)}: ${value === null ? 'unclassified' : value}; click for 0, double click for 1">${value === null ? '?' : value}</button>`;
  }).join('');
  $('#finalProgress').textContent = `${studentFinal.filter(value => value !== null).length} / 36 classified`;
}
let clickTimer = null;
$('#finalStudent').addEventListener('click', event => {
  const button = event.target.closest('[data-final-cell]');
  if (!button) return;
  clearTimeout(clickTimer);
  const i = Number(button.dataset.finalCell);
  clickTimer = setTimeout(() => { studentFinal[i] = 0; renderStudent(); }, 260);
});
$('#finalStudent').addEventListener('dblclick', event => {
  const button = event.target.closest('[data-final-cell]');
  if (!button) return;
  clearTimeout(clickTimer);
  studentFinal[Number(button.dataset.finalCell)] = 1;
  renderStudent();
});
$('#finalStudent').addEventListener('keydown', event => {
  const button = event.target.closest('[data-final-cell]');
  if (!button || !['0', '1'].includes(event.key)) return;
  studentFinal[Number(button.dataset.finalCell)] = Number(event.key);
  renderStudent();
  $('#finalStudent [data-final-cell="' + button.dataset.finalCell + '"]').focus();
});
$('#checkFinal').addEventListener('click', () => {
  const answer = finalMask(), filled = studentFinal.filter(value => value !== null).length;
  const correct = studentFinal.filter((value, i) => value !== null && value === answer[i]).length;
  $('#finalAnswer').hidden = false;
  $('#finalFeedback').innerHTML = `<b>${correct} correct of ${filled} classified</b> · ${36 - filled} unclassified. Green outlines mark correct choices; orange outlines mark cells to revisit.`;
  renderStudent();
});
$('#resetFinal').addEventListener('click', () => {
  studentFinal.fill(null);
  $('#finalAnswer').hidden = true;
  $('#finalFeedback').textContent = 'Only cells where every factor passes and the cell is land can be suitable.';
  renderStudent();
});

function renderWeights() {
  const total = totalWeight();
  for (const key of Object.keys(weights)) $('#weight' + key[0].toUpperCase() + key.slice(1) + 'Value').textContent = total ? (weights[key] / total * 100).toFixed(0) + '%' : '0%';
  $('#weightSummary').textContent = total ? `Input total ${total}; effective shares are normalized to 100%.` : 'All weights are zero. Raise at least one weight to calculate the index.';
}
$$('[data-weight]').forEach(input => input.addEventListener('input', () => {
  weights[input.dataset.weight] = Number(input.value);
  renderIndex();
}));
$('#resetWeights').addEventListener('click', () => {
  Object.assign(weights, { elevation: 40, slope: 35, aspect: 25 });
  $$('[data-weight]').forEach(input => { input.value = weights[input.dataset.weight]; });
  renderIndex();
});

function renderWater() {
  $('#waterEditor').innerHTML = landMask.map((value, i) => `<button type="button" class="raster-cell ${value ? 'land-cell' : 'water-cell'}" data-water-cell="${i}" aria-pressed="${!value}" aria-label="${cellPosition(i)}: ${value ? 'land' : 'water'}; click to toggle">${value ? '1' : '0'}</button>`).join('');
}
function waterChanged() {
  $('#finalAnswer').hidden = true;
  $('#finalFeedback').textContent = 'Water changed. Compare your final map with the updated answer.';
  renderWater();
  renderBinary();
  renderIndex();
}
$('#waterEditor').addEventListener('click', event => {
  const button = event.target.closest('[data-water-cell]');
  if (!button) return;
  const i = Number(button.dataset.waterCell);
  landMask[i] = 1 - landMask[i];
  selectedCell = i;
  waterChanged();
  $('#waterEditor [data-water-cell="' + i + '"]').focus();
});
$('#resetWater').addEventListener('click', () => {
  landMask.fill(1);
  defaultWater.forEach(i => { landMask[i] = 0; });
  waterChanged();
});
$('#clearWater').addEventListener('click', () => { landMask.fill(1); waterChanged(); });

function outputCells(masked) {
  return landMask.map((land, i) => {
    const value = indexAt(i), excluded = masked && !land;
    const display = excluded ? '—' : value === null ? '—' : Math.round(value);
    const style = excluded ? '' : value === null ? '' : `style="background:${scoreColor(value)}"`;
    const className = 'raster-cell output-cell' + (excluded ? ' excluded' : '') + (selectedCell === i ? ' selected' : '');
    return `<button type="button" class="${className}" data-index-cell="${i}" ${style} aria-label="${cellPosition(i)}: ${excluded ? 'water, excluded' : value === null ? 'no score, set a weight' : 'index ' + Math.round(value)}">${display}</button>`;
  }).join('');
}
function renderDetail() {
  const i = selectedCell, total = totalWeight(), value = indexAt(i), land = landMask[i];
  if (!total) {
    $('#cellDetail').innerHTML = `<b>Cell ${cellPosition(i)}</b> · Choose at least one nonzero weight to calculate a score.`;
    return;
  }
  const parts = ['elevation', 'slope', 'aspect'].map(key => {
    const share = weights[key] / total;
    return `${key[0].toUpperCase() + key.slice(1)} ${scoreMaps[key][i]} × ${(share * 100).toFixed(0)}%`;
  });
  const binary = finalMask()[i];
  $('#cellDetail').innerHTML = `<b>Cell ${cellPosition(i)}</b><br>${parts.join(' + ')} = <b>${value.toFixed(1)} / 100</b> before the constraint.<br>${land ? `Land = 1, so the final index stays ${value.toFixed(1)}. Binary product: ${elevationMask[i]} × ${slopeMask[i]} × ${aspectMask[i]} × 1 = <b>${binary}</b>.` : `Water = 0. Binary product: ${elevationMask[i]} × ${slopeMask[i]} × ${aspectMask[i]} × 0 = <b>0</b>. Final index: <b>excluded / NoData</b>, not a score of 0.`}`;
}
function renderIndex() {
  renderWeights();
  for (const key of ['elevation', 'slope', 'aspect']) $('#score' + key[0].toUpperCase() + key.slice(1)).innerHTML = staticCells(scoreMaps[key], 'score');
  $('#indexRaw').innerHTML = outputCells(false);
  $('#indexFinal').innerHTML = outputCells(true);
  renderDetail();
}
for (const id of ['indexRaw', 'indexFinal']) $('#' + id).addEventListener('click', event => {
  const button = event.target.closest('[data-index-cell]');
  if (!button) return;
  selectedCell = Number(button.dataset.indexCell);
  renderIndex();
  $('#' + id + ' [data-index-cell="' + selectedCell + '"]').focus();
});

renderWater();
renderBinary();
renderIndex();
