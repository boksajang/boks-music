import {interpolateAnalysisFrame} from './video-composition.mjs';

/**
 * Canvas scenes for GPU rendering. A scene draws one frame for a given time on a 2D canvas, so the
 * same code drives the editor preview and the WebCodecs renderer (no screenshots). Layout follows the
 * HTML templates' proportions: `u` is the short side of the frame.
 */
export const CANVAS_SCENES = Object.freeze(['cinematic']);
const FONT = '"Malgun Gothic","Apple SD Gothic Neo",sans-serif';
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const stamp = n => `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, '0')}`;
const layer = (w, h) => (typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(Math.max(1, Math.ceil(w)), Math.max(1, Math.ceil(h))) : Object.assign(document.createElement('canvas'), { width: Math.max(1, Math.ceil(w)), height: Math.max(1, Math.ceil(h)) }));

/** Decodes the packed analysis produced by the renderer (same format as the HTML scene). */
export function unpackAnalysis(item) {
  if (item?.encoding !== 'u8-bins-i8-wave') return item || null;
  const binary = atob(item.data || '');
  if (binary.length !== item.frameCount * 192) throw Error('Audio analysis size mismatch');
  return { ...item, data: undefined, packed: Uint8Array.from(binary, char => char.charCodeAt(0)) };
}

