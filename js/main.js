import { app } from './app.js';
import {
  YDS_TO_M,
  SKILL_LEVELS,
  CLUB_REFERENCE_YDS,
  CLUB_SHORTHAND,
  LM_BENCHMARK_LOOKUP,
} from './constants.js';
import { parseCSV } from './parse-csv.js';




// ----- Helpers
const fmt = (v, d=1, unit='') => v == null ? '—' : v.toFixed(d) + unit;
const colorFor = (s) => {
  const side = s.totalSide ?? 0;
  if (Math.abs(side) <= 5) return 'var(--good)';
  return side < 0 ? 'var(--left)' : 'var(--right)';
};

/** Compact labels for shots list & club filter (full key stays in data + tooltips) */
function clubShorthand(club) {
  if (club == null || club === '') return '—';
  return CLUB_SHORTHAND[club] || club;
}

/** Benchmark carry (m) for a bag club key + global skill */
function getReferenceDistanceM(club) {
  const skill = app.state.referenceSkill;
  if (!club || !skill) return null;
  const row = CLUB_REFERENCE_YDS[club];
  if (!row) return null;
  const i = SKILL_LEVELS.indexOf(skill);
  if (i < 0) return null;
  const yds = row[i];
  if (yds == null) return null;
  return Math.round(yds * YDS_TO_M * 10) / 10;
}
/** One benchmark line on charts: filtered club, or sole club in data, else none */
function getChartBenchmarkCarryM() {
  if (!app.state.referenceSkill) return null;
  if (app.state.clubFilter !== 'all') return getReferenceDistanceM(app.state.clubFilter);
  const clubs = uniqueClubsInShots();
  if (clubs.length === 1) return getReferenceDistanceM(clubs[0]);
  return null;
}
function uniqueClubsInShots() {
  const set = new Set(app.SHOTS.map(s => s.club).filter(Boolean));
  return [...set].sort((a, b) => a.localeCompare(b));
}

// ----- State

