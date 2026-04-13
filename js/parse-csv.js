export function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error('CSV appears to be empty');
  const headers = lines[0].split(',').map(h => h.trim());
  const norm = s => s.toLowerCase().replace(/[\s().#]/g, '').replace(/(mph|rpm|deg|mm)$/, '');
  const idx = {};
  const aliases = {
    shot: ['shot', 'no'],
    targetCarry: ['targethitcarry'],
    targetTotal: ['targethittotal'],
    carry: ['carry', 'carrym'],
    total: ['total', 'totalm'],
    clubSpeed: ['clubspeed'],
    ballSpeed: ['bspeed', 'ballspeed'],
    smash: ['smashfactor', 'smash'],
    spin: ['spinrate', 'spin'],
    spinAxis: ['spinaxis'],
    landingAng: ['landingang', 'landangle', 'landingangle'],
    curve: ['curve', 'curvem'],
    attackAng: ['attackangle'],
    faceToPath: ['facetopath'],
    clubPath: ['clubpath'],
    faceAngle: ['faceangle'],
    launchAng: ['lang', 'launchangle', 'launchang'],
    launchDir: ['ldir', 'launchdir', 'launchdirection'],
    height: ['height', 'heightm', 'apex'],
    carrySide: ['carrys', 'carryside', 'carrysm'],
    totalSide: ['tots', 'totalside', 'totsm'],
  };
  headers.forEach((h, i) => {
    const n = norm(h);
    for (const [key, alts] of Object.entries(aliases)) {
      if (alts.includes(n) && idx[key] == null) idx[key] = i;
    }
  });
  if (idx.carry == null && idx.total == null) {
    throw new Error('Could not find Carry or Total distance columns. Expected Trackman/Garmin export format.');
  }
  const parseSide = s => {
    if (!s || s === '-' || s === '') return null;
    const m = String(s).trim().match(/^(-?[\d.]+)([LR])?$/i);
    if (!m) return null;
    const v = parseFloat(m[1]);
    if (isNaN(v)) return null;
    if (!m[2]) return v;
    return m[2].toUpperCase() === 'L' ? -Math.abs(v) : Math.abs(v);
  };
  const parseNum = s => {
    if (!s || s === '-' || s === '') return null;
    const v = parseFloat(String(s).replace(/[^\d.\-]/g, ''));
    return isNaN(v) ? null : v;
  };
  const get = (cols, key, fn) => idx[key] != null ? fn(cols[idx[key]]) : null;
  const result = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim());
    const rawShot = cols[idx.shot != null ? idx.shot : 0];
    if (!rawShot || /^(avg|average|total)$/i.test(rawShot)) continue;
    const shotNum = parseInt(rawShot);
    if (isNaN(shotNum)) continue;
    result.push({
      shot: shotNum,
      targetCarry: get(cols, 'targetCarry', s => s === 'Yes'),
      targetTotal: get(cols, 'targetTotal', s => s === 'Yes'),
      carry: get(cols, 'carry', parseNum),
      total: get(cols, 'total', parseNum),
      clubSpeed: get(cols, 'clubSpeed', parseNum),
      ballSpeed: get(cols, 'ballSpeed', parseNum),
      smash: get(cols, 'smash', parseNum),
      spin: get(cols, 'spin', parseNum),
      spinAxis: get(cols, 'spinAxis', parseNum),
      landingAng: get(cols, 'landingAng', parseNum),
      curve: get(cols, 'curve', parseSide),
      attackAng: get(cols, 'attackAng', parseNum),
      faceToPath: get(cols, 'faceToPath', parseNum),
      clubPath: get(cols, 'clubPath', parseNum),
      faceAngle: get(cols, 'faceAngle', parseNum),
      launchAng: get(cols, 'launchAng', parseNum),
      launchDir: get(cols, 'launchDir', parseSide),
      height: get(cols, 'height', parseNum),
      carrySide: get(cols, 'carrySide', parseSide),
      totalSide: get(cols, 'totalSide', parseSide),
    });
  }
  if (!result.length) throw new Error('No valid shot rows found in CSV');
  return result;
}