// Wraps text like CSS `word-break: keep-all; overflow-wrap: anywhere`: break at spaces, split a word only if it alone overflows.
function wrap(ctx, text, maxWidth) {
  const lines = []; let line = '';
  for (const word of String(text).split(/\s+/).filter(Boolean)) {
    const candidate = line ? line + ' ' + word : word;
    if (ctx.measureText(candidate).width <= maxWidth) { line = candidate; continue; }
    if (line) lines.push(line);
    if (ctx.measureText(word).width <= maxWidth) { line = word; continue; }
    line = '';
    for (const char of word) { if (ctx.measureText(line + char).width > maxWidth && line) { lines.push(line); line = char; } else line += char; }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}
// Shrinks like the HTML scene: 5% steps until the wrapped block fits the box, down to a floor.
function fitText(ctx, text, { size, minSize, weight, lineHeight, maxWidth, maxHeight, spacing = 0 }) {
  let font = size, lines;
  for (;;) {
    ctx.font = `${weight} ${font}px ${FONT}`; ctx.letterSpacing = `${spacing * font}px`;
    lines = wrap(ctx, text, maxWidth);
    if (lines.length * font * lineHeight <= maxHeight + 1 || font <= minSize) break;
    font *= .95;
  }
  return { font, lines, height: lines.length * font * lineHeight };
}
function setFont(ctx, weight, size, spacing = 0) { ctx.font = `${weight} ${size}px ${FONT}`; ctx.letterSpacing = `${spacing * size}px`; }
function ellipsize(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let value = text;
  while (value && ctx.measureText(value + '…').width > maxWidth) value = value.slice(0, -1);
  return value + '…';
}
function drawCover(ctx, image, x, y, w, h) {
  const iw = image.width, ih = image.height, scale = Math.max(w / iw, h / ih), sw = w / scale, sh = h / scale;
  ctx.drawImage(image, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
}
// CSS `radial-gradient(ellipse at cx cy, ...)` with the default farthest-corner size.
function ellipseGradient(ctx, w, h, cx, cy, stops) {
  const rx = Math.max(cx, w - cx) * Math.SQRT2, ry = Math.max(cy, h - cy) * Math.SQRT2;
  ctx.save(); ctx.translate(cx, cy); ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  for (const [offset, color] of stops) g.addColorStop(offset, color);
  ctx.fillStyle = g; ctx.fillRect(-cx, -cy * rx / ry, w, h * rx / ry); ctx.restore();
}

/** Spectrum geometry matching video-spectrum.mjs (SVG), drawn directly in pixels. */
export function drawSpectrum(ctx, { kind = 'bars', bins = [], waveform = [], color = 'mono', x, y, width: w, height: h }) {
  const b = bins.map(v => clamp(Number(v) || 0, 0, 1)), v = waveform.map(n => clamp(Number(n) || 0, -1, 1));
  if (!b.length && !v.length) return;
  let paint = '#b1d4fa';
  if (color !== 'mono') {
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, '#71c8ff');
    if (color === 'rainbow') { g.addColorStop(.32, '#b298ff'); g.addColorStop(.65, '#f0a2b5'); g.addColorStop(1, '#f0d096'); } else g.addColorStop(1, '#b298ff');
    paint = g;
  }
  ctx.save(); ctx.translate(x, y); ctx.strokeStyle = paint; ctx.fillStyle = paint; ctx.lineJoin = 'round';
  const wavePoints = (scale = 1, offset = h / 2) => v.map((n, i) => [i / Math.max(1, v.length - 1) * w, offset - n * h * .4 * scale]);
  const stroke = (points, { close = false, fill = false, opacity = 1, width = 2 } = {}) => {
    if (!points.length) return;
    ctx.globalAlpha = opacity; ctx.beginPath(); points.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    if (close) ctx.closePath();
    if (fill) ctx.fill(); else { ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.stroke(); }
    ctx.globalAlpha = 1;
  };
  const bar = (x1, y1, x2, y2, width, opacity = 1) => { ctx.globalAlpha = opacity; ctx.lineWidth = width; ctx.lineCap = kind === 'round-bars' ? 'round' : 'butt'; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.globalAlpha = 1; };
  if (['wave', 'double-wave', 'area', 'mirror-area', 'ribbon'].includes(kind)) {
    if (kind === 'wave') stroke(wavePoints());
    if (kind === 'double-wave') { stroke(wavePoints(.6, h * .34)); stroke(wavePoints(-.6, h * .68), { opacity: .55 }); }
    if (kind === 'area') stroke([...wavePoints(), [w, h], [0, h]], { close: true, fill: true, opacity: .65 });
    if (kind === 'mirror-area') {
      const xs = i => i / Math.max(1, v.length - 1) * w;
      stroke([...v.map((n, i) => [xs(i), h / 2 - Math.abs(n) * h * .43]), ...[...v].reverse().map((n, i) => [xs(v.length - 1 - i), h / 2 + Math.abs(n) * h * .43])], { close: true, fill: true, opacity: .6 });
    }
    if (kind === 'ribbon') {
      const xs = i => i / Math.max(1, v.length - 1) * w;
      stroke([...wavePoints(.75), ...[...v].reverse().map((n, i) => [xs(v.length - 1 - i), h / 2 + n * h * .23 + 8])], { close: true, opacity: .7 });
    }
  } else if (['radial-bars', 'ring', 'double-ring', 'radial-dots', 'ellipse'].includes(kind)) {
    const radius = h * .31, cx = w / 2, cy = h / 2, stretch = kind === 'ellipse' ? 2.1 : 1;
    const points = b.map((n, i) => { const a = i / Math.max(1, b.length) * Math.PI * 2 - Math.PI / 2, r = radius + n * h * .09; return [cx + Math.cos(a) * r * stretch, cy + Math.sin(a) * r]; });
    if (kind === 'radial-bars' || kind === 'radial-dots') b.forEach((n, i) => {
      const a = i / b.length * Math.PI * 2 - Math.PI / 2, px = cx + Math.cos(a) * radius, py = cy + Math.sin(a) * radius;
      if (kind === 'radial-bars') bar(px, py, points[i][0], points[i][1], Math.max(1, h * .011));
      else { ctx.beginPath(); ctx.arc(points[i][0], points[i][1], 1.5 + n * 3, 0, Math.PI * 2); ctx.fill(); }
    });
    else { stroke(points, { close: true }); if (kind === 'double-ring') stroke(points.map(([px, py]) => [cx + (px - cx) * .73, cy + (py - cy) * .73]), { close: true, opacity: .55 }); }
  } else b.forEach((n, i) => {
    const step = w / Math.max(1, b.length), px = (i + .5) * step, bh = n * h * .83;
    if (kind === 'blocks') for (let yy = 0; yy < bh; yy += 9) ctx.fillRect(px - step * .31, h - yy - 7, step * .62, 5);
    else if (kind === 'dots') for (let yy = 0; yy < bh; yy += 9) { ctx.beginPath(); ctx.arc(px, h - yy - 5, Math.max(1, Math.min(2.5, step * .24)), 0, Math.PI * 2); ctx.fill(); }
    else if (kind === 'mirror') bar(px, h / 2 - bh / 2, px, h / 2 + bh / 2, Math.max(1, step * .55));
    else if (kind === 'reflection') { bar(px, h * .65 - bh * .65, px, h * .65, Math.max(1, step * .6)); bar(px, h * .68, px, h * .68 + bh * .28, Math.max(1, step * .6), .25); }
    else bar(px, h - bh, px, h, kind === 'round-bars' ? Math.max(2, step * .65) : Math.max(1, step * .3));
  });
  ctx.restore();
}

/** 시네마 플로우: wide film still, centered typography, restrained spectrum, letterbox. */
function cinematicScene({ width, height, tracks, options, images, analyses }) {
  const portrait = height > width, u = Math.min(width, height), vocal = options.mode === 'vocal';
  const offsets = []; let total = 0; for (const track of tracks) { offsets.push(total); total += Number(track.duration) || 0; }
  // Proportions from the HTML scene (base rules + cinematic theme overrides).
  const L = portrait
    ? { content: [.08, .30], contentW: .84, title: .051, titleMax: .14, index: .022, indexGap: .021, ruleGap: .025, lyricsGap: .018, lyricsH: .36, row: .12, lyric: .04, topline: [.07, .023], spectrum: [.15, .18, .70, .08], footer: [.048, .021], progress: .035, instrumental: [.68, .029] }
    : { content: [.17, .28], contentW: .66, title: .055, titleMax: .135, index: .017, indexGap: .025, ruleGap: .032, lyricsGap: .035, lyricsH: .29, row: .095, lyric: .032, topline: [.09, .017], spectrum: [.25, .11, .50, .09], footer: [.056, .017], progress: .04, instrumental: [.55, .024] };
  const cx = L.content[0] * width, cw = L.contentW * width, rowH = u * L.row, lyricsBoxH = u * L.lyricsH;
  let active = -1, under, over, lyricLayout = [], lyricsTop = 0, lyricLayer = layer(cw, lyricsBoxH);

  // Static layers per track: [gradient, photo, grid] under the moving halo; [orb, topline, art, heading] over it.
  function buildTrack(i) {
    const track = tracks[i];
    under = layer(width, height); const g = under.getContext('2d');
    ellipseGradient(g, width, height, width * .65, height * .2, [[0, '#665f71'], [.55, '#1d2535'], [1, '#080f1a']]);
    if (images.background) { g.globalAlpha = .42; drawCover(g, images.background, 0, 0, width, height); g.globalAlpha = 1; }
    g.strokeStyle = 'rgba(180,207,255,.02)'; g.lineWidth = 1; g.beginPath();
    for (let x = .5; x < width; x += 80) { g.moveTo(x, 0); g.lineTo(x, height); }
    for (let y = .5; y < height; y += 80) { g.moveTo(0, y); g.lineTo(width, y); }
    g.stroke();
    over = layer(width, height); const o = over.getContext('2d');
    const orbR = width * .68 / 2, orbX = -width * .30 + orbR, orbY = height * .45 + orbR;
    for (const [spread, alpha] of [[150, .012], [60, .02]]) { o.fillStyle = `rgba(165,199,255,${alpha})`; o.beginPath(); o.arc(orbX, orbY, orbR + spread, 0, Math.PI * 2); o.arc(orbX, orbY, orbR, 0, Math.PI * 2, true); o.fill('evenodd'); }
    o.strokeStyle = 'rgba(165,199,255,.07)'; o.lineWidth = 1; o.beginPath(); o.arc(orbX, orbY, orbR - .5, 0, Math.PI * 2); o.stroke();
    const [topY, topSize] = L.topline; o.textBaseline = 'top';
    setFont(o, 400, u * topSize, .24); o.fillStyle = '#8cabc9'; o.textAlign = 'left'; o.fillText('BOKS MUSIC', width * .06, height * topY);
    setFont(o, 400, u * topSize, .15); o.fillStyle = '#c0cce2'; o.textAlign = 'right'; o.fillText('LISTEN / FEEL / REPEAT', width * .94, height * topY);
    const art = images.arts[i];
    if (art) { o.globalAlpha = .12; drawCover(o, art, 0, 0, width, height); o.globalAlpha = 1; }
    // Heading block: index, title, rule; the lyric window follows below it.
    let y = height * L.content[1]; o.textAlign = 'center'; o.textBaseline = 'top';
    setFont(o, 400, u * L.index, .32); o.fillStyle = '#7fa3c9';
    o.fillText(`${String(i + 1).padStart(2, '0')} — ${String(tracks.length).padStart(2, '0')} / NOW PLAYING`, cx + cw / 2, y);
    y += u * L.index * 1.3 + u * L.indexGap;
    const title = fitText(o, track.title || '', { size: u * L.title, minSize: u * .029, weight: 600, lineHeight: 1.3, maxWidth: cw, maxHeight: u * L.titleMax, spacing: -.025 });
    o.fillStyle = '#f5f7ff'; title.lines.forEach((line, n) => o.fillText(line, cx + cw / 2, y + n * title.font * 1.3 + title.font * .15));
    y += title.height + u * L.ruleGap;
    const ruleW = cw * .3, rule = o.createLinearGradient(cx + cw / 2 - ruleW / 2, 0, cx + cw / 2 + ruleW / 2, 0);
    rule.addColorStop(0, 'rgba(149,180,223,.44)'); rule.addColorStop(1, 'rgba(149,180,223,0)'); o.fillStyle = rule; o.fillRect(cx + cw / 2 - ruleW / 2, y, ruleW, 1);
    lyricsTop = y + 1 + u * L.lyricsGap;
    // Footer title (the clock is drawn per frame).
    const [footerBottom, footerSize] = L.footer; setFont(o, 400, u * footerSize, .07); o.fillStyle = '#90a4bf'; o.textAlign = 'left'; o.textBaseline = 'bottom';
    o.fillText(ellipsize(o, track.title || '', width * .88 - u * footerSize * 8), width * .06, height * (1 - footerBottom));
    // Lyric lines: wrapped and sized once per track.
    const lineCtx = lyricLayer.getContext('2d');
    lyricLayout = (track.cues || []).map(cue => ({ start: cue.start, ...fitText(lineCtx, cue.text || '', { size: u * L.lyric, minSize: u * .019, weight: 500, lineHeight: 1.45, maxWidth: cw, maxHeight: rowH, spacing: -.025 }) }));
  }

  function drawAbstractArt(ctx, t) {
    ctx.save(); ctx.globalAlpha = .12;
    const g = ctx.createLinearGradient(0, 0, width, height); g.addColorStop(0, '#1d304b'); g.addColorStop(.55, '#343956'); g.addColorStop(1, '#937e79'); ctx.fillStyle = g; ctx.fillRect(0, 0, width, height);
    ctx.translate(width / 2, height * .7); ctx.rotate((-32 + Math.sin(t * .03) * 4) * Math.PI / 180); ctx.translate(0, Math.sin(t * .04) * .02 * height * .7);
    for (let ring = 4; ring >= 0; ring--) { ctx.strokeStyle = ring ? `rgba(188,214,237,${.05 - ring * .008})` : 'rgba(188,214,237,.44)'; ctx.lineWidth = ring ? 18 : 1; ctx.beginPath(); ctx.ellipse(0, 0, width * .65 + ring * 18, height * .35 + ring * 18, 0, 0, Math.PI * 2); ctx.stroke(); }
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = .12 * .63;
    setFont(ctx, 400, u * .018, .28); ctx.fillStyle = '#d9e3ee'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText('THE SOUND OF A MOMENT', width * .1, height * .89);
    ctx.restore();
  }

  function draw(ctx, time) {
    const t = clamp(Number(time) || 0, 0, total);
    let i = 0; for (let n = offsets.length - 1; n >= 0; n--) if (offsets[n] <= t) { i = n; break; }
    const track = tracks[i]; if (!track) return;
    if (active !== i) { active = i; buildTrack(i); }
    const local = clamp(t - offsets[i], 0, Number(track.duration) || 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(under, 0, 0);
    // Halo drifts slowly across the frame (same motion as the HTML scene).
    const hw = width * .8, hh = height * 1.1, hx = width * .3 + Math.sin(t * .035) * .09 * hw, hy = -height * .25 + Math.cos(t * .029) * .07 * hh;
    ctx.save(); ctx.translate(hx + hw / 2, hy + hh / 2); ctx.scale(1, hh / hw);
    const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, hw / 2 * Math.SQRT2); halo.addColorStop(0, 'rgba(89,121,163,.15)'); halo.addColorStop(.65, 'rgba(89,121,163,0)');
    ctx.fillStyle = halo; ctx.fillRect(-hw, -hw, hw * 2, hw * 2); ctx.restore();
    ctx.drawImage(over, 0, 0);
    if (!images.arts[i]) drawAbstractArt(ctx, t);
    if (vocal) drawLyrics(ctx, local);
    else { setFont(ctx, 400, u * L.instrumental[1], .09); ctx.fillStyle = '#96abc7'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText('INSTRUMENTAL SESSION', cx + cw / 2, height * L.instrumental[0]); }
    const frame = interpolateAnalysisFrame(analyses[i], local, options.fps || 30);
    if (frame) { const [sx, sb, sw, sh] = L.spectrum; drawSpectrum(ctx, { kind: options.spectrum, bins: frame.bins, waveform: frame.waveform, color: options.color, x: width * sx, y: height * (1 - sb - sh), width: width * sw, height: height * sh }); }
    const [footerBottom, footerSize] = L.footer; setFont(ctx, 400, u * footerSize, .07); ctx.fillStyle = '#90a4bf'; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.fillText(`${stamp(local)} / ${stamp(Number(track.duration) || 0)}`, width * .94, height * (1 - footerBottom));
    const barY = height * (1 - L.progress) - 2, barW = width * .88;
    ctx.fillStyle = 'rgba(156,177,216,.145)'; ctx.fillRect(width * .06, barY, barW, 2);
    ctx.fillStyle = '#accee8'; ctx.fillRect(width * .06, barY, barW * (track.duration ? local / track.duration : 0), 2);
    const bar = u * .04; ctx.fillStyle = '#050a11'; ctx.fillRect(0, 0, width, bar); ctx.fillRect(0, height - bar, width, bar);
  }

  // Lyric roll: identical easing and emphasis to the HTML scene, faded at the window edges.
  function drawLyrics(ctx, local) {
    const g = lyricLayer.getContext('2d'); g.clearRect(0, 0, lyricLayer.width, lyricLayer.height);
    let index = -1; for (let n = lyricLayout.length - 1; n >= 0; n--) if (Number.isFinite(lyricLayout[n].start) && lyricLayout[n].start <= local) { index = n; break; }
    const delta = index >= 0 ? clamp((local - lyricLayout[index].start) / .42, 0, 1) : 1, ease = 1 - Math.pow(1 - delta, 3);
    const shift = (1 - Math.max(0, index) + (index > 0 ? 1 - ease : 0)) * rowH;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    lyricLayout.forEach((line, n) => {
      const top = shift + n * rowH; if (top > lyricsBoxH || top + rowH < 0) return;
      const emphasis = n === index ? (index > 0 ? ease : 1) : n === index - 1 ? 1 - ease : 0;
      setFont(g, 500, line.font, -.025); g.globalAlpha = .25 + .75 * emphasis;
      g.fillStyle = `rgb(${Math.round(160 + 87 * emphasis)},${Math.round(180 + 68 * emphasis)},${Math.round(210 + 45 * emphasis)})`;
      const first = top + rowH / 2 - (line.lines.length - 1) * line.font * 1.45 / 2;
      line.lines.forEach((text, k) => g.fillText(text, cw / 2, first + k * line.font * 1.45));
    });
    g.globalAlpha = 1; g.globalCompositeOperation = 'destination-in';
    const mask = g.createLinearGradient(0, 0, 0, lyricsBoxH); mask.addColorStop(0, 'rgba(0,0,0,0)'); mask.addColorStop(.16, '#000'); mask.addColorStop(.84, '#000'); mask.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = mask; g.fillRect(0, 0, lyricLayer.width, lyricLayer.height); g.globalCompositeOperation = 'source-over';
    ctx.drawImage(lyricLayer, cx, lyricsTop);
  }
  return { draw, duration: total };
}

export function createCanvasScene({ scene, ...input }) {
  if (scene === 'cinematic') return cinematicScene(input);
  throw Error('지원하지 않는 GPU 영상 장면입니다.');
}

const loadImage = src => new Promise(resolve => { if (!src) return resolve(null); const image = new Image(); image.onload = () => resolve(image); image.onerror = () => resolve(null); image.src = src; });
/** Editor preview: the same scene drawn once on a canvas inside the preview host. */
export function mountCanvasPreview(host, { scene, tracks = [], options = {}, duration, assets = {} } = {}) {
  const root = host.shadowRoot || host.attachShadow({ mode: 'open' });
  const width = Number(options.width) || 960, height = Number(options.height) || 540;
  const canvas = Object.assign(document.createElement('canvas'), { width, height }); canvas.style.cssText = 'display:block;transform-origin:0 0';
  root.replaceChildren(canvas);
  const fit = () => { canvas.style.transform = `scale(${Math.min(host.clientWidth / width, host.clientHeight / height)})`; };
  const observer = new ResizeObserver(fit); observer.observe(host); fit();
  let disposed = false;
  const ready = Promise.all([loadImage(assets.backgroundUrl), ...tracks.map(track => loadImage(track.artUrl))]).then(([background, ...arts]) => {
    if (disposed) return;
    const instance = createCanvasScene({ scene, width, height, tracks: tracks.map(track => ({ ...track, duration: Number(track.duration) || Number(duration) || 0 })), options, images: { background, arts }, analyses: [] });
    instance.draw(canvas.getContext('2d'), 0);
  });
  return { ready, dispose: () => { disposed = true; observer.disconnect(); } };
}