/** Length stored in meters → display value (m or yds) */
function displayLen(m) {
  if (m == null) return null;
  return app.state.distanceUnit === 'yds' ? m / YDS_TO_M : m;
}
function distUnitSuffix() {
  return app.state.distanceUnit === 'yds' ? 'yds' : 'm';
}
/** Format a length stored in meters for the current unit */
function fmtLen(m, d = 1) {
  if (m == null) return '—';
  const v = displayLen(m).toFixed(d);
  return app.state.distanceUnit === 'yds' ? v + ' yds' : v + 'm';
}
/** Axis tick labels: round so yds/m never show float artifacts from unit conversion */
function axisTickLen(d) {
  if (app.state.distanceUnit === 'yds') return Math.round(d) + ' yds';
  const r = Math.round(d * 10) / 10;
  return r + 'm';
}
function syncTargetInput() {
  const el = document.getElementById('target-input');
  if (!el) return;
  if (app.state.target == null || app.state.target <= 0) {
    el.value = '';
    return;
  }
  const disp = displayLen(app.state.target);
  el.value = String(Math.round(disp * 10) / 10);
}
/** Carry distances (m) → thresholds for short / mid / long filters */
function getCarryDistThresholdsM() {
  const vals = app.SHOTS.map(s => s.carry).filter(v => v != null && isFinite(v));
  const meanCarry = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 50;
  if (vals.length < 3) {
    return { kind: 'fixed', lo: 50, hi: 100, centroid: meanCarry };
  }
  const sorted = [...vals].sort((a, b) => a - b);
  const q1 = quantileSorted(sorted, 1 / 3);
  const q2 = quantileSorted(sorted, 2 / 3);
  if (!(q1 < q2)) {
    return { kind: 'fixed', lo: 50, hi: 100, centroid: meanCarry };
  }
  return { kind: 'session', q1, q2, centroid: meanCarry };
}
function quantileSorted(sorted, p) {
  const n = sorted.length;
  if (n === 0) return NaN;
  if (n === 1) return sorted[0];
  const pos = (n - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  const w = pos - lo;
  return sorted[lo] * (1 - w) + sorted[hi] * w;
}
function updateDistPillLabels() {
  const shortEl = document.querySelector('#dist-pills [data-dist="short"]');
  const midEl = document.querySelector('#dist-pills [data-dist="mid"]');
  const longEl = document.querySelector('#dist-pills [data-dist="long"]');
  if (!shortEl || !midEl || !longEl) return;
  const th = getCarryDistThresholdsM();
  const a = th.kind === 'fixed' ? th.lo : th.q1;
  const b = th.kind === 'fixed' ? th.hi : th.q2;
  if (app.state.distanceUnit === 'yds') {
    const ay = Math.round(displayLen(a));
    const by = Math.round(displayLen(b));
    shortEl.innerHTML = '&lt; ' + ay + ' yds';
    midEl.textContent = ay + '–' + by + ' yds';
    longEl.innerHTML = '&gt; ' + by + ' yds';
  } else {
    const ra = Math.round(a * 10) / 10;
    const rb = Math.round(b * 10) / 10;
    shortEl.innerHTML = '&lt; ' + ra + 'm';
    midEl.textContent = ra + '–' + rb + 'm';
    longEl.innerHTML = '&gt; ' + rb + 'm';
  }
}
function updateDistanceUnitUI() {
  const u = app.state.distanceUnit;
  const ul = document.getElementById('units-line');
  if (ul) ul.innerHTML = 'units in <strong>' + (u === 'yds' ? 'yards' : 'meters') + '</strong>';
  document.querySelectorAll('#unit-toggle button').forEach(b => b.classList.toggle('active', b.dataset.unit === u));
  const hint = document.getElementById('target-unit-hint');
  if (hint) {
    const th = getCarryDistThresholdsM();
    hint.textContent = 'Ø ' + fmtLen(th.centroid, 0);
  }
  const sub = document.getElementById('dispersion-panel-sub');
  if (sub) {
    sub.textContent = app.state.distanceUnit === 'yds'
      ? 'Plan view · target 0 yds lateral'
      : 'Plan view · target 0m lateral';
  }
  const leg = document.getElementById('legend-5m');
  if (leg) leg.textContent = 'Within ' + fmtLen(5, 0) + ' of line';
  const hs = document.getElementById('hist-sub');
  if (hs) hs.textContent = u === 'yds' ? '~11 yd bins (10 m)' : '10 m buckets';
  updateDistPillLabels();
}
// Per-shot mutable state (keyed by shot number) — reset on CSV reload

function meta(shotNum) {
  if (!app.shotMeta[shotNum]) app.shotMeta[shotNum] = { hidden: false };
  return app.shotMeta[shotNum];
}

// Lateral miss vs. target line (same 5m band as chart coloring)
function lateralCategory(side) {
  if (side == null) return null;
  if (Math.abs(side) <= 5) return 'straight';
  return side < 0 ? 'left' : 'right';
}

function passesFilter(s) {
  if (app.state.distFilter !== 'all') {
    const c = s.carry;
    if (c == null || !isFinite(c)) return false;
    const th = getCarryDistThresholdsM();
    if (th.kind === 'fixed') {
      if (app.state.distFilter === 'short' && !(c < th.lo)) return false;
      if (app.state.distFilter === 'mid' && !(c >= th.lo && c <= th.hi)) return false;
      if (app.state.distFilter === 'long' && !(c > th.hi)) return false;
    } else {
      if (app.state.distFilter === 'short' && !(c < th.q1)) return false;
      if (app.state.distFilter === 'mid' && !(c >= th.q1 && c <= th.q2)) return false;
      if (app.state.distFilter === 'long' && !(c > th.q2)) return false;
    }
  }
  if (app.state.sideFilter !== 'all') {
    const cat = lateralCategory(s.totalSide);
    if (cat == null || cat !== app.state.sideFilter) return false;
  }
  if (app.state.clubFilter !== 'all' && (s.club || '') !== app.state.clubFilter) return false;
  return true;
}

function getSortedShots() {
  return [...app.SHOTS].sort((a, b) => {
    const av = a[app.state.sortKey], bv = b[app.state.sortKey];
    if (av == null) return 1; if (bv == null) return -1;
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return app.state.sortDir === 'asc' ? cmp : -cmp;
  });
}

/** Table / keyboard nav: when a club pill is selected, exclude other clubs entirely (not dimmed rows). */
function getSortedShotsTable() {
  const sorted = getSortedShots();
  if (app.state.clubFilter === 'all') return sorted;
  return sorted.filter(s => (s.club || '') === app.state.clubFilter);
}

function pruneSelectionToClubFilter() {
  if (app.state.clubFilter === 'all') return;
  const ok = getSortedShotsTable();
  if (!ok.length) {
    app.state.selectedShots = new Set();
    app.state.selectionAnchorShot = null;
    return;
  }
  const allowed = new Set(ok.map(s => s.shot));
  const next = [...app.state.selectedShots].filter(n => allowed.has(n));
  if (next.length === 0) {
    app.state.selectedShots = new Set([ok[0].shot]);
    app.state.selectionAnchorShot = ok[0].shot;
  } else if (next.length !== app.state.selectedShots.size) {
    app.state.selectedShots = new Set(next);
    app.state.selectionAnchorShot = next[0];
  }
}

/** First row in current table order — used so the detail panel shows content on load / after CSV import. */
function selectFirstShot() {
  const sorted = getSortedShotsTable();
  if (!sorted.length) {
    app.state.selectedShots = new Set();
    app.state.selectionAnchorShot = null;
    return;
  }
  const n = sorted[0].shot;
  app.state.selectedShots = new Set([n]);
  app.state.selectionAnchorShot = n;
}

// A shot is "visible" (drawn at full opacity) if it passes filters AND isn't user-hidden
function isVisible(s) {
  return passesFilter(s) && !meta(s.shot).hidden;
}

// Match row visibility to carry + lateral pills (replaces manual "show only filtered")
function syncHiddenToFilters() {
  app.SHOTS.forEach(s => { meta(s.shot).hidden = !passesFilter(s); });
}

// ----- Stats
function renderStats() {
  const carries = app.SHOTS.map(s => s.carry).filter(v => v != null);
  const sides = app.SHOTS.map(s => s.totalSide).filter(v => v != null);
  const speeds = app.SHOTS.map(s => s.ballSpeed).filter(v => v != null);
  const spins = app.SHOTS.map(s => s.spin).filter(v => v != null);
  const avg = a => a.reduce((x,y)=>x+y,0)/a.length;
  const std = a => { const m = avg(a); return Math.sqrt(avg(a.map(x => (x-m)**2))); };
  const longest = Math.max(...app.SHOTS.map(s => s.total ?? 0));
  const straight = app.SHOTS.filter(s => lateralCategory(s.totalSide) === 'straight').length;

  const items = [
    { label: 'Avg carry', val: fmtLen(avg(carries), 0) },
    { label: 'Longest', val: fmtLen(longest, 0) },
    { label: 'Avg ball speed', val: fmt(avg(speeds),0), unit: 'mph' },
    { label: 'Lateral σ', val: fmtLen(std(sides), 1) },
    { label: 'Avg spin', val: fmt(avg(spins),0), unit: 'rpm' },
    { label: 'Straight', val: straight + '/' + app.SHOTS.length },
  ];
  document.getElementById('stats').innerHTML = items.map(i =>
    `<div class="stat"><div class="stat-label">${i.label}</div><div class="stat-val ${i.cls||''}">${i.val}${i.unit?`<small>${i.unit}</small>`:''}</div></div>`
  ).join('');
}

// ----- Dispersion chart (W in user units matches container aspect so `meet` fills without side gutters)
const DISPERSION_H = 720;

function dispersionPlotWidthFromWrap(wrap) {
  if (!wrap || wrap.clientWidth < 2 || wrap.clientHeight < 2) return 520;
  const w = DISPERSION_H * (wrap.clientWidth / wrap.clientHeight);
  return Math.max(400, Math.min(Math.round(w * 100) / 100, 2000));
}

const SPEED_CHART_H = 480;
function speedPlotWidthFromWrap(wrap) {
  if (!wrap || wrap.clientWidth < 2 || wrap.clientHeight < 2) return 800;
  const w = SPEED_CHART_H * (wrap.clientWidth / wrap.clientHeight);
  return Math.max(400, Math.min(Math.round(w * 100) / 100, 2000));
}

const SPIN_CHART_H = 460;
function spinPlotWidthFromWrap(wrap) {
  if (!wrap || wrap.clientWidth < 2 || wrap.clientHeight < 2) return 800;
  const w = SPIN_CHART_H * (wrap.clientWidth / wrap.clientHeight);
  return Math.max(400, Math.min(Math.round(w * 100) / 100, 2000));
}

// ----- Dispersion chart
function renderDispersion() {
  const svg = document.getElementById('dispersion-chart');
  if (!svg) return;
  const wrap = svg.closest('.dispersion-chart-svg-wrap');
  const W = dispersionPlotWidthFromWrap(wrap);
  const H = DISPERSION_H;
  const M = { l: 42, r: 14, t: 18, b: 34 };
  const innerW = W - M.l - M.r, innerH = H - M.t - M.b;

  // Pick which coords are "primary" based on metric toggle
  const isCarry = app.state.metric === 'carry';
  const primSide = s => isCarry ? s.carrySide : s.totalSide;
  const primDist = s => isCarry ? s.carry : s.total;

  // Scale in display units (m or yds); shot data stays in meters internally
  const toU = (m) => displayLen(m);
  const sides = app.SHOTS.map(primSide).filter(v => v != null).map(toU);
  const dists = app.SHOTS.map(primDist).filter(v => v != null).map(toU);
  const niceMax = (v, step) => Math.ceil(v / step) * step;
  const niceFloor = (v, step) => Math.floor(v / step) * step;
  let xMin, xMax;
  if (sides.length) {
    const smin = Math.min(...sides);
    const smax = Math.max(...sides);
    const span = Math.max(smax - smin, toU(0.5));
    const pad = Math.max(span * 0.12, toU(3));
    xMin = smin - pad;
    xMax = smax + pad;
    xMin = Math.min(xMin, 0);
    xMax = Math.max(xMax, 0);
  } else {
    xMin = toU(-50);
    xMax = toU(35);
  }
  const xSpanPre = xMax - xMin;
  const xStep = xSpanPre > 120 ? 25 : xSpanPre > 60 ? 10 : 5;
  xMin = niceFloor(xMin, xStep);
  xMax = niceMax(xMax, xStep);
  const TARGET_RADIUS_DISP = toU(25); /* 25 m radius → display units */
  let yMax = dists.length ? niceMax(Math.max(...dists) * 1.1, toU(25)) : toU(170);
  if (app.state.target != null && app.state.target > 0) {
    yMax = niceMax(Math.max(yMax, toU(app.state.target) + TARGET_RADIUS_DISP), toU(25));
  }
  const refM = getChartBenchmarkCarryM();
  if (refM != null && refM > 0) {
    yMax = niceMax(Math.max(yMax, toU(refM)), toU(25));
  }
  const refU = refM != null && refM > 0 ? toU(refM) : null;
  const yMin = 0;
  const U = distUnitSuffix();
  const latLbl = (x) => {
    const r = app.state.distanceUnit === 'yds' ? Math.round(x) : Math.round(x * 10) / 10;
    return (r > 0 ? '+' : '') + r + (app.state.distanceUnit === 'yds' ? ' yds' : 'm');
  };
  const xRange = xMax - xMin;
  const yRange = yMax - yMin;
  const yStep = yMax > 250 ? 50 : 25;

  let plotW, plotH, offX, offY;
  let xScale, yScale;
  if (app.state.equalAxisScale) {
    const sx = innerW / xRange;
    const sy = innerH / yRange;
    const scale = Math.min(sx, sy);
    plotW = xRange * scale;
    plotH = yRange * scale;
    offX = M.l + (innerW - plotW) / 2;
    offY = M.t + (innerH - plotH) / 2;
    xScale = v => offX + ((v - xMin) / xRange) * plotW;
    yScale = v => offY + plotH - ((v - yMin) / yRange) * plotH;
  } else {
    plotW = innerW;
    plotH = innerH;
    offX = M.l;
    offY = M.t;
    xScale = v => M.l + ((v - xMin) / xRange) * innerW;
    yScale = v => M.t + innerH - ((v - yMin) / yRange) * innerH;
  }
  const plotMidY = offY + plotH / 2;

  let html = '';
  // Distance grid (horizontal lines) — every yStep
  for (let d = 0; d <= yMax; d += yStep) {
    html += `<line class="grid-line ${d % (yStep*2) === 0?'major':''}" x1="${offX}" x2="${offX + plotW}" y1="${yScale(d)}" y2="${yScale(d)}"/>`;
    if (d > 0) html += `<text class="axis-tick" x="${M.l-6}" y="${yScale(d)+3}" text-anchor="end">${axisTickLen(d)}</text>`;
  }
  // Lateral grid (vertical lines) — index steps avoid float drift from x += step in yds
  const xTickCount = Math.round((xMax - xMin) / xStep);
  for (let i = 0; i <= xTickCount; i++) {
    const x = xMin + i * xStep;
    html += `<line class="grid-line ${Math.abs(x) < 1e-6 ? 'major' : ''}" x1="${xScale(x)}" x2="${xScale(x)}" y1="${offY}" y2="${offY + plotH}"/>`;
    html += `<text class="axis-tick" x="${xScale(x)}" y="${H-M.b+14}" text-anchor="middle">${latLbl(x)}</text>`;
  }
  // Center target line
  html += `<line class="center-line" x1="${xScale(0)}" x2="${xScale(0)}" y1="${offY}" y2="${offY + plotH}"/>`;
  html += `<text class="axis-label" x="${xScale(0)}" y="${M.t-10}" text-anchor="middle" style="fill:var(--accent);letter-spacing:0.2em">▼ TARGET LINE</text>`;
  html += `<text class="axis-label" x="${offX + plotW / 2}" y="${H-10}" text-anchor="middle">LATERAL (${U}) — left ◀ ▶ right</text>`;
  html += `<text class="axis-label" x="${11}" y="${plotMidY}" text-anchor="middle" transform="rotate(-90,11,${plotMidY})">${isCarry?'CARRY':'TOTAL'} DISTANCE FROM TEE (${U})</text>`;

  // Target: 50m diameter (25m radius) — circle in plan view when 1:1; ellipse when Fill matches axis stretch
  if (app.state.target != null && app.state.target > 0 && toU(app.state.target) <= yMax) {
    const tx = xScale(0), ty = yScale(toU(app.state.target));
    const rx = TARGET_RADIUS_DISP * (plotW / xRange);
    const ry = TARGET_RADIUS_DISP * (plotH / yRange);
    html += `<ellipse class="target-band" cx="${tx}" cy="${ty}" rx="${rx}" ry="${ry}"/>`;
    html += `<text class="axis-tick" x="${tx+12}" y="${ty+3}" style="fill:var(--good)">target ${fmtLen(app.state.target, 1)}</text>`;
  }

  if (refU != null && refU > yMin && refU <= yMax) {
    const yRef = yScale(refU);
    const brx = TARGET_RADIUS_DISP * (plotW / xRange);
    const bry = TARGET_RADIUS_DISP * (plotH / yRange);
    html += `<line class="benchmark-hline" x1="${offX}" x2="${offX + plotW}" y1="${yRef}" y2="${yRef}"/>`;
    html += `<ellipse class="benchmark-target-ring" cx="${xScale(0)}" cy="${yRef}" rx="${brx}" ry="${bry}"/>`;
    html += `<text class="axis-tick" x="${offX + 6}" y="${yRef - 5}" text-anchor="start" style="fill:var(--right)">benchmark ${fmtLen(refM, 1)}</text>`;
  }

  // Dispersion: bivariate ellipse on centroid, or distance-only horizontal bands — skippable via Off
  const filtered = app.SHOTS.filter(s => isVisible(s) && primSide(s) != null && primDist(s) != null);
  if (filtered.length >= 3 && app.state.dispersionMode !== 'off') {
    const xs = filtered.map(s => toU(primSide(s)));
    const ys = filtered.map(s => toU(primDist(s)));
    const mx = xs.reduce((a,b)=>a+b)/xs.length;
    const my = ys.reduce((a,b)=>a+b)/ys.length;
    const sx = Math.sqrt(xs.reduce((a,b)=>a+(b-mx)**2,0)/xs.length);
    const sy = Math.sqrt(ys.reduce((a,b)=>a+(b-my)**2,0)/ys.length);
    const cx = xScale(mx), cy = yScale(my);
    if (app.state.dispersionMode === 'centroid') {
      const rx95 = Math.abs(xScale(mx+2*sx) - xScale(mx));
      const ry95 = Math.abs(yScale(my+2*sy) - yScale(my));
      const rx65 = Math.abs(xScale(mx+sx) - xScale(mx));
      const ry65 = Math.abs(yScale(my+sy) - yScale(my));
      html += `<ellipse class="ellipse-95" cx="${cx}" cy="${cy}" rx="${rx95}" ry="${ry95}"/>`;
      html += `<ellipse class="ellipse-65" cx="${cx}" cy="${cy}" rx="${rx65}" ry="${ry65}"/>`;
      html += `<circle cx="${cx}" cy="${cy}" r="3" fill="var(--accent)"/>`;
      html += `<text class="axis-tick" x="${cx+6}" y="${cy-6}" style="fill:var(--accent)">centroid</text>`;
    } else {
      const d95Top = Math.min(yMax, my + 2 * sy);
      const d95Bot = Math.max(yMin, my - 2 * sy);
      const d65Top = Math.min(yMax, my + sy);
      const d65Bot = Math.max(yMin, my - sy);
      const pyTop95 = yScale(d95Top);
      const pyBot95 = yScale(d95Bot);
      const pyTop65 = yScale(d65Top);
      const pyBot65 = yScale(d65Bot);
      if (pyBot95 > pyTop95) {
        html += `<rect class="dispersion-band-95" x="${offX}" y="${pyTop95}" width="${plotW}" height="${pyBot95 - pyTop95}"/>`;
      }
      if (pyBot65 > pyTop65) {
        html += `<rect class="dispersion-band-65" x="${offX}" y="${pyTop65}" width="${plotW}" height="${pyBot65 - pyTop65}"/>`;
      }
      const cx0 = xScale(0);
      const cyM = yScale(my);
      html += `<circle cx="${cx0}" cy="${cyM}" r="3" fill="var(--accent)"/>`;
      html += `<text class="axis-tick" x="${cx0+6}" y="${cyM-6}" style="fill:var(--accent)">mean dist</text>`;
    }
  }
  const legDisp = document.getElementById('legend-dispersion-label');
  if (legDisp) {
    if (app.state.dispersionMode === 'off') {
      legDisp.textContent = 'Dispersion overlay off';
    } else {
      legDisp.textContent = app.state.dispersionMode === 'centroid'
        ? '65% / 95% dispersion (ellipse)'
        : '65% / 95% distance bands';
    }
  }

  // Dots: only the active metric (carry or total per toggle)
  app.SHOTS.forEach(s => {
    const ps = primSide(s), pd = primDist(s);
    if (ps == null || pd == null) return;
    const visible = isVisible(s);
    const opacity = visible ? 1 : 0.12;
    const sel = app.state.selectedShots.has(s.shot) ? 'selected' : '';
    const hov = app.state.hovered === s.shot ? 'row-hover' : '';
    const metricLabel = isCarry ? 'carry' : 'total';
    const rDot = sel ? 9 : 6;
    html += `<circle class="shot-dot ${sel} ${hov}" data-shot="${s.shot}" cx="${xScale(toU(ps))}" cy="${yScale(toU(pd))}" r="${rDot}" fill="${colorFor(s)}" fill-opacity="${opacity*0.85}" stroke="${colorFor(s)}" stroke-opacity="${opacity}"><title>Shot ${s.shot} · ${fmtLen(pd,1)} ${metricLabel} · ${fmtLen(Math.abs(ps),1)} ${ps<0?'L':'R'}</title></circle>`;
  });

  svg.innerHTML = html;
  svg.querySelectorAll('.shot-dot').forEach(el => {
    const shotNum = parseInt(el.dataset.shot);
    el.addEventListener('click', () => selectFromChart(shotNum));
    el.addEventListener('mouseenter', () => setHover(shotNum));
    el.addEventListener('mouseleave', () => setHover(null));
  });
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  requestAnimationFrame(() => {
    if (!svg.isConnected || app.state.view !== 'dispersion') return;
    const w2 = dispersionPlotWidthFromWrap(svg.closest('.dispersion-chart-svg-wrap'));
    if (Math.abs(w2 - W) > 0.5) renderDispersion();
  });
}

// ----- Speed vs carry chart
function renderSpeedChart() {
  const svg = document.getElementById('speed-chart');
  if (!svg) return;
  const wrap = svg.closest('.speed-chart-svg-wrap');
  const W = speedPlotWidthFromWrap(wrap);
  const H = SPEED_CHART_H;
  const M = { l: 60, r: 30, t: 20, b: 50 };
  const innerW = W - M.l - M.r, innerH = H - M.t - M.b;
  const data = app.SHOTS.filter(s => s.ballSpeed != null && s.carry != null);
  const toU = (m) => displayLen(m);
  const niceMax2 = (v, step) => Math.ceil(v / step) * step;
  const xMax = data.length ? niceMax2(Math.max(...data.map(s => s.ballSpeed)) * 1.1, 20) : 120;
  const refM = getChartBenchmarkCarryM();
  let yMax = data.length ? niceMax2(Math.max(...data.map(s => toU(s.carry))) * 1.1, 20) : toU(160);
  if (refM != null && refM > 0) {
    yMax = niceMax2(Math.max(yMax, toU(refM)), 20);
  }
  const refU = refM != null && refM > 0 ? toU(refM) : null;
  const xMin = 0, yMin = 0;
  const xStep = xMax > 200 ? 40 : 20;
  const yStep = yMax > 200 ? 40 : 20;
  const xs = v => M.l + ((v-xMin)/(xMax-xMin))*innerW;
  const ys = v => M.t + innerH - ((v-yMin)/(yMax-yMin))*innerH;

  let html = '';
  for (let v = 0; v <= yMax; v += yStep) {
    html += `<line class="grid-line ${v % (yStep*2) === 0?'major':''}" x1="${M.l}" x2="${W-M.r}" y1="${ys(v)}" y2="${ys(v)}"/>`;
    html += `<text class="axis-tick" x="${M.l-8}" y="${ys(v)+3}" text-anchor="end">${axisTickLen(v)}</text>`;
  }
  for (let v = 0; v <= xMax; v += xStep) {
    html += `<line class="grid-line" x1="${xs(v)}" x2="${xs(v)}" y1="${M.t}" y2="${M.t+innerH}"/>`;
    html += `<text class="axis-tick" x="${xs(v)}" y="${H-M.b+16}" text-anchor="middle">${v}</text>`;
  }
  if (refU != null && refU > yMin && refU <= yMax) {
    const yr = ys(refU);
    html += `<line class="benchmark-hline" x1="${M.l}" x2="${W-M.r}" y1="${yr}" y2="${yr}"/>`;
    html += `<text class="axis-tick" x="${W-M.r-4}" y="${yr-5}" text-anchor="end" style="fill:var(--right)">benchmark ${fmtLen(refM, 1)}</text>`;
  }
  // Linear regression line (only with enough data)
  if (data.length >= 3) {
    const n = data.length;
    const sx = data.reduce((a,s)=>a+s.ballSpeed,0);
    const sy = data.reduce((a,s)=>a+s.carry,0);
    const sxx = data.reduce((a,s)=>a+s.ballSpeed*s.ballSpeed,0);
    const sxy = data.reduce((a,s)=>a+s.ballSpeed*s.carry,0);
    const slope = (n*sxy - sx*sy) / (n*sxx - sx*sx);
    const intercept = (sy - slope*sx)/n;
    const x1 = xMax * 0.15, x2 = xMax;
    const yAt = (xbs) => toU(xbs * slope + intercept);
    html += `<line stroke="var(--accent)" stroke-width="1" stroke-dasharray="6 4" opacity="0.5" x1="${xs(x1)}" y1="${ys(yAt(x1))}" x2="${xs(x2)}" y2="${ys(yAt(x2))}"/>`;
    html += `<text class="axis-tick" x="${xs(x2)-8}" y="${ys(yAt(x2))-6}" text-anchor="end" style="fill:var(--accent)">trend</text>`;
  }

  data.forEach(s => {
    const visible = isVisible(s);
    const sel = app.state.selectedShots.has(s.shot) ? 'selected' : '';
    const cy = toU(s.carry);
    const rDot = sel ? 9 : 6;
    html += `<circle class="shot-dot ${sel}" data-shot="${s.shot}" cx="${xs(s.ballSpeed)}" cy="${ys(cy)}" r="${rDot}" fill="${colorFor(s)}" fill-opacity="${visible?0.85:0.12}" stroke="${colorFor(s)}"><title>Shot ${s.shot}: ${s.ballSpeed} mph → ${fmtLen(s.carry, 1)}</title></circle>`;
  });

  html += `<text class="axis-label" x="${(M.l+W-M.r)/2}" y="${H-12}" text-anchor="middle">BALL SPEED (mph)</text>`;
  html += `<text class="axis-label" x="${15}" y="${M.t+innerH/2}" text-anchor="middle" transform="rotate(-90,15,${M.t+innerH/2})">CARRY (${distUnitSuffix()})</text>`;

  svg.innerHTML = html;
  svg.querySelectorAll('.shot-dot').forEach(el => { const n = parseInt(el.dataset.shot); el.addEventListener('click', () => selectFromChart(n)); el.addEventListener('mouseenter', () => setHover(n)); el.addEventListener('mouseleave', () => setHover(null)); });
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  requestAnimationFrame(() => {
    if (!svg.isConnected || app.state.view !== 'distance') return;
    const w2 = speedPlotWidthFromWrap(svg.closest('.speed-chart-svg-wrap'));
    if (Math.abs(w2 - W) > 0.5) renderSpeedChart();
  });
}

// ----- Histogram
function renderHistogram() {
  const carries = app.SHOTS.map(s => s.carry).filter(v => v != null);
  if (!carries.length) { document.getElementById('hist-carry').innerHTML = '<div style="color:var(--muted);font-style:italic;font-family:Fraunces,serif">No carry data</div>'; return; }
  const maxC = Math.ceil(Math.max(...carries) / 10) * 10;
  const buckets = {};
  for (let i = 0; i < maxC; i += 10) buckets[i] = 0;
  carries.forEach(c => { const b = Math.min(Math.floor(c/10)*10, maxC - 10); buckets[b] = (buckets[b]||0) + 1; });
  const max = Math.max(...Object.values(buckets));
  let html = '';
  Object.entries(buckets).forEach(([b, c]) => {
    const pct = (c/max)*100;
    const b0 = parseFloat(b);
    html += `<div class="hist-row"><span class="hist-label">${fmtLen(b0, 0)}–${fmtLen(b0 + 10, 0)}</span><div class="hist-bar-wrap"><div class="hist-bar" style="width:${pct}%"></div></div><span class="hist-count">${c}</span></div>`;
  });
  document.getElementById('hist-carry').innerHTML = html;
}

// ----- Spin axis chart
function renderSpinChart() {
  const svg = document.getElementById('spin-chart');
  if (!svg) return;
  const wrap = svg.closest('.spin-chart-svg-wrap');
  const W = spinPlotWidthFromWrap(wrap);
  const H = SPIN_CHART_H;
  const M = { l: 60, r: 30, t: 20, b: 50 };
  const innerW = W - M.l - M.r, innerH = H - M.t - M.b;
  const data = app.SHOTS.filter(s => s.spinAxis != null && s.curve != null);
  const toU = (m) => displayLen(m);
  const xMin = -90, xMax = 30, yMin = -25, yMax = 10;
  const yMinD = toU(yMin);
  const yMaxD = toU(yMax);
  const xs = v => M.l + ((v-xMin)/(xMax-xMin))*innerW;
  const ys = v => M.t + innerH - ((v-yMinD)/(yMaxD-yMinD))*innerH;

  let html = '';
  for (let vm = -25; vm <= 10; vm += 5) {
    const vd = toU(vm);
    const major = vm === 0;
    html += `<line class="grid-line ${major?'major':''}" x1="${M.l}" x2="${W-M.r}" y1="${ys(vd)}" y2="${ys(vd)}"/>`;
    html += `<text class="axis-tick" x="${M.l-8}" y="${ys(vd)+3}" text-anchor="end">${vm>0?'+':''}${fmtLen(vm, 0)}</text>`;
  }
  for (let v = -90; v <= 30; v += 15) {
    const major = v === 0;
    html += `<line class="grid-line ${major?'major':''}" x1="${xs(v)}" x2="${xs(v)}" y1="${M.t}" y2="${M.t+innerH}"/>`;
    html += `<text class="axis-tick" x="${xs(v)}" y="${H-M.b+16}" text-anchor="middle">${v>0?'+':''}${v}°</text>`;
  }

  data.forEach(s => {
    const visible = isVisible(s);
    const sel = app.state.selectedShots.has(s.shot) ? 'selected' : '';
    const cy = toU(s.curve);
    const rDot = sel ? 9 : 6;
    html += `<circle class="shot-dot ${sel}" data-shot="${s.shot}" cx="${xs(s.spinAxis)}" cy="${ys(cy)}" r="${rDot}" fill="${colorFor(s)}" fill-opacity="${visible?0.85:0.12}" stroke="${colorFor(s)}"><title>Shot ${s.shot}: axis ${s.spinAxis}° → curve ${fmtLen(s.curve, 1)}</title></circle>`;
  });

  html += `<text class="axis-label" x="${(M.l+W-M.r)/2}" y="${H-12}" text-anchor="middle">SPIN AXIS (°) — negative tilts left</text>`;
  html += `<text class="axis-label" x="${15}" y="${M.t+innerH/2}" text-anchor="middle" transform="rotate(-90,15,${M.t+innerH/2})">CURVE (${distUnitSuffix()}) — negative is left</text>`;

  svg.innerHTML = html;
  svg.querySelectorAll('.shot-dot').forEach(el => { const n = parseInt(el.dataset.shot); el.addEventListener('click', () => selectFromChart(n)); el.addEventListener('mouseenter', () => setHover(n)); el.addEventListener('mouseleave', () => setHover(null)); });
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  requestAnimationFrame(() => {
    if (!svg.isConnected || app.state.view !== 'diagnostics') return;
    const w2 = spinPlotWidthFromWrap(svg.closest('.spin-chart-svg-wrap'));
    if (Math.abs(w2 - W) > 0.5) renderSpinChart();
  });
}

// ----- 3D flight paths from tee (Three.js)
function plot3dHex(s) {
  const side = s.totalSide ?? 0;
  if (Math.abs(side) <= 5) return '#c5d167';
  return side < 0 ? '#d97757' : '#6b9bd1';
}

/**
 * Approximate 3D path from tee (0,0,0): carry phase uses a vertical-plane parabola with apex `height`;
 * lateral moves linearly from 0 to carrySide. Optional ground roll from carry landing to total landing.
 */
function flightPathFromTee(s, arcSteps = 48, rollSteps = 16) {
  const carry = s.carry;
  if (carry == null || carry <= 0) return null;
  const h = s.height != null && s.height > 0 ? s.height : 0;
  const lat0 = 0;
  const latC = s.carrySide != null ? s.carrySide : 0;
  const total = s.total != null ? s.total : carry;
  const latT = s.totalSide != null ? s.totalSide : latC;

  const xs = [];
  const ys = [];
  const zs = [];
  for (let i = 0; i <= arcSteps; i++) {
    const t = i / arcSteps;
    xs.push(lat0 + t * (latC - lat0));
    ys.push(t * carry);
    zs.push(h > 0 ? 4 * h * t * (1 - t) : 0);
  }
  if (total > carry + 0.05) {
    for (let j = 1; j <= rollSteps; j++) {
      const u = j / rollSteps;
      xs.push(latC + u * (latT - latC));
      ys.push(carry + u * (total - carry));
      zs.push(0);
    }
  }
  return { xs, ys, zs };
}

/** Axis limits for the full session (ignores list filters) so 3D scale stays fixed when filters change */
function getSceneAxisBounds3D() {
  const shots = app.SHOTS.filter(s => s.carry != null && s.carry > 0);
  if (shots.length === 0) {
    return { xr: [-50, 50], yr: [0, 160], zr: [0, 35] };
  }
  let xMin = Infinity;
  let xMax = -Infinity;
  let yMax = 0;
  let zMax = 0;
  for (const s of shots) {
    const latC = s.carrySide ?? 0;
    const latT = s.totalSide ?? latC;
    const total = s.total != null ? s.total : s.carry;
    const h = s.height ?? 0;
    xMin = Math.min(xMin, 0, latC, latT);
    xMax = Math.max(xMax, 0, latC, latT);
    yMax = Math.max(yMax, total);
    zMax = Math.max(zMax, h);
  }
  const xPad = Math.max(5, (xMax - xMin) * 0.08);
  const yPad = Math.max(5, yMax * 0.05);
  const zPad = Math.max(1, zMax * 0.12);
  if (zMax <= 0) zMax = 5;
  return {
    xr: [xMin - xPad, xMax + xPad],
    yr: [Math.min(0, -yPad * 0.02), yMax + yPad],
    zr: [0, zMax + zPad],
  };
}

let plot3dModulesPromise = null;
let plot3dRenderGen = 0;
let plot3dRT = null;

function ensurePlot3dModules() {
  if (!plot3dModulesPromise) {
    plot3dModulesPromise = (async () => {
      const THREE = await import('three');
      const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');
      const { Line2 } = await import('three/addons/lines/Line2.js');
      const { LineMaterial } = await import('three/addons/lines/LineMaterial.js');
      const { LineGeometry } = await import('three/addons/lines/LineGeometry.js');
      const { CSS2DRenderer, CSS2DObject } = await import('three/addons/renderers/CSS2DRenderer.js');
      return { THREE, OrbitControls, Line2, LineMaterial, LineGeometry, CSS2DRenderer, CSS2DObject };
    })();
  }
  return plot3dModulesPromise;
}

function disposePlot3dRuntime() {
  if (!plot3dRT) return;
  const rt = plot3dRT;
  plot3dRT = null;
  if (rt._replayRaf) cancelAnimationFrame(rt._replayRaf);
  if (rt._replayHighlightTimer) {
    clearTimeout(rt._replayHighlightTimer);
    rt._replayHighlightTimer = null;
  }
  if (rt._raf) cancelAnimationFrame(rt._raf);
  if (rt._onPointerUp && rt.renderer && rt.renderer.domElement) {
    rt.renderer.domElement.removeEventListener('pointerup', rt._onPointerUp);
    rt.renderer.domElement.removeEventListener('pointerdown', rt._onPointerDown);
  }
  if (rt.labelRenderer && rt.labelRenderer.domElement && rt.labelRenderer.domElement.parentNode) {
    rt.labelRenderer.domElement.remove();
  }
  rt.controls.dispose();
  rt.scene.traverse(obj => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
      else obj.material.dispose();
    }
  });
  rt.renderer.dispose();
  if (rt.renderer.domElement.parentNode) rt.renderer.domElement.remove();
}

