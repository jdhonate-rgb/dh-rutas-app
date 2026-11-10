// Clientes, préstamos y cuadre de caja (supervisión y administración).
import { h, clear, icon, money, fdate, toast, fail, busy, empty, skeleton, sheet, field, selectEl, segmented, moneyInput, moneyVal, hoyCO, inicioSemana, addDays, addMonths, num, clean, confirmarEliminar } from './lib.js';
import { S, sb, q, isAdmin, isStaff, nombreDe, cfgNum, esCob } from './state.js';

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const cap = (s) => (s ? s[0] + s.slice(1).toLowerCase() : '');
const sum = (arr, k) => arr.reduce((a, r) => a + Number(r[k] || 0), 0);
const TIPOS = { NUEVO: 'Nuevo', MIGRACION: 'Migración', RENOVACION: 'Renovación', REFINANCIACION: 'Refinanciación' };
const ARCHIVADOS = ['RENOVADO', 'REFINANCIADO', 'CANCELADO'];
const setSeg = (s, v) => { s.dataset.value = v; [...s.children].forEach((b) => b.classList.toggle('on', b.dataset.v === v)); };
const rutaNombre = (id) => { const r = S.rutas.find((x) => x.id === id); return r ? r.nombre : ''; };

// ---------------------------------------------------------------- Clientes
export async function clientes(ctx) {
  const { view } = ctx;
  ctx.setTop('Clientes', { actions: [{ icon: 'refresh', label: 'Actualizar', fn: () => ctx.refresh() }] });
  view.replaceChildren(skeleton(6));
  let rows;
  try { rows = await q(sb.from('clientes').select('id,nombre_completo,documento,telefono,barrio,ruta_id,estado').order('nombre_completo').limit(2000)); }
  catch (e) { fail(e); view.replaceChildren(empty('No se pudieron cargar los clientes', 'Inténtalo de nuevo.')); return; }
  let ruta = 'TODAS', texto = '';
  const lista = h('div', {});
  const buscar = h('input', { type: 'search', placeholder: 'Buscar por nombre, documento o barrio', 'aria-label': 'Buscar', on: { input: (e) => { texto = norm(e.target.value); pintar(); } } });
  const rutaSel = selectEl([['TODAS', 'Todas las rutas'], ...S.rutas.map((r) => [r.id, r.nombre])], 'TODAS', { 'aria-label': 'Ruta', on: { change: (e) => { ruta = e.target.value; pintar(); } } });
  function pintar() {
    const f = rows.filter((r) => (ruta === 'TODAS' || r.ruta_id === ruta) && (!texto || norm(r.nombre_completo + ' ' + r.documento + ' ' + r.barrio).includes(texto)));
    if (!f.length) { lista.replaceChildren(empty('No hay clientes con ese filtro', 'Prueba con otro nombre o crea uno nuevo.')); return; }
    lista.replaceChildren(h('div', { class: 'muted small', style: { margin: '10px 2px 8px' } }, f.length + (f.length === 1 ? ' cliente' : ' clientes')),
      h('div', { class: 'ledger' }, f.slice(0, 300).map((r) => h('a', { class: 'item', href: '#/cliente/' + r.id },
        h('div', { class: 'grow' }, h('div', { class: 'name' }, r.nombre_completo), h('div', { class: 'meta' }, r.barrio ? h('span', {}, r.barrio) : null, h('span', {}, rutaNombre(r.ruta_id)), r.estado !== 'ACTIVO' ? h('span', { class: 'late' }, 'Inactivo') : null)),
        h('span', { class: 'muted' }, icon('chev', 20))))),
      f.length > 300 ? h('p', { class: 'muted small', style: { margin: '8px 2px' } }, 'Se muestran los primeros 300. Usa el buscador para encontrar a alguien en particular.') : '');
  }
  view.replaceChildren(h('div', { class: 'stack' }, h('div', {}, h('div', { class: 'search' }, icon('search', 20), buscar), h('div', { style: { marginTop: '10px' } }, rutaSel)), lista,
    h('a', { class: 'btn primary fab', href: '#/cliente/nuevo' }, icon('plus'), 'Nuevo cliente')));
  pintar();
}

