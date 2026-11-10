// Administración (solo administrador): usuarios, rutas y configuración. Más el menú "Más".
import { h, icon, money, fdate, ftime, hoyCO, addDays, toast, fail, busy, empty, skeleton, sheet, field, selectEl, segmented, clean, moneyInput, moneyVal } from './lib.js';
import { S, sb, q, isAdmin, cargarApoyo, esCob, nombreDe } from './state.js';

export function mas(ctx) {
  ctx.setTop('Más');
  const t = (href, ic, label) => h('a', { class: 'tile', href }, icon(ic, 26), label);
  const admin = isAdmin();
  ctx.view.replaceChildren(h('div', { class: 'stack' },
    h('div', { class: 'tiles' },
      t('#/clientes', 'users', 'Clientes'), t('#/gastos', 'receipt', 'Gastos'), t('#/resumen', 'chart', 'Resumen del día'), t('#/liquidaciones', 'wallet', 'Liquidaciones'), t('#/auditoria', 'search', 'Auditar rutas'), t('#/reportes', 'file', 'Reportes'), t('#/actividad', 'list', 'Actividad')),
    admin ? h('div', { class: 'section' }, h('h3', {}, 'Administración'), h('div', { class: 'tiles' },
      t('#/usuarios', 'user', 'Usuarios'), t('#/rutas', 'route', 'Rutas'), t('#/config', 'sliders', 'Configuración'))) : null,
    cuentaSesion(ctx)))
}

export function cuentaSesion(ctx) {
  const ios = /iphone|ipad/i.test(navigator.userAgent) && !navigator.standalone;
  const instalado = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  return h('div', { class: 'section' },
    S.install && !instalado ? h('button', { class: 'btn block', style: { marginBottom: '10px' }, on: { click: async () => { S.install.prompt(); await S.install.userChoice; S.install = null; ctx.refresh(); } } }, icon('plus'), 'Instalar la app en este teléfono') : null,
    ios ? h('p', { class: 'muted small' }, 'Para instalar en iPhone: botón Compartir de Safari → "Añadir a pantalla de inicio".') : null,
    h('button', { class: 'btn block', on: { click: () => ctx.salir() } }, icon('logout'), 'Cerrar sesión'),
    h('p', { class: 'muted small', style: { textAlign: 'center', marginTop: '10px' } }, S.profile.nombre + ' · ' + ({ ADMINISTRADOR: 'Administrador', SUPERVISOR: 'Supervisor', COBRADOR: 'Cobrador' })[S.profile.rol]));
}

