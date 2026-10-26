// flow.js — every applicant as a glowing dot that settles into its outcome lane.
// When the rules change (sliders, Ask), dots glide to their new lane.

const LANES = ['approved', 'conditional', 'hold', 'waitlist', 'declined'];
const LABEL = { approved: 'Approved', conditional: 'With conditions', hold: 'On hold', waitlist: 'Waitlist', declined: 'Declined' };
const GAP = 10, R = 3.2;

export class Flow {
  constructor(canvas, { onHover, onClick, color, dots }) {
    this.cv = canvas; this.ctx = canvas.getContext('2d');
    this.dots = dots || new Map(); this.onHover = onHover; this.onClick = onClick; this.color = color;
    this.hover = null; this.t0 = performance.now();
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    new ResizeObserver(() => requestAnimationFrame(() => this.resize())).observe(canvas);
    canvas.addEventListener('pointermove', e => this.move(e));
    canvas.addEventListener('pointerleave', () => { this.hover = null; this.onHover(null); });
    canvas.addEventListener('click', () => this.hover && this.onClick(this.hover.id));
    this.resize();
    const tick = now => { if (!this.cv.isConnected) return; this.frame(now); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }

  resize() {
    const r = this.cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    this.w = r.width; this.h = r.height;
    this.cv.width = Math.max(1, r.width * dpr); this.cv.height = Math.max(1, r.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.apps) this.layout(this.apps, false);
  }

  // Work out where each dot belongs; keep current positions so changes animate
  setData(apps) { this.apps = apps; this.layout(apps, true); }

  layout(apps, animate) {
    const left = 0, laneW = this.w / LANES.length;
    const cols = Math.max(3, Math.floor((laneW - 14) / GAP));
    const top = 58;
    this.lanes = LANES.map((d, i) => ({ d, x: left + i * laneW, w: laneW, n: 0 }));
    const order = [...apps].sort((a, b) => (b.combined || 0) - (a.combined || 0));
    const now = performance.now();
    order.forEach((a, k) => {
      const lane = this.lanes[LANES.indexOf(a.decision)];
      const i = lane.n++;
      const tx = lane.x + 8 + (i % cols) * GAP + R, ty = top + Math.floor(i / cols) * GAP + R;
      let d = this.dots.get(a.id);
      if (!d) {
        // new dots start in the "applications" pile on the left
        const sx = -10 - Math.random() * 60;
        const sy = top + Math.random() * Math.max(60, this.h - top);
        d = { id: a.id, x: sx, y: sy, fx: sx, fy: sy, delay: this.reduced ? 0 : k * 7, start: now };
        this.dots.set(a.id, d);
      } else if (animate && d.decision !== a.decision) {
        d.fx = d.x; d.fy = d.y; d.start = now; d.delay = 0; d.flash = now;
      } else if (animate) { d.fx = d.x; d.fy = d.y; d.start = now; d.delay = 0; }
      d.tx = tx; d.ty = ty; d.decision = a.decision; d.name = a.name; d.head = a.headline;
    });
    const ids = new Set(apps.map(a => a.id));
    for (const id of this.dots.keys()) if (!ids.has(id)) this.dots.delete(id);
    const maxRows = Math.max(...this.lanes.map(l => Math.ceil(l.n / cols)));
    const need = top + maxRows * GAP + 18;
    const want = Math.max(150, need);
    if (Math.abs(want - this.h) > 4) requestAnimationFrame(() => { this.cv.style.height = want + 'px'; });
  }

  frame(now) {
    const c = this.ctx, w = this.w, h = this.h;
    c.clearRect(0, 0, w, h);
    if (!this.lanes) return;
    // lane headers: name on top, big count below
    for (const l of this.lanes) {
      c.fillStyle = this.color(`--d-${l.d}`);
      c.beginPath(); c.arc(l.x + 12, 14, 4, 0, 7); c.fill();
      c.font = '500 12px Inter, system-ui, sans-serif'; c.fillStyle = this.color('--text-2');
      c.fillText(fit(c, LABEL[l.d], l.w - 30), l.x + 22, 18);
      c.font = '600 20px Inter, system-ui, sans-serif'; c.fillStyle = this.color('--text');
      c.fillText(String(l.n), l.x + 8, 44);
    }
    const dur = this.reduced ? 1 : 900;
    for (const d of this.dots.values()) {
      const k = Math.max(0, Math.min(1, (now - d.start - d.delay) / dur));
      const e = 1 - Math.pow(1 - k, 3);
      d.x = d.fx + (d.tx - d.fx) * e; d.y = d.fy + (d.ty - d.fy) * e;
      const bob = this.reduced || k < 1 ? 0 : Math.sin(now / 900 + d.tx * 0.05 + d.ty * 0.07) * 0.6;
      const hot = this.hover === d;
      const flash = d.flash && now - d.flash < 1600;
      const sp = this.sprite(this.color(`--d-${d.decision}`), hot || flash);
      c.drawImage(sp, d.x - sp.r, d.y + bob - sp.r, sp.r * 2, sp.r * 2);
    }
    if (this.hover) {
      c.strokeStyle = this.color('--text'); c.lineWidth = 1.5;
      c.beginPath(); c.arc(this.hover.x, this.hover.y, R + 5, 0, 7); c.stroke();
    }
  }

  // A glowing dot drawn once per colour, then stamped (much cheaper than live shadows)
  sprite(col, big) {
    this.sprites ||= new Map();
    const key = col + big;
    if (this.sprites.has(key)) return this.sprites.get(key);
    const r = big ? 12 : 8, dpr = 2, cv = document.createElement('canvas');
    cv.width = cv.height = r * 2 * dpr;
    const c = cv.getContext('2d'); c.scale(dpr, dpr);
    c.shadowColor = col; c.shadowBlur = big ? 10 : 5; c.fillStyle = col;
    c.beginPath(); c.arc(r, r, big ? R + 1.5 : R, 0, 7); c.fill();
    cv.r = r; this.sprites.set(key, cv);
    return cv;
  }

  move(e) {
    const r = this.cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    let best = null, bd = 64;
    for (const d of this.dots.values()) { const q = (d.x - x) ** 2 + (d.y - y) ** 2; if (q < bd) { bd = q; best = d; } }
    if (best !== this.hover) { this.hover = best; this.cv.style.cursor = best ? 'pointer' : 'default'; }
    this.onHover(best, e);
  }
}

function fit(c, text, max) {
  if (c.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 3 && c.measureText(t + '…').width > max) t = t.slice(0, -1);
  return t + '…';
}