function plot3dOpacityForShot(shot) {
  if (app.state.selectedShots.size === 0) return 1;
  if (app.state.selectedShots.has(shot)) return 1;
  return 0.18;
}

/** Single selected shot: thicker stroke; otherwise uniform width. */
function plot3dIsPrimarySelectedShot(shot) {
  return app.state.selectedShots.size === 1 && app.state.selectedShots.has(shot);
}

function plot3dApplyLineStyles(rt) {
  rt.shotGroup.children.forEach(child => {
    if (child.userData.traceLayer !== 'core') return;
    const shot = child.userData.shot;
    const mat = child.material;
    if (!mat) return;
    const baseOp = plot3dOpacityForShot(shot);
    const primary = plot3dIsPrimarySelectedShot(shot);
    const colorHex = child.userData.colorHex;
    child.visible = true;
    mat.color.setHex(colorHex);
    mat.linewidth = primary ? 4 : 1.6;
    mat.opacity = baseOp;
    mat.transparent = baseOp < 1;
    mat.depthWrite = true;
  });
}

function plot3dEaseOutCubic(u) {
  const x = Math.min(1, Math.max(0, u));
  return 1 - (1 - x) ** 3;
}

/** Full path visible for every shot line (after replay or when no replay). */
function plot3dRevealAllLines(rt) {
  rt.shotGroup.children.forEach(child => {
    if (child.userData.traceLayer !== 'core') return;
    child.visible = true;
    const flat = child.userData.flatPositions;
    if (flat && child.geometry && child.geometry.setPositions) {
      child.geometry.setPositions(flat);
      if (child.computeLineDistances) child.computeLineDistances();
    }
  });
}