export async function usuarios(ctx) {
  const { view } = ctx;
  ctx.setTop('Usuarios', { back: '#/mas', actions: [{ icon: 'refresh', label: 'Actualizar', fn: () => ctx.refresh() }] });
  view.replaceChildren(skeleton(4));
  try { await cargarApoyo(); } catch (e) { fail(e); view.replaceChildren(empty('No se pudieron cargar los usuarios', 'Inténtalo de nuevo.')); return; }
  const ROL = { ADMINISTRADOR: 'Administrador', SUPERVISOR: 'Supervisor', COBRADOR: 'Cobrador' };
  view.replaceChildren(h('div', { class: 'stack' },
    h('div', { class: 'ledger' }, S.profiles.slice().sort((a, b) => a.rol.localeCompare(b.rol) || a.nombre.localeCompare(b.nombre)).map((p) => h('button', { class: 'item ' + (p.estado === 'ACTIVO' ? 's-ok' : ''), style: { width: '100%', textAlign: 'left', background: 'none', border: 0 }, on: { click: () => editar(p, ctx) } },
      h('div', { class: 'grow' }, h('div', { class: 'name' }, p.nombre), h('div', { class: 'meta' }, h('span', {}, ROL[p.rol]), h('span', {}, p.email || ''), p.estado !== 'ACTIVO' ? h('span', { class: 'late' }, 'Inactivo') : null)),
      h('span', { class: 'muted' }, icon('edit', 20))))),
    h('div', { class: 'panel' }, h('b', {}, '¿Cómo creo un usuario nuevo?'), h('p', { class: 'muted small', style: { marginTop: '6px' } }, 'Créalo en Supabase: Authentication > Users > Add user (marca Auto Confirm User). Luego vuelve aquí, ábrelo, elige su rol y actívalo.'))));
}
function editar(p, ctx) {
  const nombre = h('input', { type: 'text', value: p.nombre });
  const tel = h('input', { type: 'tel', value: p.telefono || '' });
  const rol = selectEl([['COBRADOR', 'Cobrador'], ['SUPERVISOR', 'Supervisor'], ['ADMINISTRADOR', 'Administrador']], p.rol);
  const estado = segmented([['ACTIVO', 'Activo'], ['INACTIVO', 'Inactivo']], p.estado);
  const ver = segmented([['SI', 'Puede ver cuentas'], ['NO', 'No ve cuentas']], p.ver_cuentas ? 'SI' : 'NO');
  const cuentas = S.cuentas.filter((c) => c.tipo !== 'EFECTIVO' && c.tipo !== 'PAPELERIA');
  const rec = selectEl([['', 'Sin cuenta de recaudo'], ...cuentas.map((c) => [c.id, c.nombre])], p.cuenta_recaudo_id || '');
  // Cuentas en las que este cobrador puede registrar cobros por transferencia (y desembolsos, si es dueño)
  const marcadas = new Set(p.cuentas_permitidas || []);
  const checks = cuentas.map((c) => { const cb = h('input', { type: 'checkbox', value: c.id, style: { width: '20px', height: '20px', flex: 'none' } }); cb.checked = marcadas.has(c.id); return [c, cb]; });
  const cajaCuentas = h('div', { class: 'panel', style: { padding: '8px 12px' } }, checks.length
    ? checks.map(([c, cb]) => h('div', { class: 'row', style: { display: 'flex', gap: '12px', padding: '10px 0', alignItems: 'center', cursor: 'pointer' }, on: { click: (e) => { if (e.target !== cb) cb.checked = !cb.checked; } } }, cb, h('span', { style: { fontWeight: '600' } }, c.nombre, h('span', { class: 'muted small' }, ' · ' + (c.tipo === 'NEQUI' ? 'Nequi' : 'Bancaria')))))
    : h('p', { class: 'muted small' }, 'Aún no hay cuentas bancarias o Nequi creadas.'));
  const cobra = segmented([['NO', 'No'], ['SI', 'Sí, también cobra una ruta']], p.es_cobrador ? 'SI' : 'NO');
  const rutaSolo = segmented([['NO', 'Todos los cobradores'], ['SI', 'Solo mi ruta']], p.ruta_solo_propia ? 'SI' : 'NO');
  const dueno = segmented([['NO', 'No'], ['SI', 'Sí']], p.puede_desembolsar ? 'SI' : 'NO');
  const crearPrest = segmented([['NO', 'No'], ['SI', 'Sí']], p.puede_crear_prestamos ? 'SI' : 'NO');
  const crearCli = segmented([['NO', 'No'], ['SI', 'Sí']], p.puede_crear_clientes ? 'SI' : 'NO');
  const auditar = segmented([['NO', 'No'], ['SI', 'Sí']], p.puede_auditar ? 'SI' : 'NO');
  const abrirCajas = segmented([['NO', 'No'], ['SI', 'Sí']], p.puede_abrir_cajas ? 'SI' : 'NO');
  const verResumen = segmented([['NO', 'No'], ['SI', 'Sí']], p.puede_ver_resumen ? 'SI' : 'NO');
  const gastosPerm = segmented([['SI', 'Sí'], ['NO', 'No']], p.puede_registrar_gastos === false ? 'NO' : 'SI');
  const gastosTr = segmented([['SI', 'Sí'], ['NO', 'No']], p.gastos_transferencia ? 'SI' : 'NO');
  const papEdit = segmented([['NO', 'No: se descuenta el % de la empresa'], ['SI', 'Sí: decide si cobra y cuánto']], p.papeleria_editable ? 'SI' : 'NO');
  const cobraCom = segmented([['SI', 'Sí'], ['NO', 'No']], p.cobra_comision === false ? 'NO' : 'SI');
  const permisos = h('div', { class: 'panel' }, h('div', { class: 'h2' }, 'Permisos del cobrador'),
    h('p', { class: 'hint' }, 'Para cobradores. Todos prestan desde SU caja abierta: sin caja abierta no hay préstamos. Renovar y refinanciar siempre pueden hacerlo.'),
    h('div', { class: 'field' }, h('label', {}, 'Puede crear préstamos nuevos'), crearPrest),
    h('div', { class: 'field' }, h('label', {}, 'Puede crear clientes nuevos'), crearCli, h('p', { class: 'hint' }, 'Los clientes que cree quedan en su ruta.')),
    h('div', { class: 'field' }, h('label', {}, 'Puede desembolsar por transferencia'), dueno,
      h('p', { class: 'hint' }, 'Solo desde las cuentas marcadas arriba en "Cuentas habilitadas". Si es "No", presta únicamente con el efectivo de su caja.')),
    h('div', { class: 'field' }, h('label', {}, 'Puede auditar rutas de otros cobradores'), auditar, h('p', { class: 'hint' }, 'Solo lectura, con filtro de fechas. Le aparece "Auditar rutas" en el menú.')),
    h('div', { class: 'field' }, h('label', {}, 'Puede gestionar cajas (abrir, editar base, cerrar)'), abrirCajas, h('p', { class: 'hint' }, 'Las de otros cobradores y la suya. Le aparece "Cajas del equipo" en el menú.')),
    h('div', { class: 'field' }, h('label', {}, 'Puede ver el resumen de toda la operación'), verResumen, h('p', { class: 'hint' }, 'En Auditar rutas aparece la opción "Todos los cobradores" con los totales juntos.')),
    h('div', { class: 'field' }, h('label', {}, 'Puede registrar gastos'), gastosPerm),
    h('div', { class: 'field' }, h('label', {}, 'Gastos por transferencia'), gastosTr, h('p', { class: 'hint' }, 'Sí: puede registrar gastos pagados por transferencia, solo desde las cuentas que marques arriba en «Cuentas permitidas».')),
    h('div', { class: 'field' }, h('label', {}, 'Papelería al cliente'), papEdit,
      h('p', { class: 'hint' }, '"No": se descuenta siempre el % de la empresa y no ve opciones de papelería ni comisión. "Sí": puede cobrar o no, y fijar un valor en pesos.')),
    h('div', { class: 'field' }, h('label', {}, 'Cobra comisión por papelería'), cobraCom,
      h('p', { class: 'hint' }, '"No": toda su papelería es de la empresa y no genera comisión en su liquidación (útil para el dueño o socios). Aplica también a sus préstamos ya creados.')));
  const verPermisos = () => { permisos.style.display = rol.value === 'COBRADOR' ? '' : 'none'; };
  rol.addEventListener('change', verPermisos); setTimeout(verPermisos, 0);
  sheet(p.nombre, (close) => h('div', {}, h('p', { class: 'muted small', style: { marginBottom: '12px' } }, p.email || ''),
    field('Nombre (como aparece en la app)', nombre), field('Teléfono', tel), field('Rol', rol),
    h('div', { class: 'field' }, h('label', {}, 'Estado'), estado), h('div', { class: 'field' }, h('label', {}, 'Cuentas'), ver),
    h('div', { class: 'field' }, h('label', {}, 'Supervisor que también cobra'), cobra,
      h('p', { class: 'hint' }, 'Solo para supervisores. Si es "Sí", aparece en la lista de cobradores: se le puede asignar una ruta, abrir su caja y ver su resumen, y su Ruta se abre en sus clientes.')),
    h('div', { class: 'field' }, h('label', {}, 'Qué ve en su pestaña Ruta'), rutaSolo,
      h('p', { class: 'hint' }, '"Solo mi ruta": su Ruta sale limpia, solo con sus clientes, sin los de otros cobradores. Los demás módulos de supervisión no cambian.')),
    field('Cuenta de recaudo', rec, 'Donde entran las transferencias que cobre esta persona.'),
    h('div', { class: 'field' }, h('label', {}, 'Cuentas habilitadas para cobros por transferencia'), cajaCuentas,
      h('p', { class: 'hint' }, 'Solo podrá registrar cobros por transferencia en las cuentas marcadas (y en su cuenta de recaudo).')),
    permisos,
    h('button', { class: 'btn primary block', on: { click: (e) => busy(e.currentTarget, async () => {
      if (!clean(nombre.value)) throw new Error('Escribe el nombre.');
      if (p.id === S.profile.id && (estado.get() !== 'ACTIVO' || rol.value !== 'ADMINISTRADOR')) throw new Error('No puedes quitarte tu propio acceso de administrador.');
      await q(sb.from('profiles').update({ nombre: clean(nombre.value), telefono: clean(tel.value) || null, rol: rol.value, estado: estado.get(), ver_cuentas: ver.get() === 'SI', cuenta_recaudo_id: rec.value || null, gastos_transferencia: gastosTr.get() === 'SI', cuentas_permitidas: checks.filter(([, cb]) => cb.checked).map(([c]) => c.id), puede_desembolsar: dueno.get() === 'SI', puede_crear_prestamos: crearPrest.get() === 'SI', puede_crear_clientes: crearCli.get() === 'SI', puede_auditar: auditar.get() === 'SI', puede_ver_resumen: verResumen.get() === 'SI', puede_registrar_gastos: gastosPerm.get() === 'SI', puede_abrir_cajas: abrirCajas.get() === 'SI', papeleria_editable: papEdit.get() === 'SI', cobra_comision: cobraCom.get() === 'SI', es_cobrador: rol.value === 'SUPERVISOR' && cobra.get() === 'SI', ruta_solo_propia: rol.value === 'SUPERVISOR' && cobra.get() === 'SI' && rutaSolo.get() === 'SI' }).eq('id', p.id));
      close(); toast('Usuario actualizado'); ctx.refresh();
    }) } }, 'Guardar')));
}