export async function cliente(ctx) {
  const { view } = ctx;
  const id = ctx.params[0];
  const nuevo = id === 'nuevo';
  ctx.setTop(nuevo ? 'Nuevo cliente' : 'Cliente', { back: '#/clientes' });
  let c = {}, prestamos = [];
  if (!nuevo) {
    view.replaceChildren(skeleton(4));
    try {
      c = await q(sb.from('clientes').select('*').eq('id', id).single());
      prestamos = await q(sb.from('v_prestamos_resumen').select('id,estado,modalidad,valor_prestado,saldo,fecha_desembolso,tipo_operacion').eq('cliente_id', id).order('fecha_desembolso', { ascending: false }));
    } catch (e) { fail(e); view.replaceChildren(empty('No se pudo abrir el cliente', 'Inténtalo de nuevo.')); return; }
    ctx.setTop(c.nombre_completo, { back: '#/clientes' });
  }
  const f = {
    nombre: h('input', { type: 'text', value: c.nombre_completo || '', autocomplete: 'off' }),
    doc: h('input', { type: 'text', inputmode: 'numeric', value: c.documento || '' }),
    tel: h('input', { type: 'tel', value: c.telefono || '' }),
    tel2: h('input', { type: 'tel', value: c.telefono_2 || '' }),
    dir: h('input', { type: 'text', value: c.direccion || '' }),
    barrio: h('input', { type: 'text', value: c.barrio || '' }),
    ref: h('input', { type: 'text', value: c.referencia_direccion || '' }),
    ruta: selectEl([['', 'Sin ruta'], ...S.rutas.filter((r) => r.estado === 'ACTIVA' || r.id === c.ruta_id).map((r) => [r.id, r.nombre + (r.cobrador_id ? ' · ' + nombreDe(r.cobrador_id) : '')])], c.ruta_id || ''),
    estado: selectEl([['ACTIVO', 'Activo'], ['INACTIVO', 'Inactivo']], c.estado || 'ACTIVO'),
    obs: h('textarea', {}, c.observaciones || '')
  };
  if (c.observaciones) f.obs.value = c.observaciones;
  const guardar = h('button', { class: 'btn primary block', on: { click: (e) => busy(e.currentTarget, async () => {
    if (!clean(f.nombre.value)) throw new Error('Escribe el nombre del cliente.');
    const rt = S.rutas.find((r) => r.id === f.ruta.value);
    const datos = { nombre_completo: clean(f.nombre.value), documento: clean(f.doc.value) || null, telefono: clean(f.tel.value) || null, telefono_2: clean(f.tel2.value) || null, direccion: clean(f.dir.value) || null, barrio: clean(f.barrio.value) || null, referencia_direccion: clean(f.ref.value) || null, ruta_id: f.ruta.value || null, cobrador_id: rt ? rt.cobrador_id : null, estado: f.estado.value, observaciones: clean(f.obs.value) || null };
    if (nuevo) {
      const r = await q(sb.from('clientes').insert(datos).select('id').single());
      toast('Cliente creado'); location.hash = '#/cliente/' + r.id;
    } else {
      await q(sb.from('clientes').update(datos).eq('id', id));
      toast('Cambios guardados'); ctx.refresh();
    }
  }) } }, nuevo ? 'Crear cliente' : 'Guardar cambios');
  view.replaceChildren(h('div', { class: 'stack' },
    h('div', { class: 'panel' }, field('Nombre completo', f.nombre), h('div', { class: 'grid2' }, field('Documento', f.doc), field('Teléfono', f.tel)), field('Otro teléfono', f.tel2), field('Dirección', f.dir), h('div', { class: 'grid2' }, field('Barrio', f.barrio), field('Estado', f.estado)), field('Referencia de la dirección', f.ref), field('Ruta', f.ruta, 'El cobrador es el de la ruta que elijas.'), field('Observaciones', f.obs), guardar),
    nuevo ? null : h('div', { class: 'section' }, h('h3', {}, 'Préstamos'),
      prestamos.length ? h('div', { class: 'ledger' }, prestamos.map((p) => h('a', { class: 'item ' + (p.estado === 'ACTIVO' ? 's-hoy' : 's-ok'), href: '#/prestamo/' + p.id },
        h('div', { class: 'grow' }, h('div', { class: 'name' }, money(p.valor_prestado) + ' · ' + cap(p.modalidad)), h('div', { class: 'meta' }, h('span', {}, fdate(p.fecha_desembolso)), h('span', {}, cap(p.estado)), p.tipo_operacion !== 'NUEVO' ? h('span', { class: 'tag' }, TIPOS[p.tipo_operacion]) : null)),
        h('div', { class: 'plate quiet' }, p.estado === 'ACTIVO' ? money(p.saldo) : cap(p.estado), h('small', {}, p.estado === 'ACTIVO' ? 'saldo' : money(p.valor_prestado)))))) : empty('Este cliente no tiene préstamos', ''),
      h('div', { class: 'row', style: { marginTop: '12px' } }, h('a', { class: 'btn', href: '#/prestamo-nuevo?cliente=' + id }, icon('plus'), 'Nuevo préstamo'), h('a', { class: 'btn', href: '#/prestamo-nuevo?tipo=MIGRACION&cliente=' + id }, 'Migrar préstamo')))));
}

// Cobrador con permiso: crea un cliente que queda en su ruta (RPC crear_cliente)
export async function clienteNuevo(ctx) {
  const { view } = ctx;
  if (isStaff()) { location.hash = '#/cliente/nuevo'; return; }
  if (!S.profile.puede_crear_clientes) { toast('No tienes permiso para crear clientes.'); location.hash = '#/ruta'; return; }
  ctx.setTop('Nuevo cliente', { back: '#/ruta' });
  const f = {
    nombre: h('input', { type: 'text', autocomplete: 'off' }), doc: h('input', { type: 'text', inputmode: 'numeric' }),
    tel: h('input', { type: 'tel' }), tel2: h('input', { type: 'tel' }), dir: h('input', { type: 'text' }),
    barrio: h('input', { type: 'text' }), ref: h('input', { type: 'text' }), obs: h('textarea', {})
  };
  const guardar = h('button', { class: 'btn primary block', on: { click: (e) => busy(e.currentTarget, async () => {
    if (!clean(f.nombre.value)) throw new Error('Escribe el nombre del cliente.');
    const id = await q(sb.rpc('crear_cliente', { p_nombre: clean(f.nombre.value), p_documento: clean(f.doc.value) || null, p_telefono: clean(f.tel.value) || null,
      p_telefono_2: clean(f.tel2.value) || null, p_direccion: clean(f.dir.value) || null, p_barrio: clean(f.barrio.value) || null, p_referencia: clean(f.ref.value) || null, p_observaciones: clean(f.obs.value) || null }));
    toast('Cliente creado');
    location.hash = S.profile.puede_crear_prestamos ? '#/prestamo-nuevo?cliente=' + id : '#/ruta';
  }) } }, 'Crear cliente');
  view.replaceChildren(h('div', { class: 'stack' }, h('div', { class: 'panel' }, field('Nombre completo', f.nombre), h('div', { class: 'grid2' }, field('Documento', f.doc), field('Teléfono', f.tel)),
    field('Otro teléfono', f.tel2), field('Dirección', f.dir), h('div', { class: 'grid2' }, field('Barrio', f.barrio), field('Referencia', f.ref)), field('Observaciones', f.obs),
    h('p', { class: 'hint' }, 'El cliente queda en tu ruta.')), guardar));
}