function plot3dCancelReplay(rt) {
  if (rt._replayRaf) {
    cancelAnimationFrame(rt._replayRaf);
    rt._replayRaf = null;
  }
  if (rt._replayHighlightTimer) {
    clearTimeout(rt._replayHighlightTimer);
    rt._replayHighlightTimer = null;
  }
  rt._replayAnimGen = (rt._replayAnimGen || 0) + 1;
}

function plot3dSelectionReplaySig() {
  if (app.state.selectedShots.size !== 1) return null;
  return String([...app.state.selectedShots][0]);
}

/**
 * Single selection: replay that trace; others stay hidden until done, then dim vs selected.
 * No / multi selection: show all traces with normal dimming.
 */
function plot3dSyncSelectionPlayback(rt) {
  const replaySig = plot3dSelectionReplaySig();
  if (replaySig != null) {
    if (rt.lastReplayForSig !== replaySig) {
      plot3dBeginShotReplay(rt, parseInt(replaySig, 10), replaySig);
    }
  } else {
    rt.lastReplayForSig = null;
    plot3dCancelReplay(rt);
    plot3dRevealAllLines(rt);
    plot3dApplyLineStyles(rt);
  }
}

/** Animate progressive draw on the selected shot’s Line2 (subset setPositions); then reveal the rest. */
function plot3dBeginShotReplay(rt, shotNum, replaySig) {
  plot3dCancelReplay(rt);
  const myGen = rt._replayAnimGen;

  let coreLine = null;
  rt.shotGroup.children.forEach(child => {
    if (child.userData.shot !== shotNum || child.userData.traceLayer !== 'core') return;
    coreLine = child;
  });
  const flat = coreLine && coreLine.userData.flatPositions;
  if (!coreLine || !flat || !flat.length) {
    rt.lastReplayForSig = replaySig;
    plot3dRevealAllLines(rt);
    plot3dApplyLineStyles(rt);
    return;
  }

  rt.lastReplayForSig = replaySig;
  plot3dApplyLineStyles(rt);

  const pointCount = flat.length / 3;
  rt.shotGroup.children.forEach(child => {
    if (child.userData.traceLayer !== 'core') return;
    const sh = child.userData.shot;
    child.visible = sh === shotNum;
    if (child.visible && child.geometry && child.userData.flatPositions) {
      child.geometry.setPositions(child.userData.flatPositions);
      if (child.computeLineDistances) child.computeLineDistances();
    }
  });

  const highlightMs = 72;
  rt._replayHighlightTimer = setTimeout(() => {
    rt._replayHighlightTimer = null;
    if (plot3dRT !== rt || rt._replayAnimGen !== myGen) return;

    const applyPartial = nPts => {
      const n = Math.max(2, Math.min(pointCount, nPts));
      const sub = flat.subarray(0, n * 3);
      if (coreLine.geometry) {
        coreLine.geometry.setPositions(sub);
        coreLine.computeLineDistances();
      }
    };
    applyPartial(2);

    const t0 = performance.now();
    const durationMs = 1400;

    function frame(now) {
      if (plot3dRT !== rt || rt._replayAnimGen !== myGen) return;
      const u = Math.min(1, (now - t0) / durationMs);
      const progress = plot3dEaseOutCubic(u);
      const nPts = Math.max(2, Math.min(pointCount, Math.ceil(pointCount * progress)));
      applyPartial(nPts);

      if (u < 1) {
        rt._replayRaf = requestAnimationFrame(frame);
      } else {
        rt._replayRaf = null;
        applyPartial(pointCount);
        plot3dRevealAllLines(rt);
        plot3dApplyLineStyles(rt);
      }
    }
    rt._replayRaf = requestAnimationFrame(frame);
  }, highlightMs);
}

/**
 * Physics / CSV space: x=lateral, y=distance, z=height (m).
 * Three.js Y-up: (x, y, z) = (lateral, height, distance) so OrbitControls spherical math is stable.
 */
function plot3dDataToThree(THREE, lateral, distance, height) {
  return new THREE.Vector3(lateral, height, distance);
}