export async function rutas(ctx) {
  const { view } = ctx;
  ctx.setTop('Rutas', { back: '#/mas', actions: [{ icon: 'refresh', label: 'Actualizar', fn: () => ctx.refresh() }] });
  view.replaceChildren(skeleton(3));
  try { await cargarApoyo(); } catch (e) { fail(e); view.replaceChildren(empty('No se pudieron cargar las rutas', 'Inténtalo de nuevo.')); return; }
  const cobNombre = (id) => (S.profiles.find((x) => x.id === id) || {}).nombre || 'Sin cobrador';
  view.replaceChildren(h('div', { class: 'stack' },
    S.rutas.length ? h('div', { class: 'ledger' }, S.rutas.map((r) => h('button', { class: 'item ' + (r.estado === 'ACTIVA' ? 's-ok' : ''), style: { width: '100%', textAlign: 'left', background: 'none', border: 0 }, on: { click: () => formRuta(r, ctx) } },
      h('div', { class: 'grow' }, h('div', { class: 'name' }, r.nombre), h('div', { class: 'meta' }, h('span', {}, cobNombre(r.cobrador_id)), r.zona ? h('span', {}, r.zona) : null, r.estado !== 'ACTIVA' ? h('span', { class: 'late' }, 'Inactiva') : null)),
      h('span', { class: 'muted' }, icon('edit', 20))))) : empty('Aún no hay rutas', 'Crea una y asígnale un cobrador.'),
    h('button', { class: 'btn primary fab', on: { click: () => formRuta(null, ctx) } }, icon('plus'), 'Nueva ruta')));
}
function formRuta(r, ctx) {
  const nombre = h('input', { type: 'text', value: r ? r.nombre : '', placeholder: 'Ej.: Ruta 3' });
  const zona = h('input', { type: 'text', value: (r && r.zona) || '' });
  const cob = selectEl([['', 'Sin cobrador'], ...S.profiles.filter((p) => esCob(p)).map((p) => [p.id, p.nombre])], (r && r.cobrador_id) || '');
  const estado = segmented([['ACTIVA', 'Activa'], ['INACTIVA', 'Inactiva']], r ? r.estado : 'ACTIVA');
  sheet(r ? 'Editar ruta' : 'Nueva ruta', (close) => h('div', {}, field('Nombre', nombre), field('Zona', zona), field('Cobrador', cob, 'Los clientes de esta ruta se cobran por este cobrador.'), h('div', { class: 'field' }, h('label', {}, 'Estado'), estado),
    h('button', { class: 'btn primary block', on: { click: (e) => busy(e.currentTarget, async () => {
      if (!clean(nombre.value)) throw new Error('Escribe el nombre de la ruta.');
      const datos = { nombre: clean(nombre.value), zona: clean(zona.value) || null, cobrador_id: cob.value || null, estado: estado.get() };
      if (r) {
        await q(sb.from('rutas').update(datos).eq('id', r.id));
        // Si cambió el cobrador, los clientes y préstamos activos de la ruta pasan al nuevo cobrador
        if ((r.cobrador_id || null) !== datos.cobrador_id) await q(sb.rpc('reasignar_ruta', { p_ruta: r.id }));
      } else await q(sb.from('rutas').insert(datos));
      close(); toast('Ruta guardada'); ctx.refresh();
    }) } }, 'Guardar')));
}