// ---------------------------------------------------------------- Préstamos
export async function prestamos(ctx) {
  const { view } = ctx;
  ctx.setTop('Préstamos', { actions: [{ icon: 'refresh', label: 'Actualizar', fn: () => ctx.refresh() }] });
  const staff = isStaff();
  const hoy = hoyCO();
  const TIPOS = [['TODOS', 'Todos'], ['NUEVO', 'Nuevos'], ['RENOVACION', 'Renovados'], ['REFINANCIACION', 'Refinanciados'], ['MIGRACION', 'Migrados']];
  const ETIQ = { NUEVO: 'Nuevo', RENOVACION: 'Renovado', REFINANCIACION: 'Refinanciado', MIGRACION: 'Migrado' };
  let estado = 'TODOS', tipo = 'TODOS', texto = '', cob = '', periodo = 'TODO', rows = [];
  const desde = h('input', { type: 'date', 'aria-label': 'Desde' });
  const hasta = h('input', { type: 'date', 'aria-label': 'Hasta' });
  const cobSel = staff ? selectEl([['', 'Todos los cobradores'], ...S.profiles.filter((p) => esCob(p) && p.estado === 'ACTIVO').map((p) => [p.id, p.nombre])], '') : null;
  const lista = h('div', {});
  const resumen = h('div', {});

  function rango(p) {
    if (p === 'HOY') return [hoy, hoy];
    if (p === 'SEMANA') return [inicioSemana(hoy), hoy];
    if (p === 'QUINCENA') { const [y, m, d] = hoy.split('-'); return d <= '15' ? [y + '-' + m + '-01', y + '-' + m + '-15'] : [y + '-' + m + '-16', new Date(Date.UTC(+y, +m, 0)).toISOString().substring(0, 10)]; }
    if (p === 'MES') { const [y, m] = hoy.split('-'); return [y + '-' + m + '-01', new Date(Date.UTC(+y, +m, 0)).toISOString().substring(0, 10)]; }
    return ['', ''];
  }
  const chip = (txt, on, fn) => h('button', { class: 'chip' + (on ? ' on' : ''), type: 'button', on: { click: fn } }, txt);
  const chipsPeriodo = h('div', { class: 'chips' });
  const chipsEstado = h('div', { class: 'chips' });
  const chipsTipo = h('div', { class: 'chips' });
  function pintarChips(conteo) {
    chipsPeriodo.replaceChildren(...[['TODO', 'Todo'], ['HOY', 'Hoy'], ['SEMANA', 'Semana'], ['QUINCENA', 'Quincena'], ['MES', 'Mes'], ['PERSONAL', 'Personalizado']].map(([v, t]) =>
      chip(t, periodo === v, () => { periodo = v; if (v !== 'PERSONAL') { const [d, hh] = rango(v); desde.value = d; hasta.value = hh; } cargar(); })));
    chipsEstado.replaceChildren(...[['TODOS', 'Todos'], ['ACTIVO', 'Activos'], ['PAGADO', 'Pagados'], ['ARCHIVADO', 'Archivados']].map(([v, t]) =>
      chip(t, estado === v, () => { estado = v; pintar(); })));
    chipsTipo.replaceChildren(...TIPOS.map(([v, t]) => chip(t + (conteo ? ' (' + (conteo[v] || 0) + ')' : ''), tipo === v, () => { tipo = v; pintar(); })));
  }
  const buscar = h('input', { type: 'search', placeholder: 'Buscar cliente', 'aria-label': 'Buscar', on: { input: (e) => { texto = norm(e.target.value); pintar(); } } });
  desde.addEventListener('change', () => { periodo = 'PERSONAL'; cargar(); });
  hasta.addEventListener('change', () => { periodo = 'PERSONAL'; cargar(); });
  if (cobSel) cobSel.addEventListener('change', () => { cob = cobSel.value; cargar(); });

  async function cargar() {
    lista.replaceChildren(skeleton(5)); resumen.replaceChildren();
    try {
      let qy = sb.from('v_prestamos_resumen').select('id,nombre_completo,modalidad,estado,saldo,valor_prestado,dias_atraso,cobrador_id,fecha_desembolso,cuotas_pagadas,numero_cuotas,tipo_operacion').order('fecha_desembolso', { ascending: false }).limit(1000);
      if (desde.value) qy = qy.gte('fecha_desembolso', desde.value);
      if (hasta.value) qy = qy.lte('fecha_desembolso', hasta.value);
      if (cob) qy = qy.eq('cobrador_id', cob);
      rows = await q(qy);
    } catch (e) { fail(e); lista.replaceChildren(empty('No se pudieron cargar los préstamos', 'Inténtalo de nuevo.')); return; }
    pintar();
  }

  function pintar() {
    const base = rows.filter((r) => (estado === 'TODOS' || (estado === 'ARCHIVADO' ? ARCHIVADOS.includes(r.estado) : r.estado === estado)) && (!texto || norm(r.nombre_completo).includes(texto)));
    const conteo = { TODOS: base.length }; TIPOS.slice(1).forEach(([v]) => { conteo[v] = base.filter((r) => r.tipo_operacion === v).length; });
    pintarChips(conteo);
    const f = tipo === 'TODOS' ? base : base.filter((r) => r.tipo_operacion === tipo);
    const saldo = sum(f.filter((r) => r.estado === 'ACTIVO'), 'saldo');
    // Detalle por tipo (del periodo y filtros elegidos)
    resumen.replaceChildren(h('div', { class: 'panel' }, h('div', { class: 'h2' }, 'Detalle del periodo' + (desde.value || hasta.value ? ' · ' + (desde.value ? fdate(desde.value) : '…') + ' al ' + (hasta.value ? fdate(hasta.value) : '…') : '')),
      ...TIPOS.slice(1).map(([v, t]) => { const g = base.filter((r) => r.tipo_operacion === v); return h('div', { class: 'line' }, h('div', { class: 'grow' }, t), h('div', { class: 'muted small', style: { marginRight: '10px' } }, g.length + (g.length === 1 ? ' préstamo' : ' préstamos')), h('b', {}, money(sum(g, 'valor_prestado')))); }),
      h('div', { class: 'line' }, h('b', { class: 'grow' }, 'Total prestado'), h('b', {}, money(sum(base, 'valor_prestado'))))));
    if (!f.length) { lista.replaceChildren(empty('No hay préstamos', 'Cambia las fechas o los filtros, o crea uno con el botón Nuevo préstamo.')); return; }
    lista.replaceChildren(h('div', { class: 'row between muted small', style: { margin: '6px 2px 8px' } }, h('span', {}, f.length + (f.length === 1 ? ' préstamo' : ' préstamos') + (rows.length >= 1000 ? ' (se muestran los 1000 más recientes: acota las fechas)' : '')), h('b', {}, 'Saldo ' + money(saldo))),
      h('div', { class: 'ledger' }, f.slice(0, 300).map((r) => h('a', { class: 'item ' + (r.dias_atraso > 0 && r.estado === 'ACTIVO' ? 's-late' : r.estado === 'ACTIVO' ? 's-hoy' : 's-ok'), href: '#/prestamo/' + r.id },
        h('div', { class: 'grow' }, h('div', { class: 'name' }, r.nombre_completo),
          h('div', { class: 'meta' }, h('span', { class: 'tag' }, ETIQ[r.tipo_operacion] || cap(r.tipo_operacion || '')), h('span', {}, cap(r.modalidad)), h('span', {}, r.cuotas_pagadas + '/' + r.numero_cuotas + ' cuotas'),
            r.estado === 'ACTIVO' && r.dias_atraso > 0 ? h('span', { class: 'late' }, r.dias_atraso + ' d de atraso') : null, h('span', {}, nombreDe(r.cobrador_id) || '')),
          h('div', { class: 'meta' }, h('span', {}, fdate(r.fecha_desembolso)), h('span', {}, 'Prestó ' + money(r.valor_prestado)))),
        h('div', { class: 'plate quiet' }, r.estado === 'ACTIVO' ? money(r.saldo) : cap(r.estado), h('small', {}, r.estado === 'ACTIVO' ? 'saldo' : money(r.valor_prestado)))))));
  }
  view.replaceChildren(h('div', { class: 'stack' },
    h('div', {}, h('div', { class: 'search' }, icon('search', 20), buscar), chipsPeriodo, h('div', { class: 'grid2' }, field('Desde', desde), field('Hasta', hasta)), cobSel ? field('Cobrador', cobSel) : null, chipsEstado, chipsTipo),
    resumen, lista,
    h('a', { class: 'btn primary fab', href: '#/prestamo-nuevo' }, icon('plus'), 'Nuevo préstamo')));
  pintarChips(null);
  cargar();
}