function plot3dBuildGrid(THREE, xr, yr, zr) {
  const group = new THREE.Group();
  const edgeColor = new THREE.Color(0x5a6058);
  const gridColor = new THREE.Color(0x3a4438);
  const x0 = xr[0];
  const x1 = xr[1];
  const y0 = yr[0];
  const y1 = yr[1];
  const z0 = zr[0];
  const z1 = zr[1];

  function addLine(a, b, color) {
    const geom = new THREE.BufferGeometry().setFromPoints([a, b]);
    const mat = new THREE.LineBasicMaterial({ color });
    group.add(new THREE.Line(geom, mat));
  }

  const corners = [
    plot3dDataToThree(THREE, x0, y0, z0), plot3dDataToThree(THREE, x1, y0, z0),
    plot3dDataToThree(THREE, x0, y1, z0), plot3dDataToThree(THREE, x1, y1, z0),
    plot3dDataToThree(THREE, x0, y0, z1), plot3dDataToThree(THREE, x1, y0, z1),
    plot3dDataToThree(THREE, x0, y1, z1), plot3dDataToThree(THREE, x1, y1, z1),
  ];
  const idx = [[0, 1], [1, 3], [3, 2], [2, 0], [4, 5], [5, 7], [7, 6], [6, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
  idx.forEach(([i, j]) => addLine(corners[i], corners[j], edgeColor));

  const stepX = Math.max(10, (x1 - x0) / 8);
  const stepY = Math.max(10, (y1 - y0) / 8);
  for (let gx = Math.ceil(x0 / stepX) * stepX; gx <= x1 + 1e-6; gx += stepX) {
    addLine(plot3dDataToThree(THREE, gx, y0, z0), plot3dDataToThree(THREE, gx, y1, z0), gridColor);
  }
  for (let gy = Math.ceil(y0 / stepY) * stepY; gy <= y1 + 1e-6; gy += stepY) {
    addLine(plot3dDataToThree(THREE, x0, gy, z0), plot3dDataToThree(THREE, x1, gy, z0), gridColor);
  }

  return group;
}

/** Tick + title labels in scene units (m); display text follows app distance unit. */
function plot3dBuildGridLabels(THREE, CSS2DObject, xr, yr, zr) {
  const group = new THREE.Group();
  const x0 = xr[0];
  const x1 = xr[1];
  const y0 = yr[0];
  const y1 = yr[1];
  const z0 = zr[0];
  const z1 = zr[1];

  const maxSpan = Math.max(x1 - x0, y1 - y0, z1 - z0, 1);
  const pad = Math.max(2, maxSpan * 0.035);
  const lift = Math.max(0.2, maxSpan * 0.01);

  const stepX = Math.max(10, (x1 - x0) / 8);
  const stepY = Math.max(10, (y1 - y0) / 8);
  const stepZ = Math.max(1, (z1 - z0) / 6);

  function makeLabel(text, className = 'plot3d-axis-label') {
    const div = document.createElement('div');
    div.className = className;
    div.textContent = text;
    return new CSS2DObject(div);
  }

  // Downrange distance — left edge of grid, slightly above ground
  for (let gy = Math.ceil(y0 / stepY) * stepY; gy <= y1 + 1e-6; gy += stepY) {
    const obj = makeLabel(axisTickLen(displayLen(gy)));
    obj.position.copy(plot3dDataToThree(THREE, x0 - pad, gy, z0 + lift));
    group.add(obj);
  }

  // Lateral — near downrange start (front edge of floor)
  for (let gx = Math.ceil(x0 / stepX) * stepX; gx <= x1 + 1e-6; gx += stepX) {
    const obj = makeLabel(axisTickLen(displayLen(gx)));
    obj.position.copy(plot3dDataToThree(THREE, gx, y0 - pad, z0 + lift));
    group.add(obj);
  }

  // Height — back-left vertical corner
  for (let zh = Math.ceil(z0 / stepZ) * stepZ; zh <= z1 + 1e-6; zh += stepZ) {
    if (zh < z0 + 1e-3) continue;
    const obj = makeLabel(axisTickLen(displayLen(zh)));
    obj.position.copy(plot3dDataToThree(THREE, x0 - pad, y0 - pad, zh));
    group.add(obj);
  }

  const tLat = makeLabel('Lateral', 'plot3d-axis-title');
  tLat.position.copy(plot3dDataToThree(THREE, (x0 + x1) / 2, y0 - pad * 1.9, z0 + lift * 1.2));
  group.add(tLat);

  const tDist = makeLabel('Distance', 'plot3d-axis-title');
  tDist.position.copy(plot3dDataToThree(THREE, x0 - pad * 1.9, (y0 + y1) / 2, z0 + lift * 1.2));
  group.add(tDist);

  const tHt = makeLabel('Height', 'plot3d-axis-title');
  tHt.position.copy(plot3dDataToThree(THREE, x0 - pad * 1.9, y0 - pad * 1.9, (z0 + z1) / 2));
  group.add(tHt);

  return group;
}

/** 50m diameter skill / target rings + dispersion overlay on the ground (matches plan chart). */
const PLOT3D_TARGET_RING_RADIUS_M = 25;

function plot3dBuildGroundOverlays(THREE, xr, yr, zr) {
  const group = new THREE.Group();
  const x0 = xr[0];
  const x1 = xr[1];
  const y0 = yr[0];
  const y1 = yr[1];
  const maxSpan = Math.max(x1 - x0, y1 - y0, zr[1] - zr[0], 1);
  const hLift = zr[0] + Math.max(0.02, maxSpan * 0.0002);

  const isCarry = app.state.metric === 'carry';
  const primSide = s => (isCarry ? s.carrySide : s.totalSide);
  const primDist = s => (isCarry ? s.carry : s.total);

  function addLineLoop(points, color, opacity) {
    const geom = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
    });
    group.add(new THREE.LineLoop(geom, mat));
  }

  function addRingDisc(centerLat, centerDist, radiusM, fillColor, fillOpacity, strokeColor, strokeOpacity) {
    const geom = new THREE.CircleGeometry(radiusM, 72);
    geom.rotateX(-Math.PI / 2);
    const fill = new THREE.MeshBasicMaterial({
      color: fillColor,
      transparent: true,
      opacity: fillOpacity,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geom, fill);
    mesh.position.set(centerLat, hLift, centerDist);
    group.add(mesh);
    const ringPts = [];
    const n = 72;
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * Math.PI * 2;
      const lat = centerLat + radiusM * Math.cos(t);
      const dist = centerDist + radiusM * Math.sin(t);
      ringPts.push(plot3dDataToThree(THREE, lat, dist, hLift));
    }
    addLineLoop(ringPts, strokeColor, strokeOpacity);
  }

  function addEllipseOutline(mx, my, rx, ry, color, opacity, segments = 72) {
    const pts = [];
    for (let i = 0; i < segments; i++) {
      const t = (i / segments) * Math.PI * 2;
      const lateral = mx + rx * Math.cos(t);
      const dist = my + ry * Math.sin(t);
      pts.push(plot3dDataToThree(THREE, lateral, dist, hLift));
    }
    addLineLoop(pts, color, opacity);
  }

  function addBandRect(dLo, dHi, color, opacity) {
    const lo = Math.max(y0, dLo);
    const hi = Math.min(y1, dHi);
    if (!(hi > lo + 1e-6)) return;
    const pts = [
      plot3dDataToThree(THREE, x0, lo, hLift),
      plot3dDataToThree(THREE, x1, lo, hLift),
      plot3dDataToThree(THREE, x1, hi, hLift),
      plot3dDataToThree(THREE, x0, hi, hLift),
    ];
    addLineLoop(pts, color, opacity);
  }

  const colBench = 0x6b9bd1;
  const colTarget = 0x8eb869;
  const col95 = 0xa8b5a0;
  const col65 = 0xc5d0c0;
  const colCentroid = 0xc5d167;

  const refM = getChartBenchmarkCarryM();
  if (refM != null && refM > 0) {
    addRingDisc(0, refM, PLOT3D_TARGET_RING_RADIUS_M, colBench, 0.12, colBench, 0.55);
  }

  if (app.state.target != null && app.state.target > 0) {
    addRingDisc(0, app.state.target, PLOT3D_TARGET_RING_RADIUS_M, colTarget, 0.08, colTarget, 0.45);
  }

  const filtered = app.SHOTS.filter(s => isVisible(s) && primSide(s) != null && primDist(s) != null);
  if (filtered.length >= 3 && app.state.dispersionMode !== 'off') {
    const xs = filtered.map(s => primSide(s));
    const ys = filtered.map(s => primDist(s));
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const my = ys.reduce((a, b) => a + b, 0) / ys.length;
    const sx = Math.sqrt(xs.reduce((a, b) => a + (b - mx) ** 2, 0) / xs.length);
    const sy = Math.sqrt(ys.reduce((a, b) => a + (b - my) ** 2, 0) / ys.length);

    if (app.state.dispersionMode === 'centroid') {
      addEllipseOutline(mx, my, 2 * sx, 2 * sy, col95, 0.32);
      addEllipseOutline(mx, my, sx, sy, col65, 0.45);
      const dotR = Math.max(0.15, maxSpan * 0.004);
      const dotGeom = new THREE.SphereGeometry(dotR, 12, 10);
      const dotMat = new THREE.MeshBasicMaterial({ color: colCentroid, depthWrite: false });
      const dot = new THREE.Mesh(dotGeom, dotMat);
      dot.position.copy(plot3dDataToThree(THREE, mx, my, hLift));
      group.add(dot);
    } else {
      const d95Top = Math.min(y1, my + 2 * sy);
      const d95Bot = Math.max(y0, my - 2 * sy);
      const d65Top = Math.min(y1, my + sy);
      const d65Bot = Math.max(y0, my - sy);
      addBandRect(d95Bot, d95Top, col95, 0.28);
      addBandRect(d65Bot, d65Top, col65, 0.38);
      const dotR = Math.max(0.15, maxSpan * 0.004);
      const dotGeom = new THREE.SphereGeometry(dotR, 12, 10);
      const dotMat = new THREE.MeshBasicMaterial({ color: colCentroid, depthWrite: false });
      const dot = new THREE.Mesh(dotGeom, dotMat);
      dot.position.copy(plot3dDataToThree(THREE, 0, my, hLift));
      group.add(dot);
    }
  }

  return group;
}

function plot3dRebuildShots(rt, pts) {
  const THREE = rt.THREE;
  const { Line2, LineMaterial, LineGeometry } = rt;
  const w = Math.max(1, rt.containerEl.clientWidth || 1);
  const h = Math.max(1, rt.containerEl.clientHeight || 1);
  const resolution = new THREE.Vector2(w, h);

  while (rt.shotGroup.children.length) {
    const c = rt.shotGroup.children[0];
    rt.shotGroup.remove(c);
    if (c.geometry) c.geometry.dispose();
    if (c.material) c.material.dispose();
  }

  const maxSpan = Math.max(
    rt.bounds.xr[1] - rt.bounds.xr[0],
    rt.bounds.yr[1] - rt.bounds.yr[0],
    rt.bounds.zr[1] - rt.bounds.zr[0],
  );
  const teeR = Math.max(0.2, maxSpan * 0.012);
  const teeGeom = new THREE.SphereGeometry(teeR, 16, 12);
  const teeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#e8dcc4') });
  const tee = new THREE.Mesh(teeGeom, teeMat);
  tee.position.set(0, 0, 0);
  tee.userData.shot = null;
  rt.shotGroup.add(tee);

  pts.forEach(s => {
    const path = flightPathFromTee(s);
    if (!path) return;
    const col = new THREE.Color(plot3dHex(s));
    const colorHex = col.getHex();
    const flat = new Float32Array(path.xs.length * 3);
    for (let i = 0; i < path.xs.length; i++) {
      const v = plot3dDataToThree(THREE, path.xs[i], path.ys[i], path.zs[i]);
      flat[i * 3] = v.x;
      flat[i * 3 + 1] = v.y;
      flat[i * 3 + 2] = v.z;
    }

    const geomCore = new LineGeometry();
    geomCore.setPositions(flat);
    const matCore = new LineMaterial({
      color: new THREE.Color(colorHex),
      linewidth: 1.6,
      transparent: true,
      opacity: 1,
      resolution,
      depthWrite: true,
    });

    const coreLine = new Line2(geomCore, matCore);
    coreLine.userData.shot = s.shot;
    coreLine.userData.traceLayer = 'core';
    coreLine.userData.colorHex = colorHex;
    coreLine.userData.flatPositions = flat;
    coreLine.computeLineDistances();

    rt.shotGroup.add(coreLine);
  });

  plot3dApplyLineStyles(rt);
}

function plot3dInitCamera(rt, xr, yr, zr) {
  const THREE = rt.THREE;
  const dx = xr[1] - xr[0];
  const dy = yr[1] - yr[0];
  const dz = zr[1] - zr[0];
  const maxDim = Math.max(dx, dy, dz);
  const dist = maxDim * 1.42;
  /** Physics-space offset from scene center toward camera: left of center, toward tee (-distance), elevated (+height). */
  const dirData = new THREE.Vector3(-1.45, -1.55, 1.75).normalize();
  const cx = (xr[0] + xr[1]) / 2;
  const cy = (yr[0] + yr[1]) / 2;
  const cz = (zr[0] + zr[1]) / 2;
  const eyeThree = plot3dDataToThree(
    THREE,
    cx + dirData.x * dist,
    cy + dirData.y * dist,
    cz + dirData.z * dist,
  );
  const targetThree = plot3dDataToThree(THREE, cx, cy, cz);
  rt.camera.up.set(0, 1, 0);
  rt.camera.position.copy(eyeThree);
  rt.controls.target.copy(targetThree);
  rt.controls.minDistance = maxDim * 0.05;
  rt.controls.maxDistance = maxDim * 15;
  rt.controls.minPolarAngle = 0.05;
  rt.controls.maxPolarAngle = Math.PI - 0.05;
  rt.controls.rotateSpeed = 0.85;
  rt.controls.zoomSpeed = 0.9;
  rt.controls.screenSpacePanning = false;
  rt.controls.update();
}

function plot3dResizeRenderer(rt) {
  const el = rt.containerEl;
  const w = Math.max(1, el.clientWidth || 1);
  const h = Math.max(1, el.clientHeight || 1);
  rt.camera.aspect = w / h;
  rt.camera.updateProjectionMatrix();
  rt.renderer.setSize(w, h);
  if (rt.labelRenderer) rt.labelRenderer.setSize(w, h);
  rt.shotGroup.children.forEach(child => {
    if (child.material && child.material.resolution) {
      child.material.resolution.set(w, h);
    }
  });
}