const CFG = {
  PCT_PAPELERIA_CLIENTE: ['Papelería al cliente (%)', 'Porcentaje del préstamo que se cobra como papelería.'],
  PCT_COMISION_COBRADOR: ['Comisión del cobrador (%)', 'Parte de la papelería, en % del préstamo, que es del cobrador.'],
  COMISION_INCLUYE_RENOVADOS: ['¿Los renovados pagan comisión?', 'SI o NO.'],
  PAGO_BASE_SEMANAL: ['Pago base semanal (pesos)', 'Se usa en las liquidaciones.'],
  DIARIO_OMITE_DOMINGO: ['¿Las cuotas diarias saltan los domingos?', 'SI o NO. Hoy los domingos se cobran.']
};
export async function config(ctx) {
  const { view } = ctx;
  ctx.setTop('Configuración', { back: '#/mas' });
  view.replaceChildren(skeleton(4));
  try { await cargarApoyo(); } catch (e) { fail(e); view.replaceChildren(empty('No se pudo cargar', 'Inténtalo de nuevo.')); return; }
  const inputs = {};
  const campos = Object.entries(CFG).map(([k, [t, d]]) => {
    const yn = k === 'COMISION_INCLUYE_RENOVADOS' || k === 'DIARIO_OMITE_DOMINGO';
    inputs[k] = yn ? selectEl([['SI', 'Sí'], ['NO', 'No']], S.cfg[k] || 'NO') : h('input', { type: 'text', inputmode: 'decimal', value: S.cfg[k] || '' });
    return field(t, inputs[k], d);
  });
  const empresa = h('input', { type: 'text', value: S.cfg.EMPRESA_NOMBRE || '', placeholder: 'Ej.: Las Flores', maxlength: '60' });
  campos.unshift(field('Nombre de la empresa', empresa, 'Aparece en el menú de la app.'));
  view.replaceChildren(h('div', { class: 'stack' }, h('div', { class: 'panel' }, campos,
    h('button', { class: 'btn primary block', on: { click: (e) => busy(e.currentTarget, async () => {
      for (const k of Object.keys(CFG)) {
        const v = clean(inputs[k].value).replace(',', '.');
        if (!v) throw new Error('Completa todos los valores.');
        await q(sb.from('configuracion').update({ valor: v }).eq('clave', k));
      }
      await q(sb.from('configuracion').upsert({ clave: 'EMPRESA_NOMBRE', valor: clean(empresa.value), descripcion: 'Nombre de la empresa que usa la app' }));
      await cargarApoyo(); toast('Configuración guardada');
    }) } }, 'Guardar'))));
}

// Actividad: todo lo que hacen los usuarios y mueve valores (préstamos, cobros, gastos, cajas, retiros, transferencias…)
export async function actividad(ctx) {
  const { view } = ctx;
  ctx.setTop('Actividad', { back: '#/mas', actions: [{ icon: 'refresh', label: 'Actualizar', fn: () => ctx.refresh() }] });
  try { await cargarApoyo(); } catch (e) { fail(e); }
  const desde = h('input', { type: 'date', value: addDays(hoyCO(), -7) });
  const hasta = h('input', { type: 'date', value: hoyCO() });
  const quien = selectEl([['', 'Todos los usuarios'], ...S.profiles.filter((p) => p.estado === 'ACTIVO').map((p) => [p.id, p.nombre])], '');
  const out = h('div', {});
  [desde, hasta, quien].forEach((e) => e.addEventListener('change', () => cargar()));
  view.replaceChildren(h('div', { class: 'stack' }, h('div', { class: 'grid2' }, field('Desde', desde), field('Hasta', hasta)), field('Usuario', quien), out));
  async function cargar() {
    out.replaceChildren(skeleton(4));
    try {
      const rows = await q(sb.rpc('actividad', { p_desde: desde.value, p_hasta: hasta.value, p_usuario: quien.value || null }));
      if (!rows.length) { out.replaceChildren(empty('Sin movimientos en este rango', 'Aquí aparece todo lo que se registra: préstamos, cobros, gastos, cajas, retiros y transferencias.')); return; }
      out.replaceChildren(h('div', { class: 'panel' }, rows.map((r) => h('div', { class: 'line' },
        h('div', { class: 'grow' }, h('b', {}, r.accion), r.detalle ? h('div', { class: 'small' }, r.detalle) : null,
          h('div', { class: 'small muted' }, fdate(new Date(r.fecha_hora).toLocaleDateString('sv-SE', { timeZone: 'America/Bogota' })) + ' ' + ftime(r.fecha_hora) + ' · ' + r.usuario)),
        r.monto != null ? h('div', { class: 'amt' }, money(r.monto)) : null))));
    } catch (e) { fail(e); out.replaceChildren(empty('No se pudo cargar', 'Inténtalo de nuevo.')); }
  }
  cargar();
}


