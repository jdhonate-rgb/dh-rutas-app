import { CONFIG } from './config.js';
import { h, icon, toast, fail, empty } from './lib.js';
import { S, sb, q, isStaff, isAdmin, cargarApoyo } from './state.js';
import * as R from './ruta.js';
import * as G from './gastos.js';
import * as M from './gestion.js';
import * as F from './finanzas.js';
import * as A from './admin.js';
import * as RP from './reportes.js';

const root = document.getElementById('app');
let top, view, nav;

const ROUTES = [
  [/^#\/ruta$/, R.ruta, 'todos'], [/^#\/prestamo\/([^/?]+)$/, R.tarjeta, 'todos'],
  [/^#\/gastos$/, G.gastos, 'todos'], [/^#\/resumen$/, G.resumen, 'todos'],
  [/^#\/cliente-nuevo$/, M.clienteNuevo, 'todos'], [/^#\/auditoria$/, A.auditoria, 'staff'], [/^#\/clientes$/, M.clientes, 'staff'], [/^#\/cliente\/([^/?]+)$/, M.cliente, 'staff'],
  [/^#\/prestamos$/, M.prestamos, 'staff'], [/^#\/prestamo-nuevo$/, M.prestamoNuevo, 'todos'], [/^#\/caja$/, M.caja, 'staff'],
  [/^#\/cuentas$/, F.cuentas, 'ver'], [/^#\/cuenta\/([^/?]+)$/, F.cuenta, 'ver'],
  [/^#\/liquidaciones$/, F.liquidaciones, 'staff'], [/^#\/liquidacion\/([^/?]+)$/, F.liquidacion, 'staff'],
  [/^#\/mas$/, A.mas, 'staff'], [/^#\/actividad$/, A.actividad, 'staff'],
  [/^#\/reportes$/, RP.indice, 'staff'], [/^#\/reportes\/([^/?]+)$/, RP.reporte, 'staff'],
  [/^#\/usuarios$/, A.usuarios, 'admin'], [/^#\/rutas$/, A.rutas, 'admin'], [/^#\/config$/, A.config, 'admin']
];
const MAS_GRUPO = /^#\/(mas|auditoria|clientes|cliente|gastos|resumen|liquidaciones|liquidacion|actividad|reportes|usuarios|rutas|config)/;

function navItems() {
  if (isStaff()) return [['#/ruta', 'route', 'Ruta'], ['#/caja', 'box', 'Caja'], ['#/prestamos', 'cash', 'Préstamos'], ['#/cuentas', 'bank', 'Cuentas'], ['#/mas', 'grid', 'Más']];
  const base = [['#/ruta', 'route', 'Ruta'], ['#/gastos', 'receipt', 'Gastos'], ['#/resumen', 'chart', 'Resumen']];
  if (S.profile && S.profile.ver_cuentas) base.splice(2, 0, ['#/cuentas', 'bank', 'Cuentas']);
  return base;
}

function itemsMenu() {
  if (isStaff()) {
    const m = [['#/ruta', 'route', 'Ruta'], ['#/caja', 'box', 'Caja'], ['#/prestamos', 'cash', 'Préstamos'], ['#/clientes', 'users', 'Clientes'], ['#/cuentas', 'bank', 'Cuentas'],
      ['#/gastos', 'receipt', 'Gastos'], ['#/resumen', 'chart', 'Resumen del día'], ['#/liquidaciones', 'wallet', 'Liquidaciones'], ['#/auditoria', 'search', 'Auditar rutas'], ['#/reportes', 'file', 'Reportes'], ['#/actividad', 'list', 'Actividad']];
    if (isAdmin()) m.push(['#/usuarios', 'user', 'Usuarios'], ['#/rutas', 'route', 'Rutas'], ['#/config', 'sliders', 'Configuración']);
    return m;
  }
  return navItems().map(([href, ic, label]) => [href, ic, label === 'Resumen' ? 'Resumen del día' : label]);
}
let drawer, scrim;
function abrirMenu(v) { drawer.classList.toggle('open', v); scrim.classList.toggle('open', v); document.body.classList.toggle('noscroll', v); }
function pintarMenu() {
  const hash = location.hash || '#/ruta';
  const rol = { ADMINISTRADOR: 'Administrador', SUPERVISOR: 'Supervisor', COBRADOR: 'Cobrador' }[S.profile.rol];
  const empresa = (S.cfg.EMPRESA_NOMBRE || '').trim();
  drawer.replaceChildren(
    h('div', { class: 'dr-head' }, marca(76), h('div', { class: 'dr-app' }, 'DH RUTAS'), h('div', { class: 'dr-tag' }, 'Cobros · Caja · Cartera')),
    h('div', { class: 'dr-hola' }, 'Hola, ' + S.profile.nombre, h('small', {}, (empresa ? empresa.toUpperCase() + ' · ' : '') + rol.toUpperCase())),
    h('div', { class: 'dr-items' }, itemsMenu().map(([href, ic, label]) => {
      const on = hash === href || hash.startsWith(href + '/') || hash.startsWith(href + '?') || (href === '#/ruta' && hash.startsWith('#/prestamo/') && !isStaff()) || (href === '#/prestamos' && /^#\/prestamo(-nuevo|\/)/.test(hash) && isStaff()) || (href === '#/clientes' && hash.startsWith('#/cliente/'));
      return h('a', { href, class: on ? 'on' : '' }, icon(ic, 22), label);
    })),
    h('div', { class: 'dr-foot' }, h('button', { class: 'dr-salir', on: { click: () => { abrirMenu(false); salir(); } } }, icon('logout', 22), 'SALIR'), h('div', { class: 'dr-ver' }, 'v2.0')));
}

function marca(size) {
  const s = h('span', { class: 'ic' });
  s.innerHTML = `<svg viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true"><rect width="64" height="64" rx="15" fill="#0F2557"/><rect x="8" y="20" width="48" height="24" rx="6" fill="#FFC72C" stroke="#fff" stroke-width="2"/><text x="32" y="38.5" text-anchor="middle" font-family="system-ui,Arial,sans-serif" font-weight="900" font-size="17" fill="#0F2557">DH</text></svg>`;
  return s;
}

function shell() {
  top = h('header', { class: 'top' });
  view = h('main', { id: 'view', tabindex: '-1' });
  nav = h('nav', { class: 'nav', 'aria-label': 'Principal' });
  const off = h('div', { class: 'offline', role: 'status', hidden: true }, 'Sin conexión. Los cobros no se guardan hasta que vuelva el internet.');
  const sync = () => { off.hidden = navigator.onLine; };
  window.addEventListener('online', sync); window.addEventListener('offline', sync); sync();
  scrim = h('div', { class: 'scrim', on: { click: () => abrirMenu(false) } });
  drawer = h('aside', { class: 'drawer', 'aria-label': 'Menú' });
  root.replaceChildren(off, top, view, nav, scrim, drawer);
}

function pintarNav() {
  const hash = location.hash || '#/ruta';
  nav.replaceChildren(h('div', { class: 'brand' }, 'DH Rutas'), ...navItems().map(([href, ic, label]) => {
    const on = href === '#/mas' ? MAS_GRUPO.test(hash) : hash.startsWith(href) || (href === '#/ruta' && hash.startsWith('#/prestamo/') && !isStaff()) || (href === '#/prestamos' && /^#\/prestamo(-nuevo|\/)/.test(hash) && isStaff());
    return h('a', { href, class: on ? 'on' : '', 'aria-current': on ? 'page' : null }, icon(ic, 24), label);
  }));
}

function setTop(title, o = {}) {
  document.title = title + ' · DH Rutas';
  top.replaceChildren(...[
    h('button', { class: 'icon-btn menu-btn', 'aria-label': 'Menú', on: { click: () => abrirMenu(true) } }, icon('menu')),
    o.back ? h('a', { class: 'icon-btn', href: o.back, 'aria-label': 'Volver' }, icon('back')) : null,
    h('h1', {}, title, o.sub ? h('span', { class: 'sub' }, o.sub) : null),
    ...(o.actions || []).map((a) => h('button', { class: 'icon-btn', 'aria-label': a.label, on: { click: a.fn } }, icon(a.icon)))].filter(Boolean));
}

async function render() {
  if (!S.profile) return;
  const full = location.hash || '#/ruta';
  const [path, qs] = full.split('?');
  const query = Object.fromEntries(new URLSearchParams(qs || ''));
  let hit = null, params = [];
  for (const [re, fn, rol] of ROUTES) { const m = re.exec(path); if (m) { hit = { fn, rol }; params = m.slice(1); break; } }
  const permitido = hit && (hit.rol === 'todos' || (hit.rol === 'staff' && isStaff()) || (hit.rol === 'ver' && (isStaff() || S.profile.ver_cuentas)) || (hit.rol === 'admin' && isAdmin()));
  if (!permitido) { location.hash = '#/ruta'; return; }
  pintarNav(); pintarMenu(); abrirMenu(false);
  window.scrollTo(0, 0);
  const ctx = { view, params, query, setTop, refresh: render, salir, go: (hsh) => { location.hash = hsh; } };
  try { await hit.fn(ctx); }
  catch (e) { fail(e); view.replaceChildren(empty('Algo salió mal', 'Vuelve a la ruta e inténtalo de nuevo.', h('a', { class: 'btn', href: '#/ruta' }, 'Ir a la ruta'))); }
}

// ---------------------------------------------------------------- Acceso
function pantallaLogin(msg) {
  S.profile = null;
  const email = h('input', { type: 'email', autocomplete: 'username', inputmode: 'email', placeholder: 'correo@ejemplo.com', required: true });
  const pass = h('input', { type: 'password', autocomplete: 'current-password', placeholder: 'Contraseña', required: true });
  const err = h('div', { class: 'err', hidden: !msg }, msg || '');
  const btn = h('button', { class: 'btn primary block', type: 'submit' }, 'Entrar');
  const form = h('form', { on: { submit: async (e) => {
    e.preventDefault(); err.hidden = true; btn.disabled = true; btn.textContent = 'Entrando…';
    const { error } = await sb.auth.signInWithPassword({ email: email.value.trim(), password: pass.value });
    btn.disabled = false; btn.textContent = 'Entrar';
    if (error) { err.textContent = /Invalid login/i.test(error.message) ? 'Correo o contraseña incorrectos.' : /fetch/i.test(error.message) ? 'Sin conexión. Revisa tu internet.' : error.message; err.hidden = false; return; }
    await entrar();
  } } },
    err,
    h('div', { class: 'field' }, h('label', { for: 'em' }, 'Correo'), Object.assign(email, { id: 'em' })),
    h('div', { class: 'field' }, h('label', { for: 'pw' }, 'Contraseña'), Object.assign(pass, { id: 'pw' })),
    btn);
  root.replaceChildren(h('div', { class: 'login' }, h('div', { class: 'box' }, marca(64), h('h1', {}, 'DH Rutas'), h('p', {}, 'Cobros, caja y cartera en un solo lugar.'), form)));
}

function pantallaBloqueo(texto) {
  root.replaceChildren(h('div', { class: 'login' }, h('div', { class: 'box' }, marca(64), h('h1', {}, 'Acceso pendiente'), h('p', {}, texto),
    h('button', { class: 'btn block', on: { click: salir } }, 'Cerrar sesión'))));
}
function pantallaConfig() {
  root.replaceChildren(h('div', { class: 'login' }, h('div', { class: 'box' }, marca(64), h('h1', {}, 'Falta conectar'), h('p', {}, 'Abre el archivo js/config.js y pega la URL y la llave pública de tu proyecto de Supabase.'))));
}

async function entrar() {
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return pantallaLogin();
    const p = await q(sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle());
    if (!p) return pantallaBloqueo('Tu usuario todavía no tiene perfil. Pídele al administrador que lo configure.');
    if (p.estado !== 'ACTIVO') return pantallaBloqueo('Tu usuario está inactivo. Pídele al administrador que lo active.');
    S.profile = p;
    await cargarApoyo();
    shell();
    await render();
  } catch (e) {
    console.error(e);
    pantallaLogin(/fetch/i.test(String(e.message)) ? 'Sin conexión. Revisa tu internet.' : 'No se pudo entrar: ' + (e.message || e));
  }
}

async function salir() {
  await sb.auth.signOut();
  pantallaLogin();
}

// ---------------------------------------------------------------- Inicio
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); S.install = e; });
window.addEventListener('hashchange', render);
document.addEventListener('visibilitychange', () => { if (!document.hidden && S.profile && /^#\/(ruta|resumen)?$/.test(location.hash) && !document.querySelector('.sheet-back')) render(); });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});

if (!CONFIG.url || /PEGA/i.test(CONFIG.url) || !CONFIG.key || /PEGA/i.test(CONFIG.key)) pantallaConfig();
else {
  sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') pantallaLogin(); });
  entrar();
}