async function renderPlot3DAsync() {
  const myGen = ++plot3dRenderGen;
  const el = document.getElementById('plot-3d');
  if (!el || app.state.view !== '3d') return;

  let THREE;
  let OrbitControls;
  let Line2;
  let LineMaterial;
  let LineGeometry;
  let CSS2DRenderer;
  let CSS2DObject;
  try {
    ({
      THREE,
      OrbitControls,
      Line2,
      LineMaterial,
      LineGeometry,
      CSS2DRenderer,
      CSS2DObject,
    } = await ensurePlot3dModules());
  } catch (err) {
    el.innerHTML = '<div class="plot-3d-empty">3D engine failed to load (CDN). Check network and refresh.</div>';
    return;
  }
  if (myGen !== plot3dRenderGen) return;

  const hasSessionCarry = app.SHOTS.some(s => s.carry != null && s.carry > 0);
  if (!hasSessionCarry) {
    disposePlot3dRuntime();
    el.innerHTML = '<div class="plot-3d-empty">No carry data in this session.</div>';
    return;
  }

  const { xr, yr, zr } = getSceneAxisBounds3D();
  const pts = app.SHOTS.filter(isVisible).filter(s => s.carry != null && s.carry > 0);
  const boundsKey = `${xr[0]},${xr[1]},${yr[0]},${yr[1]},${zr[0]},${zr[1]},${app.state.distanceUnit},${app.state.dispersionMode},${app.state.metric},${app.state.referenceSkill || ''},${app.state.clubFilter},${app.state.target ?? ''}`;
  const ptsSig = pts.map(s => s.shot).slice().sort((a, b) => a - b).join(',');

  if (
    plot3dRT &&
    plot3dRT.sessionRevision === app.state.plot3dSessionRevision &&
    plot3dRT.boundsKey === boundsKey &&
    plot3dRT.lastPtsSig === ptsSig
  ) {
    plot3dResizeRenderer(plot3dRT);
    plot3dSyncSelectionPlayback(plot3dRT);
    plot3dRT.renderer.render(plot3dRT.scene, plot3dRT.camera);
    if (plot3dRT.labelRenderer) plot3dRT.labelRenderer.render(plot3dRT.scene, plot3dRT.camera);
    return;
  }

  disposePlot3dRuntime();
  el.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;';
  el.appendChild(canvas);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1f1a);

  const w = Math.max(1, el.clientWidth || 1);
  const h = Math.max(1, el.clientHeight || 1);
  const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 5000);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(w, h);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;

  const gridGroup = plot3dBuildGrid(THREE, xr, yr, zr);
  scene.add(gridGroup);

  const overlayGroup = plot3dBuildGroundOverlays(THREE, xr, yr, zr);
  scene.add(overlayGroup);

  const labelGroup = plot3dBuildGridLabels(THREE, CSS2DObject, xr, yr, zr);
  scene.add(labelGroup);

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(w, h);
  labelRenderer.domElement.className = 'plot3d-label-layer';
  labelRenderer.domElement.style.cssText =
    'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:hidden;';
  el.appendChild(labelRenderer.domElement);

  const shotGroup = new THREE.Group();
  scene.add(shotGroup);

  const raycaster = new THREE.Raycaster();
  raycaster.params.Line = { threshold: 1.2 };

  const rt = {
    THREE,
    Line2,
    LineMaterial,
    LineGeometry,
    scene,
    camera,
    renderer,
    controls,
    shotGroup,
    gridGroup,
    overlayGroup,
    labelGroup,
    labelRenderer,
    raycaster,
    containerEl: el,
    sessionRevision: app.state.plot3dSessionRevision,
    boundsKey,
    bounds: { xr, yr, zr },
    lastPtsSig: ptsSig,
  };
  plot3dRT = rt;

  plot3dInitCamera(rt, xr, yr, zr);
  plot3dRebuildShots(rt, pts);
  plot3dSyncSelectionPlayback(rt);

  let ptrDown = null;
  function onPointerDown(e) {
    ptrDown = { x: e.clientX, y: e.clientY };
  }
  function onPointerUp(e) {
    if (!ptrDown) return;
    const d = Math.hypot(e.clientX - ptrDown.x, e.clientY - ptrDown.y);
    ptrDown = null;
    if (d > 5) return;

    const rect = canvas.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const my = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(new THREE.Vector2(mx, my), camera);
    const hits = raycaster.intersectObjects(shotGroup.children, true);
    for (let i = 0; i < hits.length; i++) {
      const shot = hits[i].object.userData.shot;
      if (shot != null) {
        selectFromChart(shot);
        break;
      }
    }
  }
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointerup', onPointerUp);
  rt._onPointerDown = onPointerDown;
  rt._onPointerUp = onPointerUp;

  function loop() {
    if (plot3dRT !== rt) return;
    if (app.state.view === '3d') {
      rt.controls.update();
      rt.renderer.render(rt.scene, rt.camera);
      if (rt.labelRenderer) rt.labelRenderer.render(rt.scene, rt.camera);
    }
    rt._raf = requestAnimationFrame(loop);
  }
  loop();
}

function renderPlot3D() {
  const el = document.getElementById('plot-3d');
  if (!el || app.state.view !== '3d') return;
  void renderPlot3DAsync();
}


function inferLmClass(s) {
  if (s.spin != null && s.spin >= 4200) return 'iron';
  if (s.clubSpeed != null && s.clubSpeed < 82) return 'iron';
  return 'driver';
}

function detailFieldStats(field) {
  const arr = app.SHOTS.map(sh => sh[field]).filter(v => v != null);
  const n = arr.length;
  if (n === 0) return { m: null, sd: null };
  const m = arr.reduce((a, b) => a + b, 0) / n;
  if (n < 2) return { m, sd: 0 };
  const sd = Math.sqrt(arr.reduce((a, v) => a + (v - m) ** 2, 0) / n);
  return { m, sd: sd || 1e-9 };
}
/** @returns {'good'|'ok'|'off'|'neutral'|'dim'} */
function detailTierZ(val, m, sd) {
  if (val == null || m == null) return 'dim';
  if (sd < 1e-6) return 'neutral';
  const z = Math.abs(val - m) / sd;
  if (z <= 0.65) return 'good';
  if (z <= 1.35) return 'ok';
  return 'off';
}
/** Value inside [gLo,gHi] → good; inside [oLo,oHi] → ok; else off */
function detailTierBand(val, band) {
  if (val == null || !band) return 'dim';
  const { gLo, gHi, oLo, oHi } = band;
  if (val >= gLo && val <= gHi) return 'good';
  if (val >= oLo && val <= oHi) return 'ok';
  return 'off';
}
/** Published-style bands for inferred club class; if missing, session z-score */
function detailTierLookupZ(s, field, st) {
  const val = s[field];
  const cls = inferLmClass(s);
  const band = LM_BENCHMARK_LOOKUP[cls][field];
  if (band && val != null) return detailTierBand(val, band);
  return detailTierZ(val, st.m, st.sd);
}
/** Ball speed vs club speed × expected smash for inferred class */
function detailTierBallSpeed(s, st) {
  if (s.ballSpeed == null) return 'dim';
  if (s.clubSpeed != null && s.clubSpeed > 0) {
    const expSmash = inferLmClass(s) === 'iron' ? 1.34 : 1.48;
    const expected = s.clubSpeed * expSmash;
    const r = s.ballSpeed / expected;
    if (r >= 0.965 && r <= 1.025) return 'good';
    if (r >= 0.9 && r <= 1.055) return 'ok';
    return 'off';
  }
  return detailTierZ(s.ballSpeed, st.m, st.sd);
}
/** Median total/carry for mapping benchmark carry → expected total */
function detailMedianTotalOverCarryRatio() {
  const ratios = app.SHOTS.map(sh => {
    if (sh.carry == null || sh.carry <= 0 || sh.total == null) return null;
    const r = sh.total / sh.carry;
    if (r < 1.01 || r > 2.2) return null;
    return r;
  }).filter(v => v != null);
  if (!ratios.length) return 1.14;
  ratios.sort((a, b) => a - b);
  return ratios[Math.floor(ratios.length / 2)];
}
/** Per-shot benchmark: that shot’s club + global skill; else session max carry/total */
function detailDistanceTargetsForShot(s) {
  const ref = getReferenceDistanceM(s.club);
  const carries = app.SHOTS.map(sh => sh.carry).filter(v => v != null);
  const totals = app.SHOTS.map(sh => sh.total).filter(v => v != null);
  if (ref != null && ref > 0) {
    const R = detailMedianTotalOverCarryRatio();
    return { carryTarget: ref, totalTarget: ref * R };
  }
  return {
    carryTarget: carries.length ? Math.max(...carries) : null,
    totalTarget: totals.length ? Math.max(...totals) : null,
  };
}
function detailTierVsTarget(val, target) {
  if (val == null || target == null || target <= 0) return 'dim';
  const dev = Math.abs(val - target) / target;
  if (dev <= 0.05) return 'good';
  if (dev <= 0.12) return 'ok';
  return 'off';
}
const DETAIL_TIER_BADNESS = { good: 0, ok: 1, neutral: 2, off: 3, dim: 4 };
function detailPickWorseTier(a, b) {
  return (DETAIL_TIER_BADNESS[b] > DETAIL_TIER_BADNESS[a]) ? b : a;
}
/** One tier for both Carry and Total: vs benchmark (or session-best), take worse of the two */
function detailTierCarryAndTotal(s) {
  const { carryTarget, totalTarget } = detailDistanceTargetsForShot(s);
  const tc = detailTierVsTarget(s.carry, carryTarget);
  const tt = detailTierVsTarget(s.total, totalTarget);
  if (tc === 'dim' && tt === 'dim') return 'dim';
  if (tc === 'dim') return tt;
  if (tt === 'dim') return tc;
  return detailPickWorseTier(tc, tt);
}
function detailTierMag(val, goodMax, okMax) {
  if (val == null) return 'dim';
  const a = Math.abs(val);
  if (a <= goodMax) return 'good';
  if (a <= okMax) return 'ok';
  return 'off';
}
function detailValueClass(tier, displayVal) {
  if (displayVal === '—') return 'dim';
  if (tier === 'dim' || tier === 'neutral') return tier === 'dim' ? 'dim' : '';
  return `detail-v--${tier}`;
}
/** Tier styling on shot-detail rows/cards (reuses .detail-v--*) */
function detailTierClass(tier, displayVal, baseClass) {
  if (displayVal === '—') return `${baseClass} dim`;
  if (tier === 'dim' || tier === 'neutral') return tier === 'dim' ? `${baseClass} dim` : baseClass;
  return `${baseClass} detail-v--${tier}`;
}
/**
 * Spin-axis slider position (2–98, center = 50).
 * Trackman notes ~−2°…+2° reads as straight; small |°| differences matter more per degree than huge misses.
 * Signed asinh: nearly linear near 0°, compresses large |°| (log-like, no singularity at 0).
 */
function spinAxisSliderPct(degrees) {
  const ASINH_SCALE = 7;
  const EDGE_REF = 48;
  const t = Math.asinh(degrees / ASINH_SCALE);
  const tEdge = Math.asinh(EDGE_REF / ASINH_SCALE);
  let pct = 50 + 50 * (t / tEdge);
  return Math.max(2, Math.min(98, pct));
}