function primerPago(mod, desembolso) {
  return mod === 'DIARIO' ? addDays(desembolso, 1) : mod === 'SEMANAL' ? addDays(desembolso, 7) : mod === 'QUINCENAL' ? addDays(desembolso, 15) : addMonths(desembolso, 1);
}
function calendario(mod, primero, n, omiteDomingo) {
  const fechas = []; let d = primero;
  for (let i = 1; i <= n; i++) {
    if (mod === 'DIARIO' && omiteDomingo && new Date(d + 'T12:00:00Z').getUTCDay() === 0) d = addDays(d, 1);
    fechas.push(d);
    d = mod === 'DIARIO' ? addDays(d, 1) : mod === 'SEMANAL' ? addDays(d, 7) : mod === 'QUINCENAL' ? addDays(d, 15) : addMonths(primero, i);
  }
  return fechas;
}

export async function prestamoNuevo(ctx) {
  const { view } = ctx;
  const qa = ctx.query.anterior || null;
  const cobr = !isStaff();   // cobrador: presta desde su caja; Nuevo solo si el administrador le dio el permiso
  const yo = S.profile;
  if (cobr && !qa && !yo.puede_crear_prestamos) { toast('No tienes permiso para crear préstamos nuevos.'); location.hash = '#/ruta'; return; }
  let tipo = qa ? (ctx.query.tipo === 'REFINANCIACION' ? 'REFINANCIACION' : 'RENOVACION') : (ctx.query.tipo === 'MIGRACION' ? 'MIGRACION' : 'NUEVO');
  const TITULO = { NUEVO: 'Nuevo préstamo', MIGRACION: 'Migrar préstamo', RENOVACION: 'Renovar préstamo', REFINANCIACION: 'Refinanciar préstamo' };
  ctx.setTop(TITULO[tipo], { back: qa ? '#/prestamo/' + qa : '#/prestamos' });
  view.replaceChildren(skeleton(4));
  let cls, ant = null;
  try {
    cls = await q(sb.from('clientes').select('id,nombre_completo,documento,barrio,cobrador_id').eq('estado', 'ACTIVO').order('nombre_completo').limit(2000));
    if (qa) ant = await q(sb.from('v_prestamos_resumen').select('*').eq('id', qa).single());
  } catch (e) { fail(e); view.replaceChildren(empty('No se pudo preparar el formulario', 'Inténtalo de nuevo.')); return; }
  // Cobrador: efectivo que tiene hoy en su caja (no puede prestar más que eso, salvo el dueño, que desembolsa desde la oficina o sus cuentas)
  const editPap = !cobr || !!yo.papeleria_editable;      // quien decide la papelería (supervisor/admin o cobrador con permiso)
  const puedeTransf = cobr ? !!yo.puede_desembolsar : true;
  const cobraRuta = cobr || !!yo.es_cobrador;           // tiene caja propia
  let disp = null;
  if (cobraRuta) { try { const d = await q(sb.rpc('mi_efectivo_disponible')); disp = d == null ? null : Number(d); } catch { disp = null; } }
  // "Modo propio": presta él mismo desde su caja (cobrador, o supervisor que cobra y elige un cliente de su ruta)
  const propio = () => cobr || (!!yo.es_cobrador && !!elegido && elegido.cobrador_id === yo.id);

  let elegido = ant ? cls.find((c) => c.id === ant.cliente_id) || { id: ant.cliente_id, nombre_completo: ant.nombre_completo } : (ctx.query.cliente ? cls.find((c) => c.id === ctx.query.cliente) : null);
  const pctPap = cfgNum('PCT_PAPELERIA_CLIENTE', 0);
  const omite = S.cfg.DIARIO_OMITE_DOMINGO === 'SI';
  const conDinero = () => tipo === 'NUEVO' || tipo === 'RENOVACION';   // solo ahí sale dinero y se descuenta papelería

  const pick = h('div', {});
  const buscar = h('input', { type: 'search', placeholder: 'Escribe el nombre o documento', autocomplete: 'off' });
  const resultados = h('div', { class: 'ledger', style: { marginTop: '8px' } });
  const selCob = selectEl([['', 'Sin cobrador'], ...S.profiles.filter((x) => x.rol === 'COBRADOR' && x.estado === 'ACTIVO').map((x) => [x.id, x.nombre])], '', { 'aria-label': 'Cobrador', on: { change: () => { aplicarModo(); calc(); } } });
  const bCob = h('div', { class: 'field', style: { display: 'none' } }, h('label', {}, 'Cobrador / Ruta del préstamo'), selCob,
    h('p', { class: 'hint' }, 'Viene el cobrador del cliente. Si lo cambias, el cliente pasa a ese cobrador y a su ruta junto con el préstamo (solo si no tiene otro préstamo activo).'));
  function pintarPick() {
    clear(pick);
    bCob.style.display = (!cobr && elegido) ? '' : 'none';
    if (elegido) selCob.value = elegido.cobrador_id || '';
    if (elegido) {
      pick.append(h('div', { class: 'panel row between' }, h('div', {}, h('b', {}, elegido.nombre_completo), h('div', { class: 'small muted' }, [elegido.barrio, nombreDe(elegido.cobrador_id)].filter(Boolean).join(' · '))),
        qa ? null : h('button', { class: 'btn small', type: 'button', on: { click: () => { elegido = null; pintarPick(); aplicarModo(); calc(); } } }, 'Cambiar')));
    } else {
      pick.append(h('div', { class: 'search' }, icon('search', 20), buscar), resultados);
      mostrar();
    }
  }
  function mostrar() {
    const t = norm(buscar.value);
    const f = (t ? cls.filter((c) => norm(c.nombre_completo + ' ' + c.documento).includes(t)) : cls).slice(0, 6);
    resultados.replaceChildren(...f.map((c) => h('button', { type: 'button', class: 'item', style: { width: '100%', textAlign: 'left', background: 'none', border: 0, paddingLeft: '14px' }, on: { click: () => { elegido = c; pintarPick(); aplicarModo(); calc(); } } },
      h('div', { class: 'grow' }, h('div', { class: 'name' }, c.nombre_completo), h('div', { class: 'meta' }, h('span', {}, c.barrio || ''), h('span', {}, c.documento || ''))))));
    if (!f.length) resultados.replaceChildren(h('p', { class: 'muted', style: { padding: '12px' } }, 'No hay clientes con ese nombre.'));
  }
  buscar.addEventListener('input', mostrar);

  const valor = moneyInput({ 'aria-label': 'Valor prestado' });
  const pct = h('input', { type: 'number', inputmode: 'decimal', min: '0', step: '0.5', placeholder: '20', 'aria-label': 'Porcentaje de interés' });
  const mod = selectEl([['DIARIO', 'Diario'], ['SEMANAL', 'Semanal'], ['QUINCENAL', 'Quincenal'], ['MENSUAL', 'Mensual']], ant ? ant.modalidad : 'DIARIO');
  const cuotas = h('input', { type: 'number', inputmode: 'numeric', min: '1', max: '120', placeholder: '24' });
  const fecha = h('input', { type: 'date', value: hoyCO() });
  const primer = h('input', { type: 'date' });
  let primerManual = false; let lastEnt = 0;
  const defPrimer = () => primerPago(mod.value, fecha.value);
  const syncPrimer = () => { if (!primerManual) primer.value = defPrimer(); };
  primer.addEventListener('input', () => { primerManual = true; });
  const volver = h('button', { type: 'button', class: 'btn small', on: { click: () => { primerManual = false; syncPrimer(); calc(); } } }, 'Usar la fecha por defecto');
  const yaPag = moneyInput({ 'aria-label': 'Ya cobrado' });
  const cuentasOk = (cobr ? (S.cuentasCobro || []) : S.cuentas).filter((c) => c.tipo !== 'EFECTIVO' && c.tipo !== 'PAPELERIA');
  const cuenta = selectEl(cuentasOk.map((c) => [c.id, c.nombre]));
  const medio = segmented([['EFECTIVO', 'Efectivo'], ['TRANSFERENCIA', 'Transferencia']], 'EFECTIVO', (v) => { cuentaBox.style.display = v === 'TRANSFERENCIA' ? '' : 'none'; aplicarModo(); calc(); });
  const cuentaBox = h('div', { style: { display: 'none' } }, field('Cuenta de la que sale', cuenta));
  const descPap = segmented([['SI', 'Sí, descontar'], ['NO', 'No descontar']], 'SI', () => { papBox.style.display = descPap.get() === 'SI' ? '' : 'none'; calc(); });
  const papTipo = segmented([['STD', pctPap + ' % (estándar)'], ['MAN', 'Valor en pesos']], 'STD', (v) => { papValBox.style.display = v === 'MAN' ? '' : 'none'; calc(); });
  const papVal = moneyInput({ 'aria-label': 'Papelería en pesos' });
  const papValBox = h('div', { style: { display: 'none' } }, field('Papelería en pesos', papVal, 'Es lo que se descuenta al cliente al entregar el dinero. La deuda del cliente no baja.'));
  const papBox = h('div', {}, papTipo, papValBox);
  const pagaCom = segmented([['SI', 'Sí, pagar'], ['NO', 'No pagar']], conDinero() ? 'SI' : 'NO');
  const prev = h('div', { class: 'panel' });

  const selTipo = (qa || cobr) ? null : segmented([['NUEVO', 'Nuevo'], ['MIGRACION', 'Migración']], tipo, (v) => { tipo = v; ctx.setTop(TITULO[tipo], { back: '#/prestamos' }); setSeg(pagaCom, conDinero() ? 'SI' : 'NO'); aplicarTipo(); calc(); });
  const info = h('div', {});
  const bValor = field('Valor prestado', valor);
  const bYa = h('div', {}, field('Ya cobrado hasta hoy', yaPag, 'Lo que el cliente ya pagó de este préstamo. No mueve dinero de las cuentas.'));
  const bMedio = h('div', { class: 'field' }, h('label', {}, 'Cómo se entrega el dinero'), medio);
  const bPap = h('div', { class: 'field' }, h('label', {}, 'Papelería al cliente'), descPap, papBox, h('p', { class: 'hint' }, 'Se descuenta al entregar el dinero, pero la deuda del cliente no baja.'));
  const bDinero = h('div', {}, bMedio, cuentaBox, bPap);
  const notaModo = h('div', {});
  const lblFecha = h('label', {}, 'Fecha de desembolso');
  const bFecha = h('div', { class: 'field' }, lblFecha, fecha);
  function aplicarModo() {
    const p = propio();
    const transf = puedeTransf && cuentasOk.length > 0;
    bMedio.style.display = (p ? transf : true) ? '' : 'none';
    if (p && !transf) { setSeg(medio, 'EFECTIVO'); cuentaBox.style.display = 'none'; }
    bPap.style.display = editPap ? '' : 'none';
    bFecha.style.display = p && conDinero() ? 'none' : '';
    if (p && conDinero()) { fecha.value = hoyCO(); syncPrimer(); }
    clear(notaModo);
    if (conDinero() && p) notaModo.append(h('p', { class: 'hint panelnote' }, disp == null
      ? 'Tu caja no está abierta hoy. Sin caja abierta no puedes prestar.'
      : 'Prestas desde tu caja' + (medio.get() === 'EFECTIVO' ? ': tienes ' + money(disp) + ' en efectivo y no puedes prestar más. Lo prestado se descuenta de lo que debes entregar al cerrar la caja.' : ', y el dinero sale de la cuenta que elijas.')));
    if (conDinero() && !p && !cobr) notaModo.append(h('p', { class: 'hint panelnote' }, 'Desembolso de la oficina: el dinero sale de la cuenta que elijas. No se registra en la caja del cobrador.'));
  }
  function aplicarTipo() {
    bValor.style.display = tipo === 'REFINANCIACION' ? 'none' : '';
    bYa.style.display = tipo === 'MIGRACION' ? '' : 'none';
    bDinero.style.display = conDinero() ? '' : 'none';
    aplicarModo();
    lblFecha.textContent = tipo === 'MIGRACION' ? 'Fecha en que se hizo el préstamo' : tipo === 'REFINANCIACION' ? 'Fecha de la refinanciación' : 'Fecha de desembolso';
    clear(info);
    if (tipo === 'MIGRACION') info.append(h('p', { class: 'hint panelnote' }, 'Para cargar un préstamo que ya venía andando. No descuenta papelería ni mueve dinero de las cuentas.'));
    if (tipo === 'RENOVACION') info.append(h('p', { class: 'hint panelnote' }, 'Renovación del préstamo que el cliente pagó por completo (' + money(ant.valor_prestado) + ' · ' + fdate(ant.fecha_desembolso) + '). Ese préstamo queda archivado.'));
    if (tipo === 'REFINANCIACION') info.append(h('div', { class: 'panel' }, h('div', { class: 'line' }, h('span', { class: 'grow' }, 'Préstamo actual'), h('span', { class: 'amt' }, money(ant.valor_prestado))),
      h('div', { class: 'line' }, h('span', { class: 'grow' }, 'Ya pagó'), h('span', { class: 'amt' }, money(ant.total_cobrado))),
      h('div', { class: 'line' }, h('b', { class: 'grow' }, 'Saldo que se refinancia'), h('b', { class: 'amt' }, money(ant.saldo))),
      h('p', { class: 'hint' }, 'Ese saldo pasa a ser el valor del nuevo préstamo; el interés que pactes se suma sobre él. No se descuenta papelería ni sale dinero. El préstamo actual queda archivado.')));
  }

  function calc() {
    const v = tipo === 'REFINANCIACION' ? Number(ant.saldo) : moneyVal(valor), p = Number(pct.value), n = Number(cuotas.value);
    if (!v || pct.value === '' || !n) { prev.replaceChildren(h('p', { class: 'muted' }, 'Completa ' + (tipo === 'REFINANCIACION' ? 'interés y cuotas' : 'valor, interés y cuotas') + ' para ver el resumen.')); return null; }
    const conPap = conDinero() && (editPap ? descPap.get() === 'SI' : true);
    const manual = editPap && conPap && papTipo.get() === 'MAN';
    const pap = conPap ? (manual ? moneyVal(papVal) : Math.round(v * pctPap / 100)) : 0, ent = v - pap, int = Math.round(v * p / 100), tot = v + int, cuota = Math.round(tot / n);
    lastEnt = ent;
    if (pap >= v) { prev.replaceChildren(h('p', { class: 'err' }, 'La papelería (' + money(pap) + ') debe ser menor al valor prestado.')); return null; }
    const ya = tipo === 'MIGRACION' ? moneyVal(yaPag) : 0;
    const efProp = propio() && conDinero() && medio.get() === 'EFECTIVO' && disp != null;
    if (ya >= tot) { prev.replaceChildren(h('p', { class: 'err' }, 'Lo ya cobrado (' + money(ya) + ') debe ser menor al total a cobrar (' + money(tot) + ').')); return null; }
    const cal = calendario(mod.value, primer.value || defPrimer(), n, omite);
    const L = (a, b, bold) => h('div', { class: 'line' }, h(bold ? 'b' : 'span', { class: 'grow' }, a), h(bold ? 'b' : 'span', { class: 'amt' }, b));
    prev.replaceChildren(...[
      L(tipo === 'REFINANCIACION' ? 'Saldo que se refinancia' : 'Valor prestado', money(v)),
      conDinero() ? L('Papelería (' + (conPap ? (manual ? 'valor manual' : pctPap + ' %') : 'no se descuenta') + ')', money(pap)) : null,
      conDinero() ? L('Se entrega al cliente', money(ent), true) : null,
      L('Interés (' + p + ' %)', money(int)),
      L('Total a cobrar', money(tot), true),
      ya ? L('Ya cobrado', '− ' + money(ya)) : null,
      ya ? L('Saldo pendiente', money(tot - ya), true) : null,
      L(n + ' cuotas de', money(cuota)),
      L(tipo === 'MIGRACION' ? 'Primera cuota' : 'Primer cobro', fdate(cal[0])),
      efProp ? L('Efectivo en tu caja', money(disp), ent > disp) : null,
      efProp && ent > disp ? h('p', { class: 'err' }, 'No tienes efectivo suficiente: este préstamo entrega ' + money(ent) + ' y en tu caja hay ' + money(disp) + '. No puedes prestar más del efectivo que tienes.') : null,
      L('Última cuota', fdate(cal[cal.length - 1]))].filter(Boolean));
    return { v, p, n, ya, ent };
  }
  [valor, pct, cuotas, yaPag, primer, papVal].forEach((e) => e.addEventListener('input', calc));
  fecha.addEventListener('input', () => { syncPrimer(); calc(); });
  mod.addEventListener('change', () => { syncPrimer(); calc(); });

  const crear = h('button', { class: 'btn primary block', on: { click: (e) => busy(e.currentTarget, async () => {
    if (!elegido) throw new Error('Elige el cliente.');
    const r = calc();
    if (!r) throw new Error('Completa los datos del préstamo.');
    const p = propio();
    if (p && conDinero()) {
      if (disp == null) throw new Error('No tienes la caja abierta hoy. Sin caja abierta no puedes prestar.');
      if (medio.get() === 'EFECTIVO' && r.ent > disp) throw new Error('No tienes efectivo suficiente: en tu caja hay ' + money(disp) + ' y este préstamo entrega ' + money(r.ent) + '.');
    }
    if (conDinero() && medio.get() === 'TRANSFERENCIA' && !cuentasOk.length) throw new Error('No tienes cuentas habilitadas para desembolsar. Pídele al administrador que las configure.');
    const manual = editPap && conDinero() && descPap.get() === 'SI' && papTipo.get() === 'MAN';
    if (manual && !(moneyVal(papVal) >= 0)) throw new Error('Escribe la papelería en pesos.');
    const id = await q(sb.rpc('crear_prestamo', {
      p_cliente: elegido.id, p_valor: r.v, p_porcentaje: r.p, p_modalidad: mod.value, p_cuotas: r.n,
      p_cuenta: conDinero() && medio.get() === 'TRANSFERENCIA' ? cuenta.value : null, p_medio: conDinero() ? medio.get() : 'EFECTIVO',
      p_fecha_desembolso: (cobr || (p && conDinero())) ? hoyCO() : fecha.value, p_anterior: qa, p_tipo: tipo, p_ya_pagado: r.ya,
      p_descuenta_papeleria: editPap && conDinero() ? descPap.get() === 'SI' : null,
      p_papeleria_valor: manual ? moneyVal(papVal) : null,
      p_paga_comision: cobr ? null : pagaCom.get() === 'SI',
      p_fecha_primer_pago: primer.value || null,
      p_cobrador: (!cobr && selCob.value && selCob.value !== elegido.cobrador_id) ? selCob.value : null }));
    toast({ NUEVO: 'Préstamo creado', MIGRACION: 'Préstamo migrado', RENOVACION: 'Préstamo renovado', REFINANCIACION: 'Préstamo refinanciado' }[tipo]); location.hash = '#/prestamo/' + id;
  }) } }, 'Guardar préstamo');

  view.replaceChildren(h('div', { class: 'stack' },
    selTipo ? h('div', { class: 'panel' }, h('div', { class: 'h2' }, 'Tipo de préstamo'), selTipo) : null,
    info, notaModo,
    h('div', { class: 'panel' }, h('div', { class: 'h2' }, 'Cliente'), pick, bCob),
    h('div', { class: 'panel' }, h('div', { class: 'h2' }, 'Condiciones'),
      bValor, h('div', { class: 'grid2' }, field('Interés (%)', pct, 'Lo define quien presta'), field('Número de cuotas', cuotas)),
      h('div', { class: 'grid2' }, field('Modalidad de cobro', mod), bFecha),
      h('div', { class: 'field' }, h('label', {}, 'Fecha del primer cobro'), primer, h('p', { class: 'hint' }, 'Sale la que corresponde según la modalidad; si quieres otra, cámbiala. ', volver)),
      bYa, bDinero,
      h('div', { class: 'field' }, h('label', {}, 'Comisión para el cobrador'), pagaCom, h('p', { class: 'hint' }, 'Si eliges "No pagar", este préstamo no suma a la comisión de la liquidación.'))),
    h('div', { class: 'section' }, h('h3', {}, 'Resumen'), prev), crear));
  aplicarTipo(); syncPrimer(); pintarPick(); calc();
  if (cobr) pagaCom.parentElement.style.display = 'none';   // el cobrador no ve comisión: se aplica la de la empresa
}

