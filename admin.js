// Administración (solo administrador): usuarios, rutas y configuración. Más el menú "Más".
import { h, icon, money, fdate, ftime, hoyCO, addDays, toast, fail, busy, empty, skeleton, sheet, field, selectEl, segmented, clean } from './lib.js';
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
  const papEdit = segmented([['NO', 'No: se descuenta el % de la empresa'], ['SI', 'Sí: decide si cobra y cuánto']], p.papeleria_editable ? 'SI' : 'NO');
  const permisos = h('div', { class: 'panel' }, h('div', { class: 'h2' }, 'Permisos del cobrador'),
    h('p', { class: 'hint' }, 'Para cobradores. Todos prestan desde SU caja abierta: sin caja abierta no hay préstamos. Renovar y refinanciar siempre pueden hacerlo.'),
    h('div', { class: 'field' }, h('label', {}, 'Puede crear préstamos nuevos'), crearPrest),
    h('div', { class: 'field' }, h('label', {}, 'Puede crear clientes nuevos'), crearCli, h('p', { class: 'hint' }, 'Los clientes que cree quedan en su ruta.')),
    h('div', { class: 'field' }, h('label', {}, 'Puede desembolsar por transferencia'), dueno,
      h('p', { class: 'hint' }, 'Solo desde las cuentas marcadas arriba en "Cuentas habilitadas". Si es "No", presta únicamente con el efectivo de su caja.')),
    h('div', { class: 'field' }, h('label', {}, 'Papelería al cliente'), papEdit,
      h('p', { class: 'hint' }, '"No": se descuenta siempre el % de la empresa y no ve opciones de papelería ni comisión. "Sí": puede cobrar o no, y fijar un valor en pesos.')));
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
      await q(sb.from('profiles').update({ nombre: clean(nombre.value), telefono: clean(tel.value) || null, rol: rol.value, estado: estado.get(), ver_cuentas: ver.get() === 'SI', cuenta_recaudo_id: rec.value || null, cuentas_permitidas: checks.filter(([, cb]) => cb.checked).map(([c]) => c.id), puede_desembolsar: dueno.get() === 'SI', puede_crear_prestamos: crearPrest.get() === 'SI', puede_crear_clientes: crearCli.get() === 'SI', papeleria_editable: papEdit.get() === 'SI', es_cobrador: rol.value === 'SUPERVISOR' && cobra.get() === 'SI', ruta_solo_propia: rol.value === 'SUPERVISOR' && cobra.get() === 'SI' && rutaSolo.get() === 'SI' }).eq('id', p.id));
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