// ----- Detail panel
function renderDetail() {
  const panel = document.getElementById('detail-panel');
  if (app.state.selectedShots.size === 0) {
    panel.innerHTML = '<div class="detail-empty">Tap a shot in the list or on a chart<br>to inspect.</div>';
    return;
  }
  if (app.state.selectedShots.size > 1) {
    panel.innerHTML = `<div class="detail-empty">${app.state.selectedShots.size} shots selected<br><span style="font-size:12px;color:var(--muted)">Click one row without Shift to inspect a single shot.</span></div>`;
    return;
  }
  const onlyShot = [...app.state.selectedShots][0];
  const s = app.SHOTS.find(x => x.shot === onlyShot);
  if (!s) { panel.innerHTML = '<div class="detail-empty">Shot not found</div>'; return; }
  const m = meta(s.shot);
  const side = s.totalSide;
  const sideStr = side == null ? '—' : `${fmtLen(Math.abs(side), 1)} ${side<0?'left':'right'}`;
  const flightTag = s.curve == null ? 'straight'
    : s.curve < -8 ? 'big draw / pull' : s.curve < -2 ? 'draw' : s.curve > 8 ? 'big fade / push' : s.curve > 2 ? 'fade' : 'straight';

  const stBall = detailFieldStats('ballSpeed');
  const stClub = detailFieldStats('clubSpeed');
  const stSmash = detailFieldStats('smash');
  const stSpin = detailFieldStats('spin');
  const stLaunch = detailFieldStats('launchAng');
  const stHt = detailFieldStats('height');
  const stLand = detailFieldStats('landingAng');

  const distTier = detailTierCarryAndTotal(s);
  const ballTier = detailTierBallSpeed(s, stBall);
  const clubSpdTier = detailTierZ(s.clubSpeed, stClub.m, stClub.sd);
  const smashTier = detailTierLookupZ(s, 'smash', stSmash);
  const launchTier = detailTierLookupZ(s, 'launchAng', stLaunch);
  const apexTier = detailTierLookupZ(s, 'height', stHt);
  const landTier = detailTierLookupZ(s, 'landingAng', stLand);
  const spinRTier = detailTierLookupZ(s, 'spin', stSpin);
  const pathTier = detailTierMag(s.clubPath, 5, 12);

  const vBall = s.ballSpeed == null ? '—' : `${fmt(s.ballSpeed, 1)} mph`;
  const vClubSpd = s.clubSpeed == null ? '—' : `${fmt(s.clubSpeed, 1)} mph`;
  const vSmash = fmt(s.smash, 2);

  const shapeBorder = side == null ? 'var(--accent)' : side < 0 ? 'var(--left)' : side > 5 ? 'var(--right)' : 'var(--good)';
  const shapeMainColor = side == null ? 'var(--chalk-dim)' : side < 0 ? 'var(--left)' : side > 5 ? 'var(--right)' : 'var(--good)';

  const spinAxisTxt = s.spinAxis == null ? '—' : `${fmt(s.spinAxis, 1, '°')}${s.spinAxis < 0 ? ' (left)' : s.spinAxis > 0 ? ' (right)' : ''}`;
  let spinAxisValClass = 'shot-detail-spin-value dim';
  if (s.spinAxis != null) {
    if (s.spinAxis < 0) spinAxisValClass = 'shot-detail-spin-value shot-detail-spin-value--L';
    else if (s.spinAxis > 0) spinAxisValClass = 'shot-detail-spin-value shot-detail-spin-value--R';
    else spinAxisValClass = 'shot-detail-spin-value shot-detail-spin-value--mid';
  }
  let axisPct = 50;
  if (s.spinAxis != null) axisPct = spinAxisSliderPct(s.spinAxis);

  const headerTitle = `Shot ${String(s.shot).padStart(2, '0')}` + (s.club ? ` · ${escapeHtml(s.club)}` : '');
  const curveSub = s.curve == null ? 'Curve —' : `Curve ${fmtLen(s.curve, 1)}`;

  const row = (label, val, tier) => {
    const vc = detailTierClass(tier, val, 'shot-detail-row-v');
    return `<div class="shot-detail-row"><span class="shot-detail-row-k">${label}</span><span class="${vc}">${val}</span></div>`;
  };

  panel.innerHTML = `
    <div class="shot-detail-view">
      <div class="shot-detail-header">
        <div>
          <div class="shot-detail-eyebrow">${headerTitle}</div>
          <div class="shot-detail-total">${fmtLen(s.total, 1)}<small>total</small></div>
        </div>
        <button type="button" class="pill shot-detail-hide ${m.hidden ? 'active' : ''}" id="detail-hide">${m.hidden ? 'Hidden' : 'Hide'}</button>
      </div>
      <div class="shot-detail-shape" style="border-left-color:${shapeBorder}">
        <div class="shot-detail-shape-main" style="color:${shapeMainColor}">${sideStr} · ${flightTag}</div>
        <div class="shot-detail-shape-sub">${curveSub}</div>
      </div>
      <div class="shot-detail-section">
        <h3 class="shot-detail-section-title">Speed &amp; strike</h3>
        <div class="shot-detail-metric-cards">
          <div class="shot-detail-card">
            <div class="shot-detail-card-label">Ball</div>
            <div class="${detailTierClass(ballTier, vBall, 'shot-detail-card-val')}">${vBall}</div>
          </div>
          <div class="shot-detail-card">
            <div class="shot-detail-card-label">Club</div>
            <div class="${detailTierClass(clubSpdTier, vClubSpd, 'shot-detail-card-val')}">${vClubSpd}</div>
          </div>
          <div class="shot-detail-card">
            <div class="shot-detail-card-label">Smash</div>
            <div class="${detailTierClass(smashTier, vSmash, 'shot-detail-card-val')}">${vSmash}</div>
          </div>
        </div>
      </div>
      <div class="shot-detail-section">
        <div class="shot-detail-spin-head">
          <h3 class="shot-detail-section-title" style="margin:0">Spin axis</h3>
          <span class="${spinAxisValClass}">${spinAxisTxt}</span>
        </div>
        <div class="spin-axis-track" aria-hidden="true">
          ${s.spinAxis != null ? `<span class="spin-axis-dot" style="left:${axisPct}%"></span>` : ''}
        </div>
      </div>
      <div class="shot-detail-section">
        <h3 class="shot-detail-section-title">Flight &amp; path</h3>
        <div class="shot-detail-rows">
          ${row('Carry', fmtLen(s.carry, 1), distTier)}
          ${row('Apex', fmtLen(s.height, 1), apexTier)}
          ${row('Launch angle', fmt(s.launchAng, 1, '°'), launchTier)}
          ${row('Land angle', fmt(s.landingAng, 1, '°'), landTier)}
          ${row('Spin rate', s.spin == null ? '—' : `${Math.round(s.spin)} rpm`, spinRTier)}
          ${row('Club path', fmt(s.clubPath, 1, '°'), pathTier)}
        </div>
      </div>
    </div>
  `;
  document.getElementById('detail-hide').addEventListener('click', () => {
    meta(s.shot).hidden = !meta(s.shot).hidden;
    renderAll();
  });
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

// ----- Shot table
function renderShotTable() {
  const table = document.getElementById('shot-table');
  if (!table) return;
  const multiClub = uniqueClubsInShots().length > 1;
  const cols = [
    { k: 'vis', label: '', sortable: false },
    { k: 'shot', label: '#' },
    ...(multiClub ? [{ k: 'club', label: 'Club', thClass: 'shot-table-club' }] : []),
    { k: 'carry', label: 'Cry' },
    { k: 'total', label: 'Tot' },
    { k: 'ballSpeed', label: 'Ball', title: 'Ball speed (mph)' },
    { k: 'clubSpeed', label: 'C spd', title: 'Club speed (mph)' },
    { k: 'totalSide', label: 'Side' },
  ];
  const sorted = getSortedShotsTable();

  const head = '<thead><tr>' + cols.map(c => {
    const sorted = app.state.sortKey === c.k;
    const arrow = sorted ? (app.state.sortDir === 'asc' ? '↑' : '↓') : '';
    const t = c.title ? ` title="${c.title.replace(/"/g, '&quot;')}"` : '';
    const thExtra = c.thClass ? ` ${c.thClass}` : '';
    return `<th class="${sorted?'sorted':''}${thExtra}" data-arrow="${arrow}" data-sort="${c.k}"${t}>${c.label}</th>`;
  }).join('') + '</tr></thead>';

  const sideHtml = (v) => {
    if (v == null) return '<span style="color:var(--muted)">—</span>';
    const cls = Math.abs(v) <= 5 ? 'side-good' : v < 0 ? 'side-l' : 'side-r';
    return `<span class="${cls}">${fmtLen(Math.abs(v), 1)}${v<0?'L':v>0?'R':''}</span>`;
  };

  const body = '<tbody>' + sorted.map(s => {
    const m = meta(s.shot);
    const trClass = (m.hidden ? 'hidden-row' : '') + (app.state.selectedShots.has(s.shot) ? ' selected-row' : '');
    const clubCell = multiClub ? `<td class="shot-table-club" title="${escapeHtml(s.club || '')}">${escapeHtml(clubShorthand(s.club))}</td>` : '';
    return `<tr class="${trClass}" data-shot="${s.shot}">
      <td><input type="checkbox" class="row-vis" ${m.hidden?'':'checked'} data-shot="${s.shot}" /></td>
      <td>${s.shot}</td>
      ${clubCell}
      <td>${fmtLen(s.carry, 1)}</td>
      <td>${fmtLen(s.total, 1)}</td>
      <td>${fmt(s.ballSpeed, 1)}</td>
      <td>${fmt(s.clubSpeed, 1)}</td>
      <td>${sideHtml(s.totalSide)}</td>
    </tr>`;
  }).join('') + '</tbody>';

  table.innerHTML = head + body;

  // Column sort
  table.querySelectorAll('th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const k = th.dataset.sort;
      if (k === 'vis') return;
      if (app.state.sortKey === k) app.state.sortDir = app.state.sortDir === 'asc' ? 'desc' : 'asc';
      else { app.state.sortKey = k; app.state.sortDir = 'asc'; }
      renderShotTable();
    });
  });
  // Visibility checkbox
  table.querySelectorAll('.row-vis').forEach(cb => {
    cb.addEventListener('click', e => e.stopPropagation());
    cb.addEventListener('dblclick', (e) => {
      e.preventDefault();
      e.stopPropagation();
      meta(parseInt(e.target.dataset.shot)).hidden = !meta(parseInt(e.target.dataset.shot)).hidden;
      renderAll();
    });
    cb.addEventListener('change', e => {
      meta(parseInt(e.target.dataset.shot)).hidden = !e.target.checked;
      renderAll();
    });
  });
  table.querySelectorAll('tbody tr').forEach(tr => {
    const n = parseInt(tr.dataset.shot);
    tr.addEventListener('click', (e) => {
      handleTableRowClick(n, e);
      requestAnimationFrame(() => {
        const wrap = document.getElementById('shot-table-wrap');
        if (wrap) wrap.focus({ preventScroll: true });
      });
    });
    tr.addEventListener('mouseenter', () => setHover(n));
    tr.addEventListener('mouseleave', () => setHover(null));
  });

  const visCount = app.SHOTS.filter(isVisible).length;
  document.getElementById('table-summary').textContent =
    `${visCount}/${app.SHOTS.length} visible`;
}

function syncClubFilterPills() {
  const wrap = document.getElementById('club-filter-wrap');
  const pills = document.getElementById('club-pills');
  if (!wrap || !pills) return;
  const clubs = uniqueClubsInShots();
  if (clubs.length <= 1) {
    wrap.hidden = true;
    app.state.clubFilter = 'all';
    return;
  }
  wrap.hidden = false;
  if (app.state.clubFilter !== 'all' && !clubs.includes(app.state.clubFilter)) app.state.clubFilter = 'all';
  pills.innerHTML = '<button type="button" class="pill' + (app.state.clubFilter === 'all' ? ' active' : '') + '" data-club="all">All</button>' +
    clubs.map(c => {
      const enc = encodeURIComponent(c);
      const active = app.state.clubFilter === c ? ' active' : '';
      const sh = clubShorthand(c);
      const tip = escapeHtml(c);
      return `<button type="button" class="pill pill-club${active}" data-club="${enc}" title="${tip}">${escapeHtml(sh)}</button>`;
    }).join('');
}

// ----- Tabs
function setView(v) {
  app.state.view = v;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === v));
  document.querySelectorAll('.view').forEach(el => el.classList.toggle('active', el.id === 'view-' + v));
  const hp = document.getElementById('histogram-panel');
  if (hp) hp.hidden = v !== 'distance';
  renderAll();
}

function selectFromChart(n) {
  app.state.selectedShots = new Set([n]);
  app.state.selectionAnchorShot = n;
  renderAll();
}

function navigateShotTable(delta) {
  const sorted = getSortedShotsTable();
  if (!sorted.length) return;
  let idx = -1;
  if (app.state.selectedShots.size === 1) {
    const only = [...app.state.selectedShots][0];
    idx = sorted.findIndex(s => s.shot === only);
  }
  if (idx < 0) {
    idx = delta > 0 ? 0 : sorted.length - 1;
  } else {
    idx += delta;
    if (idx < 0) idx = 0;
    if (idx >= sorted.length) idx = sorted.length - 1;
  }
  const n = sorted[idx].shot;
  app.state.selectedShots = new Set([n]);
  app.state.selectionAnchorShot = n;
  renderAll();
  requestAnimationFrame(() => {
    const tr = document.querySelector(`#shot-table tbody tr[data-shot="${n}"]`);
    if (tr) tr.scrollIntoView({ block: 'nearest' });
    const wrap = document.getElementById('shot-table-wrap');
    if (wrap) wrap.focus({ preventScroll: true });
  });
}

function handleTableRowClick(n, e) {
  if (e.detail === 2) {
    meta(n).hidden = !meta(n).hidden;
    renderAll();
    return;
  }
  if (e.shiftKey) {
    if (app.state.selectionAnchorShot == null) {
      app.state.selectedShots = new Set([n]);
      app.state.selectionAnchorShot = n;
      renderAll();
      return;
    }
    const sorted = getSortedShotsTable();
    const i = sorted.findIndex(s => s.shot === n);
    const a = sorted.findIndex(s => s.shot === app.state.selectionAnchorShot);
    if (i < 0 || a < 0) return;
    const lo = Math.min(a, i), hi = Math.max(a, i);
    app.state.selectedShots = new Set(sorted.slice(lo, hi + 1).map(s => s.shot));
    renderAll();
    return;
  }
  if (app.state.selectedShots.size === 1 && app.state.selectedShots.has(n)) {
    app.state.selectedShots = new Set();
    app.state.selectionAnchorShot = null;
  } else {
    app.state.selectedShots = new Set([n]);
    app.state.selectionAnchorShot = n;
  }
  renderAll();
}

// Hover updates only the dot and table row classes — no full re-render
function setHover(n) {
  if (app.state.hovered === n) return;
  app.state.hovered = n;
  // Update chart dots
  document.querySelectorAll('.shot-dot').forEach(el => {
    el.classList.toggle('row-hover', parseInt(el.dataset.shot) === n);
  });
  // Update table rows
  document.querySelectorAll('#shot-table tbody tr').forEach(tr => {
    tr.classList.toggle('row-hover', parseInt(tr.dataset.shot) === n);
  });
}