// ---------------------------------------------------------------- Auditar rutas (solo lectura, con rango de fechas)
const AUD = { cob: null, vista: 'hoy', desde: null, hasta: null };
const Lr = (a, b, bold) => h('div', { class: 'line' }, h(bold ? 'b' : 'span', { class: 'grow' }, a), h(bold ? 'b' : 'span', { class: 'amt' }, b));
export async function auditoria(ctx) {
  const { view } = ctx;
  if (!(isStaffP() || S.profile.puede_auditar)) { location.hash = '#/ruta'; return; }
  ctx.setTop('Auditar rutas', { back: isStaffP() ? '#/mas' : '#/ruta', actions: [{ icon: 'refresh', label: 'Actualizar', fn: () => ctx.refresh() }] });
  view.replaceChildren(skeleton(5));
  let cobs;
  try { cobs = await q(sb.rpc('auditoria_cobradores')); } catch (e) { fail(e); view.replaceChildren(empty('No se pudo cargar', 'Inténtalo de nuevo.')); return; }
  if (!cobs.length) { view.replaceChildren(empty('No hay otros cobradores', 'Aquí aparecen las rutas de los demás cobradores para consultarlas.')); return; }
  const todos = isStaffP() || !!S.profile.puede_ver_resumen;
  if (AUD.cob !== 'ALL' || !todos) { if (!cobs.find((c) => c.id === AUD.cob)) AUD.cob = cobs[0].id; }
  const nomCob = (id) => (cobs.find((c) => c.id === id) || { nombre: id === S.profile.id ? S.profile.nombre : '' }).nombre;
  if (!AUD.desde) { AUD.desde = hoyCO(); AUD.hasta = hoyCO(); }
  const sel = selectEl([...(todos ? [['ALL', 'Todos los cobradores']] : []), ...cobs.map((c) => [c.id, c.nombre])], AUD.cob, { 'aria-label': 'Cobrador', on: { change: (e) => { AUD.cob = e.target.value; cargar(); } } });
  const dDesde = h('input', { type: 'date', value: AUD.desde, max: hoyCO(), 'aria-label': 'Desde' }), dHasta = h('input', { type: 'date', value: AUD.hasta, max: hoyCO(), 'aria-label': 'Hasta' });
  const rango = (a, b) => { AUD.desde = a; AUD.hasta = b; dDesde.value = a; dHasta.value = b; cargar(); };
  const chip = (t, fn) => h('button', { type: 'button', class: 'btn small', on: { click: fn } }, t);
  const out = h('div', { class: 'stack' });
  dDesde.addEventListener('change', () => { if (dDesde.value) { AUD.desde = dDesde.value; if (AUD.hasta < AUD.desde) { AUD.hasta = AUD.desde; dHasta.value = AUD.hasta; } cargar(); } });
  dHasta.addEventListener('change', () => { if (dHasta.value) { AUD.hasta = dHasta.value; if (AUD.desde > AUD.hasta) { AUD.desde = AUD.hasta; dDesde.value = AUD.desde; } cargar(); } });
  view.replaceChildren(h('div', { class: 'stack' }, h('div', { class: 'panel' }, field('Ruta del cobrador', sel),
    h('div', { class: 'grid2' }, field('Desde', dDesde), field('Hasta', dHasta)),
    h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } }, chip('Hoy', () => rango(hoyCO(), hoyCO())), chip('Ayer', () => rango(addDays(hoyCO(), -1), addDays(hoyCO(), -1))),
      chip('Últimos 7 días', () => rango(addDays(hoyCO(), -6), hoyCO())), chip('Este mes', () => rango(hoyCO().slice(0, 8) + '01', hoyCO()))),
    h('p', { class: 'hint' }, 'Solo consulta: desde aquí no se cambia nada. Toca cualquier dato para ver el detalle.')), out));
  const tot = (arr, k) => arr.reduce((a, r) => a + Number(r[k] || 0), 0);
  async function cargar() {
    out.replaceChildren(skeleton(4));
    let d;
    try { d = await q(sb.rpc('auditoria_ruta', { p_cobrador: AUD.cob === 'ALL' ? null : AUD.cob, p_desde: AUD.desde, p_hasta: AUD.hasta })); } catch (e) { fail(e); out.replaceChildren(empty('No se pudo cargar la ruta', 'Revisa las fechas e inténtalo de nuevo.')); return; }
    const rows = d.ruta, pagos = d.pagos.filter((p) => p.estado === 'VIGENTE'), prest = d.prestamos, gas = d.gastos, cajas = d.cajas;
    const porCobrar = rows.filter((r) => Number(r.valor_a_cobrar || 0) > 0), pagados = rows.filter((r) => r.pagado_hoy), atras = rows.filter((r) => r.atrasado), hoy = rows.filter((r) => r.es_hoy);
    const sets = { hoy, atrasados: atras, pagados, todos: rows };
    const lista = h('div', {}), tabs = h('div', { class: 'tabs', role: 'tablist' });
    const tile = (cls, v, t, fn) => h('button', { class: 'stat tap ' + cls, type: 'button', on: { click: fn } }, h('div', { class: 'v' }, v), h('div', { class: 'l' }, t));
    const nombrePago = (p) => h('div', { class: 'item' }, h('div', { class: 'grow' }, h('div', { class: 'name' }, p.cliente), h('div', { class: 'meta' }, h('span', {}, fdate(p.fecha)), h('span', {}, ftime(p.hora)), h('span', {}, p.metodo.toLowerCase()), p.estado !== 'VIGENTE' ? h('span', { class: 'late' }, 'anulado') : null)), h('div', { class: 'amt' }, money(p.valor)));
    const filaPrest = (p) => h('button', { type: 'button', class: 'item', style: { width: '100%', textAlign: 'left', background: 'none', border: 0 }, on: { click: () => detallePrest(p.prestamo_id, p.cliente) } },
      h('div', { class: 'grow' }, h('div', { class: 'name' }, p.cliente), h('div', { class: 'meta' }, h('span', {}, fdate(p.fecha)), h('span', {}, p.tipo.toLowerCase()), h('span', {}, p.medio.toLowerCase()), Number(p.papeleria) ? h('span', {}, 'papelería ' + money(p.papeleria)) : null)),
      h('div', { class: 'plate' }, money(p.valor), h('small', {}, 'entregó ' + money(p.entregado))));
    const filaGasto = (g) => h('div', { class: 'item' }, h('div', { class: 'grow' }, h('div', { class: 'name' }, g.categoria), h('div', { class: 'meta' }, h('span', {}, fdate(g.fecha)), g.descripcion ? h('span', {}, g.descripcion) : null, h('span', {}, g.metodo.toLowerCase()))), h('div', { class: 'amt' }, money(g.valor)));
    const lstPagos = (t, items) => sheet(t, () => items.length ? h('div', { class: 'ledger' }, items.map(nombrePago)) : h('p', { class: 'muted' }, 'No hay registros.'));
    const lstPrest = (t, items) => sheet(t, () => items.length ? h('div', { class: 'ledger' }, items.map(filaPrest)) : h('p', { class: 'muted' }, 'No hay registros.'));
    const lstGas = (t, items) => sheet(t, () => items.length ? h('div', { class: 'ledger' }, items.map(filaGasto)) : h('p', { class: 'muted' }, 'No hay registros.'));
    const lstRuta = (t, items, campo) => sheet(t, () => items.length ? h('div', { class: 'ledger' }, items.map((r) => h('button', { type: 'button', class: 'item', style: { width: '100%', textAlign: 'left', background: 'none', border: 0 }, on: { click: () => detallePrest(r.prestamo_id, r.nombre_completo) } },
      h('div', { class: 'grow' }, h('div', { class: 'name' }, r.nombre_completo), h('div', { class: 'meta' }, r.barrio ? h('span', {}, r.barrio) : null)), h('div', { class: 'amt' }, campo ? money(r[campo]) : (r.dias_atraso + ' d'))))) : h('p', { class: 'muted' }, 'No hay registros.'));
    async function detallePrest(id, nombre) {
      sheet(nombre, () => { const box = h('div', {}, skeleton(3)); (async () => {
        try {
          const x = await q(sb.rpc('auditoria_prestamo', { p_prestamo: id })), r = rows.find((z) => z.prestamo_id === id), cu = x.cuotas, pg = x.pagos;
          const pagadas = cu.filter((c) => c.estado === 'PAGADA').length;
          box.replaceChildren(h('div', { class: 'stack' },
            r ? h('div', { class: 'panel' }, Lr('Saldo del préstamo', money(r.saldo), true), Lr('Cuota', money(r.valor_cuota)), Lr('Cuotas pagadas', pagadas + ' de ' + cu.length), Lr('Por cobrar hoy', money(r.valor_a_cobrar)),
              r.atrasado ? Lr('Atraso', r.dias_atraso + ' días · ' + r.cuotas_atrasadas + ' cuotas') : null, r.telefono ? Lr('Teléfono', r.telefono) : null, r.direccion ? Lr('Dirección', r.direccion) : null) : h('div', { class: 'panel' }, Lr('Cuotas pagadas', pagadas + ' de ' + cu.length)),
            h('div', { class: 'section' }, h('h3', {}, 'Últimos pagos'), pg.length ? h('div', { class: 'ledger' }, pg.map((p) => h('div', { class: 'item' }, h('div', { class: 'grow' }, h('div', { class: 'name' }, fdate(p.fecha_pago)), h('div', { class: 'meta' }, h('span', {}, p.metodo.toLowerCase()), p.estado_pago !== 'VIGENTE' ? h('span', { class: 'late' }, 'anulado') : null)), h('div', { class: 'amt' }, money(p.valor))))) : h('p', { class: 'muted' }, 'Sin pagos registrados.')),
            h('div', { class: 'section' }, h('h3', {}, 'Cuotas'), h('div', { class: 'ledger' }, cu.map((c) => h('div', { class: 'item ' + (c.estado === 'PAGADA' ? 's-ok' : (c.fecha_programada < hoyCO() ? 's-late' : '')) }, h('div', { class: 'grow' }, h('div', { class: 'name' }, 'Cuota ' + c.numero + ' · ' + fdate(c.fecha_programada)), h('div', { class: 'meta' }, h('span', {}, c.estado.toLowerCase()))), h('div', { class: 'amt' }, money(c.valor_pagado) + ' / ' + money(c.valor_programado))))))));
        } catch (e) { box.replaceChildren(h('p', { class: 'err' }, 'No se pudo cargar el detalle.')); }
      })(); return box; });
    }
    // Movimientos agrupados por día
    const dias = [...new Set([...d.pagos.map((p) => p.fecha), ...prest.map((p) => p.fecha), ...gas.map((g) => g.fecha), ...cajas.map((c) => c.fecha)])].sort().reverse();
    const cajaDia = (f) => { const l = cajas.filter((c) => c.fecha === f); if (!l.length) return null; if (l.length === 1) return l[0]; const n = (k) => l.reduce((a, c) => a + Number(c[k] || 0), 0); const ab = l.some((c) => c.estado === 'ABIERTA'); return { fecha: f, estado: ab ? 'ABIERTA' : 'CERRADA', base_inicial: n('base_inicial'), cobros_efectivo: n('cobros_efectivo'), prestado_efectivo: n('prestado_efectivo'), gastos: n('gastos'), esperado: n('esperado'), entregado: n('entregado'), diferencia: n('diferencia') }; };
    function detalleDia(f) {
      const cj = cajaDia(f), pg = d.pagos.filter((p) => p.fecha === f), pr = prest.filter((p) => p.fecha === f), gs = gas.filter((g) => g.fecha === f);
      sheet(fdate(f, true), () => h('div', { class: 'stack' },
        cj ? h('div', { class: 'panel' }, h('h3', {}, 'Caja'), Lr('Estado', cj.estado === 'ABIERTA' ? 'Abierta' : 'Cerrada'), Lr('Base', money(cj.base_inicial)), Lr('Cobros en efectivo', money(cj.cobros_efectivo)), Lr('Prestado en efectivo', '− ' + money(cj.prestado_efectivo)),
          Lr('Gastos', '− ' + money(cj.gastos)), cj.estado === 'CERRADA' ? Lr('Esperado', money(cj.esperado), true) : null, cj.estado === 'CERRADA' ? Lr('Entregó', money(cj.entregado)) : null,
          cj.estado === 'CERRADA' ? Lr('Diferencia', Number(cj.diferencia) === 0 ? 'Cuadrada' : money(cj.diferencia)) : null) : h('div', { class: 'panel' }, h('p', { class: 'muted' }, 'Sin caja ese día.')),
        h('div', { class: 'section' }, h('h3', {}, 'Cobros · ' + money(tot(pg.filter((p) => p.estado === 'VIGENTE'), 'valor'))), pg.length ? h('div', { class: 'ledger' }, pg.map(nombrePago)) : h('p', { class: 'muted' }, 'Sin cobros.')),
        h('div', { class: 'section' }, h('h3', {}, 'Préstamos · ' + money(tot(pr, 'valor'))), pr.length ? h('div', { class: 'ledger' }, pr.map(filaPrest)) : h('p', { class: 'muted' }, 'Sin préstamos.')),
        h('div', { class: 'section' }, h('h3', {}, 'Gastos · ' + money(tot(gs, 'valor'))), gs.length ? h('div', { class: 'ledger' }, gs.map(filaGasto)) : h('p', { class: 'muted' }, 'Sin gastos.'))));
    }
    function fila(r) {
      const debe = Number(r.valor_a_cobrar || 0);
      return h('button', { type: 'button', class: 'item ' + (debe > 0 ? (r.atrasado ? 's-late' : 's-hoy') : (r.pagado_hoy ? 's-ok' : '')), style: { width: '100%', textAlign: 'left', background: 'none', border: 0 }, on: { click: () => detallePrest(r.prestamo_id, r.nombre_completo) } },
        h('div', { class: 'grow' }, h('div', { class: 'name' }, r.nombre_completo), h('div', { class: 'meta' }, r.barrio ? h('span', {}, r.barrio) : null, h('span', {}, r.modalidad.toLowerCase()), r.atrasado ? h('span', { class: 'late' }, r.dias_atraso + ' d de atraso') : null, AUD.cob === 'ALL' ? h('span', {}, nomCob(r.cobrador_id)) : null)),
        h('div', { class: 'plate ' + (debe > 0 ? '' : r.pagado_hoy ? 'paid' : 'quiet') }, money(debe > 0 ? debe : r.pagado_hoy ? r.cobrado_hoy : r.valor_cuota), h('small', {}, debe > 0 ? 'por cobrar' : r.pagado_hoy ? 'pagó hoy' : 'cuota')));
    }
    function pintar() {
      tabs.replaceChildren(...[['hoy', 'Hoy'], ['atrasados', 'Atrasados'], ['pagados', 'Pagados'], ['todos', 'Todos']].map(([v, t]) =>
        h('button', { class: AUD.vista === v ? 'on' : '', role: 'tab', on: { click: () => { AUD.vista = v; pintar(); } } }, t, h('b', {}, String(sets[v].length)))));
      const it = sets[AUD.vista];
      lista.replaceChildren(it.length ? h('div', { class: 'ledger' }, it.map(fila)) : empty('Sin registros', 'No hay clientes en esta lista.'));
    }
    const mismo = AUD.desde === AUD.hasta;
    const et = mismo ? fdate(AUD.desde, true) : fdate(AUD.desde) + ' al ' + fdate(AUD.hasta);
    const difs = cajas.filter((c) => c.estado === 'CERRADA').reduce((a, c) => a + Number(c.diferencia || 0), 0);
    out.replaceChildren(
      h('div', { class: 'section' }, h('h3', {}, 'Movimientos · ' + et),
        h('div', { class: 'strip' }, tile('good', money(tot(pagos, 'valor')), 'Cobrado (' + pagos.length + ')', () => lstPagos('Cobros · ' + et, d.pagos)),
          tile('', money(tot(prest, 'valor')), 'Prestado (' + prest.length + ')', () => lstPrest('Préstamos · ' + et, prest))),
        h('div', { class: 'strip' }, tile('', money(tot(gas, 'valor')), 'Gastos (' + gas.length + ')', () => lstGas('Gastos · ' + et, gas)),
          tile(difs === 0 ? '' : 'bad', difs === 0 ? 'Cuadradas' : money(difs), 'Cajas (' + cajas.length + ') · diferencia', () => sheet('Cajas · ' + et, () => cajas.length ? h('div', { class: 'ledger' }, cajas.slice().reverse().map((c) => h('button', { type: 'button', class: 'item', style: { width: '100%', textAlign: 'left', background: 'none', border: 0 }, on: { click: () => detalleDia(c.fecha) } },
            h('div', { class: 'grow' }, h('div', { class: 'name' }, fdate(c.fecha)), h('div', { class: 'meta' }, h('span', {}, c.estado === 'ABIERTA' ? 'abierta' : 'cerrada'))), h('div', { class: 'amt' }, c.estado === 'CERRADA' ? (Number(c.diferencia) === 0 ? 'cuadrada' : money(c.diferencia)) : money(c.base_inicial))))) : h('p', { class: 'muted' }, 'Sin cajas en el rango.')))),
        dias.length ? h('div', { class: 'ledger' }, dias.map((f) => {
          const pg = d.pagos.filter((p) => p.fecha === f && p.estado === 'VIGENTE'), pr = prest.filter((p) => p.fecha === f), gs = gas.filter((g) => g.fecha === f), cj = cajaDia(f);
          return h('button', { type: 'button', class: 'item', style: { width: '100%', textAlign: 'left', background: 'none', border: 0 }, on: { click: () => detalleDia(f) } },
            h('div', { class: 'grow' }, h('div', { class: 'name' }, fdate(f, true)), h('div', { class: 'meta' }, h('span', {}, 'cobró ' + money(tot(pg, 'valor'))), h('span', {}, pr.length + ' préstamos'), h('span', {}, 'gastos ' + money(tot(gs, 'valor'))))),
            h('div', { class: 'plate ' + (cj && cj.estado === 'CERRADA' && Number(cj.diferencia) !== 0 ? '' : 'quiet') }, cj ? (cj.estado === 'ABIERTA' ? 'Abierta' : Number(cj.diferencia) === 0 ? 'Cuadrada' : money(cj.diferencia)) : 'Sin caja', h('small', {}, 'caja')));
        })) : empty('Sin movimientos', 'No hay cobros, préstamos ni gastos en esas fechas.')),
      h('div', { class: 'section' }, h('h3', {}, 'Estado actual de la ruta'),
        h('div', { class: 'strip' }, tile('', money(tot(rows, 'valor_a_cobrar')), 'Falta por cobrar hoy', () => lstRuta('Falta por cobrar · ' + money(tot(rows, 'valor_a_cobrar')), porCobrar, 'valor_a_cobrar')),
          tile('good', money(tot(rows, 'cobrado_hoy')), 'Cobrado hoy', () => lstRuta('Cobrado hoy · ' + money(tot(rows, 'cobrado_hoy')), pagados, 'cobrado_hoy'))),
        h('div', { class: 'strip' }, tile('', String(atras.length), 'Atrasados', () => lstRuta('Atrasados', atras.slice().sort((a, b) => b.dias_atraso - a.dias_atraso), null)),
          tile('', money(tot(rows, 'saldo')), 'Cartera activa (' + rows.filter((r) => r.estado === 'ACTIVO').length + ')', () => lstRuta('Cartera activa · ' + money(tot(rows, 'saldo')), rows.filter((r) => r.estado === 'ACTIVO'), 'saldo'))),
        tabs, lista));
    pintar();
  }
  cargar();
}
const isStaffP = () => S.profile.rol === 'ADMINISTRADOR' || S.profile.rol === 'SUPERVISOR';

