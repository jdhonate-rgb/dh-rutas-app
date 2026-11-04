// Utilidades de interfaz: elementos, formato, avisos y ventanas inferiores.

export const $ = (s, r = document) => r.querySelector(s);

export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
    else if (k === 'value') el.value = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  add(el, kids);
  return el;
}
function add(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k.nodeType ? k : document.createTextNode(String(k)));
  }
}
export const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };

// ---------- Íconos (trazo simple, 24x24) ----------
const P = {
  route: '<circle cx="6" cy="19" r="2.2"/><circle cx="18" cy="5" r="2.2"/><path d="M8.2 19H15a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h6.8"/>',
  cash: '<rect x="3" y="6.5" width="18" height="11" rx="2.5"/><circle cx="12" cy="12" r="2.6"/><path d="M6.5 9.5v.01M17.5 14.5v.01"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.4 2.7-6 6-6s6 2.6 6 6"/><path d="M16 5.2a3.2 3.2 0 0 1 0 5.6M18 14.4c2 .8 3.4 2.9 3.4 5.6"/>',
  bank: '<path d="M3 9.5 12 4l9 5.5"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  box: '<rect x="4" y="10" width="16" height="10" rx="2.2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v2.5"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
  chat: '<path d="M4 20l1.4-4.2A8 8 0 1 1 8.2 18.6z"/><path d="M9 10c.3 2 2 3.7 4 4l1.4-1.2 2 .9"/>',
  pin: '<path d="M12 21s7-6.2 7-11.5a7 7 0 0 0-14 0C5 14.800 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  alert: '<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4.5M12 17.2v.01"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  logout: '<path d="M9 4H5v16h4M14 8l4 4-4 4M18 12H9"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14-4.5L4 9M4 4v5h5M4 13a8 8 0 0 0 14 4.5L20 15M20 20v-5h-5"/>',
  chev: '<path d="M9 5l7 7-7 7"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  calendar: '<rect x="4" y="5.5" width="16" height="14.5" rx="2.5"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
  grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>',
  user: '<circle cx="12" cy="8" r="3.6"/><path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6"/>',
  percent: '<path d="M18 6 6 18"/><circle cx="7.5" cy="7.5" r="2"/><circle cx="16.5" cy="16.5" r="2"/>',
  file: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 16h5"/>',
  wallet: '<path d="M4 8a2 2 0 0 1 2-2h12v3"/><rect x="4" y="8" width="16" height="11" rx="2.5"/><path d="M16 13.5h2"/>',
  trash: '<path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
  edit: '<path d="M4 20l1-4L16.500 4.500a2 2 0 0 1 3 3L8 19z"/>'
};
export function icon(name, size = 22) {
  const s = h('span', { class: 'ic', 'aria-hidden': 'true' });
  s.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${P[name] || ''}</svg>`;
  return s;
}

// ---------- Formato ----------
const MON = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
export const money = (n) => MON.format(Math.round(Number(n || 0)));
export const num = (n) => new Intl.NumberFormat('es-CO').format(Number(n || 0));
export function fdate(iso, long) {
  if (!iso) return '';
  const d = new Date(String(iso).substring(0, 10) + 'T12:00:00');
  return d.toLocaleDateString('es-CO', long ? { weekday: 'long', day: 'numeric', month: 'long' } : { day: 'numeric', month: 'short' }).replace('.', '');
}
export function ftime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Bogota' });
}
export const hoyCO = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Bogota' });
export function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().substring(0, 10);
}
export function addMonths(iso, n) {   // igual que PostgreSQL: 31 ene + 1 mes = 28 feb
  const [y, m, day] = iso.split('-').map(Number);
  const t = m - 1 + n, yy = y + Math.floor(t / 12), mm = ((t % 12) + 12) % 12;
  const last = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
  return new Date(Date.UTC(yy, mm, Math.min(day, last), 12)).toISOString().substring(0, 10);
}
export function inicioSemana(iso) {
  const d = new Date(iso + 'T12:00:00Z'); const dow = (d.getUTCDay() + 6) % 7;
  return addDays(iso, -dow);
}
export const clean = (s) => (s == null ? '' : String(s).trim());
export function telDigits(t) {
  let d = String(t || '').replace(/\D/g, '');
  if (d.length === 10 && d.startsWith('3')) d = '57' + d;
  return d;
}

// ---------- Avisos y ventanas ----------
export function toast(msg, kind = 'ok') {
  let box = $('#toasts');
  if (!box) { box = h('div', { id: 'toasts', role: 'status', 'aria-live': 'polite' }); document.body.append(box); }
  const t = h('div', { class: 'toast ' + kind }, msg);
  box.append(t);
  setTimeout(() => t.classList.add('out'), kind === 'bad' ? 5200 : 2600);
  setTimeout(() => t.remove(), kind === 'bad' ? 5600 : 3000);
}
export function fail(e) {
  console.error(e);
  let m = (e && (e.message || e.error_description)) || String(e);
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) m = 'Sin conexión. Revisa tu internet e inténtalo de nuevo.';
  if (/JWT expired/i.test(m)) m = 'Tu sesión venció. Cierra sesión y vuelve a entrar.';
  toast(m, 'bad');
}

export function sheet(title, build) {
  const back = h('div', { class: 'sheet-back' });
  const panel = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
  const close = () => { back.classList.add('out'); setTimeout(() => back.remove(), 160); document.removeEventListener('keydown', esc); window.removeEventListener('hashchange', close); };
  const esc = (e) => { if (e.key === 'Escape') close(); };
  panel.append(
    h('div', { class: 'sheet-head' },
      h('h2', {}, title),
      h('button', { class: 'icon-btn', 'aria-label': 'Cerrar', on: { click: close } }, icon('close'))),
    h('div', { class: 'sheet-body' }, build(close))
  );
  back.append(panel);
  back.addEventListener('click', (e) => { if (e.target === back) close(); });
  document.addEventListener('keydown', esc);
  window.addEventListener('hashchange', close);
  document.body.append(back);
  const first = panel.querySelector('input,select,textarea');
  if (first) setTimeout(() => first.focus(), 60);
  return close;
}

export async function busy(btn, fn) {
  const label = btn.textContent;
  btn.disabled = true; btn.classList.add('busy'); btn.textContent = 'Un momento…';
  try { return await fn(); }
  catch (e) { fail(e); }
  finally { btn.disabled = false; btn.classList.remove('busy'); btn.textContent = label; }
}

// ---------- Formularios ----------
export function field(label, input, hint) {
  const id = 'f' + Math.random().toString(36).slice(2, 8);
  input.id = id;
  return h('div', { class: 'field' }, h('label', { for: id }, label), input, hint ? h('p', { class: 'hint' }, hint) : null);
}
export function selectEl(options, value, attrs) {
  const s = h('select', attrs || {});
  for (const [v, t] of options) s.append(h('option', { value: v }, t));
  if (value != null) s.value = value;
  return s;
}
export function segmented(options, value, onchange) {
  const wrap = h('div', { class: 'seg', role: 'tablist' });
  const paint = () => [...wrap.children].forEach((b) => b.classList.toggle('on', b.dataset.v === wrap.dataset.value));
  wrap.dataset.value = value;
  for (const [v, t] of options) {
    wrap.append(h('button', { type: 'button', class: 'seg-b', 'data-v': v, role: 'tab', on: { click: () => { wrap.dataset.value = v; paint(); onchange && onchange(v); } } }, t));
  }
  paint();
  wrap.get = () => wrap.dataset.value;
  return wrap;
}
export function moneyInput(attrs) {
  return h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: '$ 0', ...(attrs || {}),
    on: { input: (e) => { const d = e.target.value.replace(/\D/g, ''); e.target.value = d ? new Intl.NumberFormat('es-CO').format(Number(d)) : ''; } } });
}
export const moneyVal = (input) => Number(String(input.value).replace(/\D/g, '')) || 0;

export function empty(title, text, action) {
  return h('div', { class: 'empty' }, h('p', { class: 'empty-t' }, title), text ? h('p', { class: 'empty-s' }, text) : null, action || null);
}
export function skeleton(n = 4) {
  return h('div', { class: 'skel-list' }, Array.from({ length: n }, () => h('div', { class: 'skel' })));
}

// Confirmación para eliminar: pide un motivo opcional y ejecuta onOk(motivo).
export function confirmarEliminar({ titulo, texto, boton = 'Eliminar', onOk }) {
  return sheet(titulo, (close) => {
    const motivo = h('textarea', { rows: '2', placeholder: 'Motivo (opcional)', 'aria-label': 'Motivo' });
    const ok = h('button', { class: 'btn danger block', type: 'button', on: { click: (e) => busy(e.currentTarget, async () => { await onOk(clean(motivo.value) || null); close(); }) } }, boton);
    return h('div', { class: 'stack' }, h('p', {}, texto), h('div', { class: 'field' }, motivo), ok,
      h('button', { class: 'btn block', type: 'button', on: { click: close } }, 'Cancelar'));
  });
}