function renderAll() {
  renderStats();
  if (app.state.view === 'dispersion') renderDispersion();
  if (app.state.view === 'distance') { renderSpeedChart(); renderHistogram(); }
  if (app.state.view === 'diagnostics') renderSpinChart();
  if (app.state.view === '3d') renderPlot3D();
  renderShotTable();
  syncClubFilterPills();
  renderDetail();
  updateDistanceUnitUI();
}

// ----- Wire up
document.getElementById('shot-table-wrap').addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
  e.preventDefault();
  navigateShotTable(e.key === 'ArrowDown' ? 1 : -1);
});

document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => setView(t.dataset.view)));
document.querySelectorAll('#dist-pills .pill').forEach(p => p.addEventListener('click', () => {
  document.querySelectorAll('#dist-pills .pill').forEach(x => x.classList.remove('active'));
  p.classList.add('active');
  app.state.distFilter = p.dataset.dist;
  syncHiddenToFilters();
  renderAll();
}));
document.querySelectorAll('#side-pills .pill').forEach(p => p.addEventListener('click', () => {
  document.querySelectorAll('#side-pills .pill').forEach(x => x.classList.remove('active'));
  p.classList.add('active');
  app.state.sideFilter = p.dataset.side;
  syncHiddenToFilters();
  renderAll();
}));
document.getElementById('club-filter-wrap')?.addEventListener('click', (e) => {
  const btn = e.target.closest('#club-pills .pill');
  if (!btn) return;
  const raw = btn.dataset.club;
  app.state.clubFilter = raw === 'all' ? 'all' : decodeURIComponent(raw);
  syncHiddenToFilters();
  pruneSelectionToClubFilter();
  renderAll();
});

// Target distance input (stored in meters; field shows current unit)
document.getElementById('target-input').addEventListener('input', e => {
  const v = parseFloat(e.target.value);
  if (isNaN(v) || v <= 0) {
    app.state.target = null;
    renderAll();
    return;
  }
  app.state.target = app.state.distanceUnit === 'yds' ? v * YDS_TO_M : v;
  renderAll();
});

// Show/hide all
document.getElementById('show-all-btn').addEventListener('click', () => {
  Object.values(app.shotMeta).forEach(m => m.hidden = false);
  renderAll();
});
document.getElementById('hide-all-btn').addEventListener('click', () => {
  app.SHOTS.forEach(s => meta(s.shot).hidden = true);
  renderAll();
});

// Carry / Total metric toggle
document.querySelectorAll('#metric-toggle button').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('#metric-toggle button').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    app.state.metric = b.dataset.metric;
    renderAll();
  });
});

// 1:1 (equal m/px) vs Fill (independent axis stretch)
document.querySelectorAll('#scale-toggle button').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('#scale-toggle button').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    app.state.equalAxisScale = b.dataset.scale === 'equal';
    renderAll();
  });
});

document.querySelectorAll('#dispersion-mode-toggle button').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('#dispersion-mode-toggle button').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    app.state.dispersionMode = b.dataset.mode;
    renderAll();
  });
});

document.querySelectorAll('#unit-toggle button').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('#unit-toggle button').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    app.state.distanceUnit = b.dataset.unit;
    try { localStorage.setItem('golf-distance-unit', app.state.distanceUnit); } catch (err) {}
    syncTargetInput();
    renderAll();
  });
});

// ----- Upload handling
function showError(msg) {
  const existing = document.querySelector('.error-toast');
  if (existing) existing.remove();
  const el = document.createElement('div');
  el.className = 'error-toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 5000);
}

function loadShots(newShots, fileName) {
  app.SHOTS = newShots;
  app.state.plot3dSessionRevision++;
  disposePlot3dRuntime();
  app.state.distFilter = 'all';
  app.state.sideFilter = 'all';
  app.state.clubFilter = 'all';
  document.querySelectorAll('#dist-pills .pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.dist === 'all');
  });
  document.querySelectorAll('#side-pills .pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.side === 'all');
  });
  app.shotMeta = {};
  syncHiddenToFilters();
  selectFirstShot();
  document.getElementById('shot-count').textContent = app.SHOTS.length + ' shots';
  document.getElementById('file-name').textContent = fileName;
  syncTargetInput();
  renderAll();
}

let pendingImportParts = [];

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}

/**
 * Guess club from CSV filename (Trackman-style tokens: 7i, 3w, 4h, dr, pw, sw, 56, 60, …).
 * Returns a key in CLUB_REFERENCE_YDS or null.
 */
function inferClubFromFileName(fileName) {
  const base = fileName.replace(/^.*[/\\]/, '').replace(/\.[^/.]+$/i, '');
  const s = base.toLowerCase().replace(/[-_.]+/g, ' ');

  const loft56 = /(?:^|[^0-9])(56)(?:[^0-9]|$)/.test(s);
  const loft60 = /(?:^|[^0-9])(60)(?:[^0-9]|$)/.test(s);
  if (loft56 && loft60) {
    return s.indexOf('56') <= s.indexOf('60') ? 'Sand Wedge / 56°' : 'Lob Wedge / 60°';
  }
  if (loft56) return 'Sand Wedge / 56°';
  if (loft60) return 'Lob Wedge / 60°';

  if (/\bpw\b/.test(s) || /pitch(?:ing)?\s+wedge/.test(s)) return 'Pitching Wedge / 46°';
  if (/\bsw\b/.test(s) || /sand\s+wedge/.test(s)) return 'Sand Wedge / 56°';

  let m = s.match(/(?:^|[^a-z0-9])([2-9])\s*i(?:[^a-z]|$)/i);
  if (!m) m = s.match(/([2-9])\s*-?\s*iron\b/);
  if (m) {
    const k = `${m[1]}-iron`;
    if (CLUB_REFERENCE_YDS[k]) return k;
  }

  m = s.match(/(?:^|[^a-z0-9])(\d{1,2})\s*w(?:[^a-z]|$)/i);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n <= 4) return '3-wood';
    return '5-wood';
  }
  m = s.match(/(?:^|[^a-z0-9])(\d{1,2})\s*-?\s*(?:wood|woods)\b/);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n <= 4) return '3-wood';
    return '5-wood';
  }

  m = s.match(/(?:^|[^a-z0-9])(\d{1,2})\s*h(?:[^a-z]|$)/i);
  if (m) return 'Hybrid';
  if (/\butility\b|\bhybrid\b/.test(s)) return 'Hybrid';

  if (/\bdriver\b|\bdvr\b|\bdr\b/.test(s)) return 'Driver';

  return null;
}

function renderImportPanel() {
  const host = document.getElementById('csv-import-rows');
  if (!host) return;
  host.innerHTML = '';
  pendingImportParts.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'csv-import-row';
    const name = document.createElement('span');
    name.className = 'csv-import-name';
    name.textContent = p.name;
    const sel = document.createElement('select');
    sel.className = 'ctrl-select import-club';
    sel.dataset.i = String(i);
    const guess = inferClubFromFileName(p.name);
    const defaultClub = guess && CLUB_REFERENCE_YDS[guess] ? guess : 'Driver';
    Object.keys(CLUB_REFERENCE_YDS).forEach(k => {
      const o = document.createElement('option');
      o.value = k;
      o.textContent = k;
      if (k === defaultClub) o.selected = true;
      sel.appendChild(o);
    });
    row.appendChild(name);
    row.appendChild(sel);
    host.appendChild(row);
  });
}

function hideImportPanel() {
  const panel = document.getElementById('csv-import-panel');
  if (panel) panel.hidden = true;
  pendingImportParts = [];
}

async function prepareImportQueue(files) {
  const csvFiles = Array.from(files).filter(f => /\.csv$/i.test(f.name) || f.type === 'text/csv');
  if (!csvFiles.length) {
    showError('Please choose .csv files');
    return;
  }
  try {
    const parts = [];
    for (const f of csvFiles) {
      parts.push({ name: f.name, text: await readFileAsText(f) });
    }
    pendingImportParts = parts;
    renderImportPanel();
    const panel = document.getElementById('csv-import-panel');
    if (panel) panel.hidden = false;
  } catch (err) {
    showError('Failed to read file');
  }
}

function commitCsvImport() {
  const merged = [];
  let nextShot = 1;
  const names = [];
  for (let i = 0; i < pendingImportParts.length; i++) {
    const sel = document.querySelector(`select.import-club[data-i="${i}"]`);
    const club = sel?.value || 'Driver';
    let shots;
    try {
      shots = parseCSV(pendingImportParts[i].text);
    } catch (err) {
      showError(pendingImportParts[i].name + ': ' + err.message);
      return;
    }
    names.push(pendingImportParts[i].name);
    for (const row of shots) {
      merged.push({ ...row, shot: nextShot++, club });
    }
  }
  const label = names.length === 1 ? names[0] : `${names.length} files · ${names.join(', ')}`;
  loadShots(merged, label);
  hideImportPanel();
}

document.getElementById('file-input').addEventListener('change', e => {
  const files = Array.from(e.target.files || []);
  e.target.value = '';
  if (files.length) prepareImportQueue(files);
});

document.getElementById('csv-import-commit')?.addEventListener('click', () => commitCsvImport());
document.getElementById('csv-import-cancel')?.addEventListener('click', () => {
  hideImportPanel();
});

// Drag-and-drop on whole window
const dropOverlay = document.getElementById('drop-overlay');
let dragCounter = 0;
window.addEventListener('dragenter', e => {
  e.preventDefault();
  if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) {
    dragCounter++;
    dropOverlay.classList.add('active');
  }
});
window.addEventListener('dragleave', e => {
  e.preventDefault();
  dragCounter--;
  if (dragCounter <= 0) { dragCounter = 0; dropOverlay.classList.remove('active'); }
});
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop', e => {
  e.preventDefault();
  dragCounter = 0;
  dropOverlay.classList.remove('active');
  const list = e.dataTransfer.files;
  if (list && list.length) prepareImportQueue(list);
});

function initReferenceControls() {
  const skillSel = document.getElementById('reference-skill');
  if (!skillSel) return;
  skillSel.innerHTML = '';
  const s0 = document.createElement('option');
  s0.value = '';
  s0.textContent = '—';
  skillSel.appendChild(s0);
  SKILL_LEVELS.forEach(s => {
    const o = document.createElement('option');
    o.value = s;
    o.textContent = s;
    skillSel.appendChild(o);
  });
  skillSel.value = app.state.referenceSkill || '';
  skillSel.addEventListener('change', () => {
    app.state.referenceSkill = skillSel.value || '';
    renderAll();
  });
}

function ensureShotClubs() {
  app.SHOTS = app.SHOTS.map(s => ({ ...s, club: s.club || 'Driver' }));
}

initReferenceControls();
ensureShotClubs();
syncTargetInput();
selectFirstShot();
renderAll();

let dispersionResizeTimer;
if (typeof ResizeObserver !== 'undefined') {
  const wrap = document.querySelector('.dispersion-chart-svg-wrap');
  if (wrap) {
    new ResizeObserver(() => {
      if (app.state.view !== 'dispersion') return;
      clearTimeout(dispersionResizeTimer);
      dispersionResizeTimer = setTimeout(() => renderDispersion(), 80);
    }).observe(wrap);
  }
}

let speedResizeTimer;
if (typeof ResizeObserver !== 'undefined') {
  const speedWrap = document.querySelector('.speed-chart-svg-wrap');
  if (speedWrap) {
    new ResizeObserver(() => {
      if (app.state.view !== 'distance') return;
      clearTimeout(speedResizeTimer);
      speedResizeTimer = setTimeout(() => renderSpeedChart(), 80);
    }).observe(speedWrap);
  }
}

let spinResizeTimer;
if (typeof ResizeObserver !== 'undefined') {
  const spinWrap = document.querySelector('.spin-chart-svg-wrap');
  if (spinWrap) {
    new ResizeObserver(() => {
      if (app.state.view !== 'diagnostics') return;
      clearTimeout(spinResizeTimer);
      spinResizeTimer = setTimeout(() => renderSpinChart(), 80);
    }).observe(spinWrap);
  }
}

let plot3dResizeTimer;
if (typeof ResizeObserver !== 'undefined') {
  const plot3dWrap = document.querySelector('.plot-3d-wrap');
  if (plot3dWrap) {
    new ResizeObserver(() => {
      if (app.state.view !== '3d') return;
      clearTimeout(plot3dResizeTimer);
      plot3dResizeTimer = setTimeout(() => {
        if (plot3dRT && plot3dRT.renderer) plot3dResizeRenderer(plot3dRT);
      }, 80);
    }).observe(plot3dWrap);
  }
}