// ---------------------------------------------------------------- Cajas del equipo (cobrador con permiso: abrir, editar base y cerrar la caja de OTROS)
export async function cajasEquipo(ctx) {
  const { view } = ctx;
  if (!(isStaffP() || S.profile.puede_abrir_cajas)) { location.hash = '#/ruta'; return; }
  ctx.setTop('Cajas del equipo', { sub: fdate(hoyCO(), true), actions: [{ icon: 'refresh', label: 'Actualizar', fn: () => ctx.refresh() }] });
  view.replaceChildren(skeleton(4));
  let eq;
  try { eq = await q(sb.rpc('cajas_equipo', { p_fecha: hoyCO() })); } catch (e) { fail(e); view.replaceChildren(empty('No se pudo cargar', 'Inténtalo de nuevo.')); return; }
  if (!eq.length) { view.replaceChildren(empty('No hay cobradores', 'Cuando existan, aquí abres y cierras sus cajas.')); return; }
  const base = (ini) => { const m = moneyInput({ 'aria-label': 'Base' }); if (ini) m.value = Number(ini).toLocaleString('es-CO'); return m; };
  const card = (c) => {
    const estado = !c.caja_id ? 'Sin abrir' : c.estado === 'ABIERTA' ? 'Abierta' : 'Cerrada';
    return h('div', { class: 'panel' }, h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('b', {}, c.nombre + (c.propia ? ' (tú)' : '')), h('span', { class: 'chip' }, estado)),
      c.caja_id ? Lr('Base', money(c.base_inicial)) : null,
      c.caja_id ? Lr(c.estado === 'ABIERTA' ? 'Debe tener en efectivo' : 'Esperado', money(c.esperado), true) : null,
      c.estado === 'CERRADA' ? Lr('Entregó', money(c.dinero_entregado) + (Number(c.diferencia) === 0 ? ' · cuadrada' : ' · diferencia ' + money(c.diferencia))) : null,
      !c.caja_id ? h('button', { class: 'btn primary block', on: { click: () => sheet('Abrir caja · ' + c.nombre, () => { const m = base(0); return h('div', { class: 'stack' }, field('Base entregada', m, 'Dinero en efectivo que le entregas hoy para prestar y operar.'),
        h('button', { class: 'btn primary block', on: { click: (e) => busy(e.currentTarget, async () => { await q(sb.rpc('abrir_caja', { p_cobrador: c.cobrador_id, p_base: moneyVal(m) || 0, p_fecha: hoyCO() })); toast('Caja abierta'); ctx.refresh(); }) } }, 'Abrir caja')); }) } }, 'Abrir caja') : null,
      c.estado === 'ABIERTA' ? h('div', { class: 'row', style: { gap: '8px' } },
        h('button', { class: 'btn', on: { click: () => sheet('Editar base · ' + c.nombre, () => { const m = base(c.base_inicial); return h('div', { class: 'stack' }, field('Nueva base', m, 'Si le das más dinero para prestar, súmalo aquí.'),
          h('button', { class: 'btn primary block', on: { click: (e) => busy(e.currentTarget, async () => { await q(sb.rpc('editar_caja', { p_caja: c.caja_id, p_base: moneyVal(m) || 0 })); toast('Base actualizada'); ctx.refresh(); }) } }, 'Guardar base')); }) } }, 'Editar base'),
        h('button', { class: 'btn primary', on: { click: () => sheet('Cerrar caja · ' + c.nombre, () => { const m = base(0); return h('div', { class: 'stack' }, h('div', { class: 'panel' }, Lr('Debe entregar', money(c.esperado), true)), field('Dinero que entrega', m, 'Cuenta el efectivo antes de cerrar.'),
          h('button', { class: 'btn primary block', on: { click: (e) => busy(e.currentTarget, async () => { const dif = moneyVal(m) - Number(c.esperado); if (dif !== 0 && !confirm('La diferencia es ' + money(dif) + '. ¿Cerrar de todas formas?')) return; await q(sb.rpc('cerrar_caja', { p_caja: c.caja_id, p_entregado: moneyVal(m) || 0 })); toast('Caja cerrada'); ctx.refresh(); }) } }, 'Cerrar caja')); }) } }, 'Cerrar caja')) : null);
  };
  view.replaceChildren(h('div', { class: 'stack' }, h('p', { class: 'hint' }, 'Aquí abres, ajustas y cierras la caja de los cobradores, incluida la tuya.'), ...eq.map(card)));
}