// ---------------------------------------------------------------- Caja
export async function caja(ctx) {
  const { view } = ctx;
  ctx.setTop('Cuadre de caja', { actions: [{ icon: 'refresh', label: 'Actualizar', fn: () => ctx.refresh() }] });
  const dia = h('input', { type: 'date', value: hoyCO() });
  const out = h('div', {});
  view.replaceChildren(h('div', { class: 'stack' }, field('Día', dia), out));
  dia.addEventListener('change', () => cargar());

  async function cargar() {
    out.replaceChildren(skeleton(3));
    const d = dia.value;
    try {
      const [cajas, pagos, gastos, ents] = await Promise.all([
        q(sb.from('cajas').select('*').eq('fecha', d)),
        q(sb.from('pagos').select('cobrador_id,valor,metodo,caja_id').eq('fecha_pago', d).eq('estado_pago', 'VIGENTE')),
        q(sb.from('gastos').select('usuario_id,valor,metodo').eq('fecha', d).eq('metodo', 'EFECTIVO')),
        q(sb.from('caja_entregas').select('*,cajas!inner(fecha,cobrador_id),prestamos(clientes(nombre_completo))').eq('cajas.fecha', d))
      ]);
      const cobs = S.profiles.filter((p) => esCob(p) && p.estado === 'ACTIVO');
      if (!cobs.length) { out.replaceChildren(empty('No hay cobradores activos', 'Activa a los cobradores desde Usuarios.')); return; }
      out.replaceChildren(h('div', { class: 'stack' }, cobs.map((c) => tarjetaCaja(c, cajas.find((x) => x.cobrador_id === c.id), pagos.filter((p) => p.cobrador_id === c.id), gastos.filter((g) => g.usuario_id === c.id), d, ents.filter((e) => e.cajas.cobrador_id === c.id)))));
    } catch (e) { fail(e); out.replaceChildren(empty('No se pudo cargar la caja', 'Inténtalo de nuevo.')); }
  }

  function tarjetaCaja(c, cj, pagos, gastos, d, ents) {
    const ef = sum(pagos.filter((p) => p.metodo === 'EFECTIVO' && (!cj || cj.estado === 'ABIERTA' ? !p.caja_id : p.caja_id === cj.id)), 'valor');
    const tr = sum(pagos.filter((p) => p.metodo === 'TRANSFERENCIA'), 'valor');
    const gs = sum(gastos, 'valor');
    const cerrada = cj && cj.estado === 'CERRADA';
    const base = cj ? Number(cj.base_inicial) : 0;
    const entM = sum(ents, 'monto'), entC = sum(ents, 'valor_cliente');
    const esperado = cerrada ? Number(cj.total_esperado) : base + entM - entC + ef - gs;
    const cuerpo = [];
    if (!cj) {
      cuerpo.push(h('p', { class: 'muted', style: { margin: '10px 0' } }, 'Aún no se ha abierto la caja de este cobrador.'),
        h('button', { class: 'btn primary block', on: { click: () => abrir(c, d) } }, 'Abrir caja'));
    } else {
      cuerpo.push(h('div', { class: 'kv', style: { marginTop: '10px' } }, kvc('Base entregada', money(base)), kvc('Cobros en efectivo', money(cerrada ? cj.total_cobros_efectivo : ef)), kvc('Gastos en efectivo', money(cerrada ? cj.total_gastos : gs)), kvc('Transferencias', money(tr)),
          ents.length ? kvc('Entregado al cobrador para préstamos', money(entM)) : null, ents.length ? kvc('Entregado a clientes', '− ' + money(entC)) : null),
        ents.length ? h('div', { class: 'small', style: { margin: '6px 2px' } }, h('div', { class: 'muted' }, 'Préstamos entregados:'), ents.map((e) => h('div', { class: 'line' }, h('span', { class: 'grow' }, ((e.prestamos && e.prestamos.clientes && e.prestamos.clientes.nombre_completo) || 'Cliente') + (Number(e.monto) > 0 ? ' (con ' + money(e.monto) + ' adicionales del cobrador)' : '')), h('b', { class: 'amt' }, money(e.valor_cliente))))) : null,
        h('div', { class: 'line', style: { marginTop: '6px' } }, h('b', { class: 'grow' }, 'Efectivo esperado'), h('b', { class: 'amt' }, money(esperado))));
      if (cerrada) {
        const df = Number(cj.diferencia);
        cuerpo.push(h('div', { class: 'line' }, h('span', { class: 'grow' }, 'Entregó ' + money(cj.dinero_entregado)), h('b', { class: 'amt ' + (df < 0 ? 'neg' : df > 0 ? 'pos' : '') }, df === 0 ? 'Cuadrado' : (df < 0 ? 'Faltan ' : 'Sobran ') + money(Math.abs(df)))));
      } else {
        cuerpo.push(h('button', { class: 'btn primary block', style: { marginTop: '8px' }, on: { click: () => cerrar(cj, esperado, c) } }, 'Cerrar caja'));
      }
    }
    if (cj) cuerpo.push(h('div', { class: 'row', style: { gap: '8px', marginTop: '8px', flexWrap: 'wrap' } },
      h('button', { class: 'btn small', on: { click: () => editarCaja(c, cj) } }, 'Editar caja'),
      cerrada ? h('button', { class: 'btn small', on: { click: () => confirmarEliminar({ titulo: 'Reabrir caja de ' + c.nombre, texto: 'La caja vuelve a estado abierto y el cobrador puede trabajar de nuevo. Se reversan los movimientos del cierre; luego la cierras otra vez.', boton: 'Reabrir caja', onOk: async () => { await q(sb.rpc('reabrir_caja', { p_caja: cj.id })); toast('Caja reabierta'); cargar(); } }) } }, 'Reabrir caja') : null));
    if (cj) cuerpo.push(h('button', { class: 'btn danger small block', style: { marginTop: '8px' }, on: { click: () => confirmarEliminar({ titulo: 'Eliminar caja de ' + c.nombre, texto: 'Se elimina esta caja y se reversan sus movimientos de efectivo (base y entrega). Los cobros del día quedan sin caja.', onOk: async (m) => { await q(sb.rpc('eliminar_caja', { p_caja: cj.id, p_motivo: m })); toast('Caja eliminada'); cargar(); } }) } }, 'Eliminar caja'));
    return h('div', { class: 'panel' }, h('div', { class: 'row between' }, h('b', { style: { fontSize: '18px' } }, c.nombre), h('span', { class: 'tag ' + (cerrada ? 'ok' : cj ? 'warn' : '') }, cerrada ? 'Cerrada' : cj ? 'Abierta' : 'Sin abrir')), cuerpo);
  }
  const kvc = (k, v) => h('div', {}, h('div', { class: 'k' }, k), h('div', { class: 'v' }, v));

  function editarCaja(c, cj) {
    const cerrada = cj.estado === 'CERRADA';
    const base = moneyInput({ 'aria-label': 'Base' }); base.value = num(cj.base_inicial);
    const ent = moneyInput({ 'aria-label': 'Dinero entregado' }); if (cerrada) ent.value = num(cj.dinero_entregado);
    const obs = h('textarea', { placeholder: 'Opcional' }); obs.value = cj.observacion || '';
    sheet('Editar caja de ' + c.nombre, (close) => h('div', {},
      h('p', { class: 'muted', style: { marginBottom: '12px' } }, cerrada ? 'La caja está cerrada: al guardar se recalcula el cuadre con los valores nuevos.' : 'Cambia la base entregada o la nota.'),
      field('Base entregada', base), cerrada ? field('Dinero entregado por el cobrador', ent) : null, field('Nota', obs),
      h('button', { class: 'btn primary block', on: { click: (e) => busy(e.currentTarget, async () => {
        await q(sb.rpc('editar_caja', { p_caja: cj.id, p_base: moneyVal(base), p_entregado: cerrada ? moneyVal(ent) : null, p_obs: obs.value.trim() || null }));
        close(); toast('Caja actualizada'); cargar();
      }) } }, 'Guardar cambios')));
  }
  function abrir(c, d) {
    const base = moneyInput({ 'aria-label': 'Base' });
    sheet('Abrir caja de ' + c.nombre, (close) => h('div', {},
      h('p', { class: 'muted', style: { marginBottom: '12px' } }, 'La base sale del efectivo de la oficina y vuelve al cerrar la caja. Si hoy no recibe base, déjala en cero.'),
      field('Base entregada', base),
      h('button', { class: 'btn primary block', on: { click: (e) => busy(e.currentTarget, async () => {
        await q(sb.rpc('abrir_caja', { p_cobrador: c.id, p_base: moneyVal(base), p_fecha: d }));
        close(); toast('Caja abierta'); cargar();
      }) } }, 'Abrir caja')));
  }
  function cerrar(cj, esperado, c) {
    const ent = moneyInput({ 'aria-label': 'Dinero entregado' });
    ent.value = num(esperado);
    const res = h('p', { class: 'small', style: { margin: '-4px 0 14px', fontWeight: '700' } });
    const obs = h('textarea', { placeholder: 'Opcional' });
    const pinta = () => { const df = moneyVal(ent) - esperado; res.textContent = df === 0 ? 'Cuadra exacto.' : df < 0 ? 'Faltan ' + money(-df) + '. Se descontará en la liquidación.' : 'Sobran ' + money(df) + '.'; res.style.color = df < 0 ? 'var(--bad)' : df > 0 ? 'var(--ok)' : 'var(--muted)'; };
    ent.addEventListener('input', pinta); pinta();
    sheet('Cerrar caja de ' + c.nombre, (close) => h('div', {},
      h('p', { class: 'muted', style: { marginBottom: '12px' } }, 'Efectivo esperado: ' + money(esperado)),
      field('Dinero entregado', ent), res, field('Nota', obs),
      h('button', { class: 'btn primary block', on: { click: (e) => busy(e.currentTarget, async () => {
        const df = await q(sb.rpc('cerrar_caja', { p_caja: cj.id, p_entregado: moneyVal(ent), p_obs: obs.value.trim() || null }));
        close(); toast(Number(df) === 0 ? 'Caja cerrada: cuadrada' : 'Caja cerrada con diferencia de ' + money(df)); cargar();
      }) } }, 'Cerrar caja')));
  }
  cargar();
}