// ---------------------------------------------------------------- Auditar rutas (solo lectura)
const AUD = { cob: null, vista: 'hoy' };
export async function auditoria(ctx) {
  const { view } = ctx;
  ctx.setTop('Auditar rutas', { back: '#/mas', sub: fdate(hoyCO(), true), actions: [{ icon: 'refresh', label: 'Actualizar', fn: () => ctx.refresh() }] });
  view.replaceChildren(skeleton(5));
  const cobs = S.profiles.filter((p) => esCob(p) && p.estado === 'ACTIVO' && p.id !== S.profile.id);
  if (!cobs.length) { view.replaceChildren(empty('No hay otros cobradores', 'Aquí aparecen las rutas de los demás cobradores para consultarlas.')); return; }
  if (!cobs.find((c) => c.id === AUD.cob)) AUD.cob = cobs[0].id;
  const sel = selectEl(cobs.map((c) => [c.id, c.nombre]), AUD.cob, { 'aria-label': 'Cobrador', on: { change: (e) => { AUD.cob = e.target.value; cargar(); } } });
  const out = h('div', { class: 'stack' });
  view.replaceChildren(h('div', { class: 'stack' }, h('div', { class: 'panel' }, field('Ruta del cobrador', sel), h('p', { class: 'hint' }, 'Solo consulta: desde aquí no se cambia nada. Toca cualquier dato para ver el detalle.')), out));
  const norm = (x) => String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  async function cargar() {
    out.replaceChildren(skeleton(4));
    let rows, cj;
    try {
      [rows, cj] = await Promise.all([
        q(sb.from('v_ruta').select('*').eq('cobrador_id', AUD.cob).order('nombre_completo')),
        q(sb.from('cajas').select('*').eq('cobrador_id', AUD.cob).eq('fecha', hoyCO()).maybeSingle())
      ]);
    } catch (e) { fail(e); out.replaceChildren(empty('No se pudo cargar la ruta', 'Inténtalo de nuevo.')); return; }
    const tot = (arr, k) => arr.reduce((a, r) => a + Number(r[k] || 0), 0);
    const porCobrar = rows.filter((r) => Number(r.valor_a_cobrar || 0) > 0), pagados = rows.filter((r) => r.pagado_hoy), atras = rows.filter((r) => r.atrasado), hoy = rows.filter((r) => r.es_hoy);
    const sets = { hoy, atrasados: atras, pagados, todos: rows };
    const lista = h('div', {}), tabs = h('div', { class: 'tabs', role: 'tablist' });
    const tile = (cls, v, t, fn) => h('button', { class: 'stat tap ' + cls, type: 'button', on: { click: fn } }, h('div', { class: 'v' }, v), h('div', { class: 'l' }, t));
    function pintar() {
      tabs.replaceChildren(...[['hoy', 'Hoy'], ['atrasados', 'Atrasados'], ['pagados', 'Pagados'], ['todos', 'Todos']].map(([v, t]) =>
        h('button', { class: AUD.vista === v ? 'on' : '', role: 'tab', on: { click: () => { AUD.vista = v; pintar(); } } }, t, h('b', {}, String(sets[v].length)))));
      const it = sets[AUD.vista];
      lista.replaceChildren(it.length ? h('div', { class: 'ledger' }, it.map((r) => fila(r))) : empty('Sin registros', 'No hay clientes en esta lista.'));
    }
    function fila(r) {
      const debe = Number(r.valor_a_cobrar || 0);
      return h('button', { type: 'button', class: 'item ' + (debe > 0 ? (r.atrasado ? 's-late' : 's-hoy') : (r.pagado_hoy ? 's-ok' : '')), style: { width: '100%', textAlign: 'left', background: 'none', border: 0 }, on: { click: () => detalle(r) } },
        h('div', { class: 'grow' }, h('div', { class: 'name' }, r.nombre_completo), h('div', { class: 'meta' }, r.barrio ? h('span', {}, r.barrio) : null, h('span', {}, r.modalidad.toLowerCase()), r.atrasado ? h('span', { class: 'late' }, r.dias_atraso + ' d de atraso') : null)),
        h('div', { class: 'plate ' + (debe > 0 ? '' : r.pagado_hoy ? 'paid' : 'quiet') }, money(debe > 0 ? debe : r.pagado_hoy ? r.cobrado_hoy : r.valor_cuota), h('small', {}, debe > 0 ? 'por cobrar' : r.pagado_hoy ? 'pagó hoy' : 'cuota')));
    }
    function lst(titulo, items, campo) {
      sheet(titulo, () => items.length ? h('div', { class: 'ledger' }, items.map((r) => h('button', { type: 'button', class: 'item', style: { width: '100%', textAlign: 'left', background: 'none', border: 0 }, on: { click: () => detalle(r) } },
        h('div', { class: 'grow' }, h('div', { class: 'name' }, r.nombre_completo), h('div', { class: 'meta' }, r.barrio ? h('span', {}, r.barrio) : null)), h('div', { class: 'amt' }, campo ? money(r[campo]) : (r.dias_atraso + ' d'))))) : h('p', { class: 'muted' }, 'No hay registros.'));
    }
    async function detalle(r) {
      sheet(r.nombre_completo, () => { const box = h('div', {}, skeleton(3)); (async () => {
        try {
          const [cu, pg] = await Promise.all([
            q(sb.from('cuotas').select('numero,fecha_programada,valor_programado,valor_pagado,estado').eq('prestamo_id', r.prestamo_id).order('numero')),
            q(sb.from('pagos').select('fecha_pago,valor,metodo,estado_pago').eq('prestamo_id', r.prestamo_id).order('hora_pago', { ascending: false }).limit(8))
          ]);
          const L = (a, b, bold) => h('div', { class: 'line' }, h(bold ? 'b' : 'span', { class: 'grow' }, a), h(bold ? 'b' : 'span', { class: 'amt' }, b));
          const pagadas = cu.filter((c) => c.estado === 'PAGADA').length;
          box.replaceChildren(h('div', { class: 'stack' },
            h('div', { class: 'panel' }, L('Saldo del préstamo', money(r.saldo), true), L('Cuota', money(r.valor_cuota)), L('Cuotas pagadas', pagadas + ' de ' + cu.length), L('Por cobrar hoy', money(r.valor_a_cobrar)),
              r.atrasado ? L('Atraso', r.dias_atraso + ' días · ' + r.cuotas_atrasadas + ' cuotas') : null, L('Cobrado hoy', money(r.cobrado_hoy)),
              r.telefono ? L('Teléfono', r.telefono) : null, r.direccion ? L('Dirección', r.direccion) : null),
            h('div', { class: 'section' }, h('h3', {}, 'Últimos pagos'), pg.length ? h('div', { class: 'ledger' }, pg.map((p) => h('div', { class: 'item' }, h('div', { class: 'grow' }, h('div', { class: 'name' }, fdate(p.fecha_pago)), h('div', { class: 'meta' }, h('span', {}, p.metodo.toLowerCase()), p.estado_pago !== 'VIGENTE' ? h('span', { class: 'late' }, p.estado_pago.toLowerCase()) : null)), h('div', { class: 'amt' }, money(p.valor))))) : h('p', { class: 'muted' }, 'Sin pagos registrados.')),
            h('div', { class: 'section' }, h('h3', {}, 'Cuotas'), h('div', { class: 'ledger' }, cu.map((c) => h('div', { class: 'item ' + (c.estado === 'PAGADA' ? 's-ok' : (c.fecha_programada < hoyCO() ? 's-late' : '')) }, h('div', { class: 'grow' }, h('div', { class: 'name' }, 'Cuota ' + c.numero + ' · ' + fdate(c.fecha_programada)), h('div', { class: 'meta' }, h('span', {}, c.estado.toLowerCase()))), h('div', { class: 'amt' }, money(c.valor_pagado) + ' / ' + money(c.valor_programado))))))));
        } catch (e) { box.replaceChildren(h('p', { class: 'err' }, 'No se pudo cargar el detalle.')); }
      })(); return box; });
    }
    const cajaTxt = !cj ? 'Caja sin abrir hoy' : cj.estado === 'ABIERTA' ? 'Caja abierta · base ' + money(cj.base_inicial) : 'Caja cerrada · esperado ' + money(cj.total_esperado) + (cj.diferencia != null && Number(cj.diferencia) !== 0 ? ' · diferencia ' + money(cj.diferencia) : ' · cuadrada');
    out.replaceChildren(
      h('div', { class: 'panel' }, h('b', {}, nombreDe(AUD.cob)), h('div', { class: 'small muted' }, cajaTxt)),
      h('div', { class: 'strip' }, tile('', money(tot(rows, 'valor_a_cobrar')), 'Falta por cobrar', () => lst('Falta por cobrar · ' + money(tot(rows, 'valor_a_cobrar')), porCobrar, 'valor_a_cobrar')),
        tile('good', money(tot(rows, 'cobrado_hoy')), 'Cobrado hoy', () => lst('Cobrado hoy · ' + money(tot(rows, 'cobrado_hoy')), pagados, 'cobrado_hoy'))),
      h('div', { class: 'strip' }, tile('', String(atras.length), 'Atrasados', () => lst('Atrasados', atras.slice().sort((a, b) => b.dias_atraso - a.dias_atraso), null)),
        tile('', money(tot(rows, 'saldo')), 'Cartera activa (' + rows.filter((r) => r.estado === 'ACTIVO').length + ')', () => lst('Cartera activa · ' + money(tot(rows, 'saldo')), rows.filter((r) => r.estado === 'ACTIVO'), 'saldo'))),
      tabs, lista);
    pintar();
  }
  cargar();
}
