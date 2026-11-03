// Clientes, préstamos y cuadre de caja (supervisión y administración).
import { h, clear, icon, money, fdate, toast, fail, busy, empty, skeleton, sheet, field, selectEl, segmented, moneyInput, moneyVal, hoyCO, addDays, addMonths, num, clean } from './lib.js';
import { S, sb, q, isAdmin, nombreDe, cfgNum } from './state.js';

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const cap = (s) => (s ? s[0] + s.slice(1).toLowerCase() : '');
const sum = (arr, k) => arr.reduce((a, r) => a + Number(r[k] || 0), 0);
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
      prestamos = await q(sb.from('v_prestamos_resumen').select('id,estado,modalidad,valor_prestado,saldo,fecha_desembolso').eq('cliente_id', id).order('fecha_desembolso', { ascending: false }));
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
        h('div', { class: 'grow' }, h('div', { class: 'name' }, money(p.valor_prestado) + ' · ' + cap(p.modalidad)), h('div', { class: 'meta' }, h('span', {}, fdate(p.fecha_desembolso)), h('span', {}, cap(p.estado)))),
        h('div', { class: 'plate quiet' }, money(p.saldo), h('small', {}, 'saldo'))))) : empty('Este cliente no tiene préstamos', ''),
      h('a', { class: 'btn block', style: { marginTop: '12px' }, href: '#/prestamo-nuevo?cliente=' + id }, icon('plus'), 'Nuevo préstamo'))));
}

// ---------------------------------------------------------------- Préstamos
export async function prestamos(ctx) {
  const { view } = ctx;
  ctx.setTop('Préstamos', { actions: [{ icon: 'refresh', label: 'Actualizar', fn: () => ctx.refresh() }] });
  view.replaceChildren(skeleton(6));
  let rows;
  try { rows = await q(sb.from('v_prestamos_resumen').select('id,nombre_completo,modalidad,estado,saldo,valor_prestado,dias_atraso,cobrador_id,fecha_desembolso,cuotas_pagadas,numero_cuotas').order('fecha_desembolso', { ascending: false }).limit(1000)); }
  catch (e) { fail(e); view.replaceChildren(empty('No se pudieron cargar los préstamos', 'Inténtalo de nuevo.')); return; }
  let estado = 'ACTIVO', texto = '';
  const lista = h('div', {});
  const chips = h('div', { class: 'chips' }, [['ACTIVO', 'Activos'], ['PAGADO', 'Pagados'], ['TODOS', 'Todos']].map(([v, t]) =>
    h('button', { class: 'chip' + (estado === v ? ' on' : ''), on: { click: (e) => { estado = v; [...chips.children].forEach((x) => x.classList.remove('on')); e.currentTarget.classList.add('on'); pintar(); } } }, t)));
  const buscar = h('input', { type: 'search', placeholder: 'Buscar cliente', 'aria-label': 'Buscar', on: { input: (e) => { texto = norm(e.target.value); pintar(); } } });
  function pintar() {
    const f = rows.filter((r) => (estado === 'TODOS' || r.estado === estado) && (!texto || norm(r.nombre_completo).includes(texto)));
    const saldo = sum(f.filter((r) => r.estado === 'ACTIVO'), 'saldo');
    if (!f.length) { lista.replaceChildren(empty('No hay préstamos', 'Crea el primero con el botón Nuevo préstamo.')); return; }
    lista.replaceChildren(h('div', { class: 'row between muted small', style: { margin: '6px 2px 8px' } }, h('span', {}, f.length + (f.length === 1 ? ' préstamo' : ' préstamos')), estado === 'PAGADO' ? null : h('b', {}, 'Saldo ' + money(saldo))),
      h('div', { class: 'ledger' }, f.slice(0, 300).map((r) => h('a', { class: 'item ' + (r.dias_atraso > 0 && r.estado === 'ACTIVO' ? 's-late' : r.estado === 'ACTIVO' ? 's-hoy' : 's-ok'), href: '#/prestamo/' + r.id },
        h('div', { class: 'grow' }, h('div', { class: 'name' }, r.nombre_completo), h('div', { class: 'meta' }, h('span', {}, cap(r.modalidad)), h('span', {}, r.cuotas_pagadas + '/' + r.numero_cuotas + ' cuotas'), r.estado === 'ACTIVO' && r.dias_atraso > 0 ? h('span', { class: 'late' }, r.dias_atraso + ' d de atraso') : null, h('span', {}, nombreDe(r.cobrador_id)))),
        h('div', { class: 'plate quiet' }, r.estado === 'ACTIVO' ? money(r.saldo) : cap(r.estado), h('small', {}, r.estado === 'ACTIVO' ? 'saldo' : money(r.valor_prestado)))))));
  }
  view.replaceChildren(h('div', { class: 'stack' }, h('div', {}, h('div', { class: 'search' }, icon('search', 20), buscar), chips), lista,
    h('a', { class: 'btn primary fab', href: '#/prestamo-nuevo' }, icon('plus'), 'Nuevo préstamo')));
  pintar();
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
  ctx.setTop('Nuevo préstamo', { back: '#/prestamos' });
  view.replaceChildren(skeleton(4));
  let cls;
  try { cls = await q(sb.from('clientes').select('id,nombre_completo,documento,barrio,cobrador_id').eq('estado', 'ACTIVO').order('nombre_completo').limit(2000)); }
  catch (e) { fail(e); view.replaceChildren(empty('No se pudo preparar el formulario', 'Inténtalo de nuevo.')); return; }

  let elegido = ctx.query.cliente ? cls.find((c) => c.id === ctx.query.cliente) : null;
  const pctPap = cfgNum('PCT_PAPELERIA_CLIENTE', 0);
  const omite = S.cfg.DIARIO_OMITE_DOMINGO === 'SI';

  const pick = h('div', {});
  const buscar = h('input', { type: 'search', placeholder: 'Escribe el nombre o documento', autocomplete: 'off' });
  const resultados = h('div', { class: 'ledger', style: { marginTop: '8px' } });
  function pintarPick() {
    clear(pick);
    if (elegido) {
      pick.append(h('div', { class: 'panel row between' }, h('div', {}, h('b', {}, elegido.nombre_completo), h('div', { class: 'small muted' }, [elegido.barrio, nombreDe(elegido.cobrador_id)].filter(Boolean).join(' · '))),
        h('button', { class: 'btn small', type: 'button', on: { click: () => { elegido = null; pintarPick(); calc(); } } }, 'Cambiar')));
    } else {
      pick.append(h('div', { class: 'search' }, icon('search', 20), buscar), resultados);
      mostrar();
    }
  }
  function mostrar() {
    const t = norm(buscar.value);
    const f = (t ? cls.filter((c) => norm(c.nombre_completo + ' ' + c.documento).includes(t)) : cls).slice(0, 6);
    resultados.replaceChildren(...f.map((c) => h('button', { type: 'button', class: 'item', style: { width: '100%', textAlign: 'left', background: 'none', border: 0, paddingLeft: '14px' }, on: { click: () => { elegido = c; pintarPick(); calc(); } } },
      h('div', { class: 'grow' }, h('div', { class: 'name' }, c.nombre_completo), h('div', { class: 'meta' }, h('span', {}, c.barrio || ''), h('span', {}, c.documento || ''))))));
    if (!f.length) resultados.replaceChildren(h('p', { class: 'muted', style: { padding: '12px' } }, 'No hay clientes con ese nombre.'));
  }
  buscar.addEventListener('input', mostrar);

  const valor = moneyInput({ 'aria-label': 'Valor prestado' });
  const pct = h('input', { type: 'number', inputmode: 'decimal', min: '0', step: '0.5', placeholder: '20', 'aria-label': 'Porcentaje de interés' });
  const mod = selectEl([['DIARIO', 'Diario'], ['SEMANAL', 'Semanal'], ['QUINCENAL', 'Quincenal'], ['MENSUAL', 'Mensual']], 'DIARIO');
  const cuotas = h('input', { type: 'number', inputmode: 'numeric', min: '1', max: '120', placeholder: '24' });
  const fecha = h('input', { type: 'date', value: hoyCO() });
  const cuentasOk = S.cuentas.filter((c) => c.tipo !== 'EFECTIVO' && c.tipo !== 'PAPELERIA');
  const cuenta = selectEl(cuentasOk.map((c) => [c.id, c.nombre]));
  const medio = segmented([['EFECTIVO', 'Efectivo'], ['TRANSFERENCIA', 'Transferencia']], 'EFECTIVO', (v) => { cuentaBox.style.display = v === 'TRANSFERENCIA' ? '' : 'none'; });
  const cuentaBox = h('div', { style: { display: 'none' } }, field('Cuenta de la que sale', cuenta));
  const descPap = segmented([['SI', 'Sí, descontar'], ['NO', 'No descontar']], 'SI', () => calc());
  const pagaCom = segmented([['SI', 'Sí, pagar'], ['NO', 'No pagar']], 'SI');
  const prev = h('div', { class: 'panel' });

  function calc() {
    const v = moneyVal(valor), p = Number(pct.value), n = Number(cuotas.value);
    if (!v || pct.value === '' || !n) { prev.replaceChildren(h('p', { class: 'muted' }, 'Completa valor, interés y cuotas para ver el resumen.')); return null; }
    const conPap = descPap.get() === 'SI';
    const pap = conPap ? Math.round(v * pctPap / 100) : 0, ent = v - pap, int = Math.round(v * p / 100), tot = v + int, cuota = Math.round(tot / n);
    const cal = calendario(mod.value, primerPago(mod.value, fecha.value), n, omite);
    prev.replaceChildren(
      h('div', { class: 'line' }, h('span', { class: 'grow' }, 'Valor prestado'), h('span', { class: 'amt' }, money(v))),
      h('div', { class: 'line' }, h('span', { class: 'grow' }, conPap ? 'Papelería (' + pctPap + ' %)' : 'Papelería (no se descuenta)'), h('span', { class: 'amt' }, money(pap))),
      h('div', { class: 'line' }, h('b', { class: 'grow' }, 'Se entrega al cliente'), h('b', { class: 'amt' }, money(ent))),
      h('div', { class: 'line' }, h('span', { class: 'grow' }, 'Interés (' + p + ' %)'), h('span', { class: 'amt' }, money(int))),
      h('div', { class: 'line' }, h('b', { class: 'grow' }, 'Total a cobrar'), h('b', { class: 'amt' }, money(tot))),
      h('div', { class: 'line' }, h('span', { class: 'grow' }, n + ' cuotas de'), h('span', { class: 'amt' }, money(cuota))),
      h('div', { class: 'line' }, h('span', { class: 'grow' }, 'Primer cobro'), h('span', { class: 'amt' }, fdate(cal[0]))),
      h('div', { class: 'line' }, h('span', { class: 'grow' }, 'Última cuota'), h('span', { class: 'amt' }, fdate(cal[cal.length - 1]))));
    return { v, p, n };
  }
  [valor, pct, cuotas, fecha].forEach((e) => e.addEventListener('input', calc));
  mod.addEventListener('change', calc);

  const crear = h('button', { class: 'btn primary block', on: { click: (e) => busy(e.currentTarget, async () => {
    if (!elegido) throw new Error('Elige el cliente.');
    const r = calc();
    if (!r) throw new Error('Completa el valor, el interés y el número de cuotas.');
    if (medio.get() === 'TRANSFERENCIA' && !cuentasOk.length) throw new Error('No hay cuentas disponibles para el desembolso.');
    const id = await q(sb.rpc('crear_prestamo', { p_cliente: elegido.id, p_valor: r.v, p_porcentaje: r.p, p_modalidad: mod.value, p_cuotas: r.n, p_cuenta: medio.get() === 'TRANSFERENCIA' ? cuenta.value : null, p_medio: medio.get(), p_fecha_desembolso: fecha.value, p_descuenta_papeleria: descPap.get() === 'SI', p_paga_comision: pagaCom.get() === 'SI' }));
    toast('Préstamo creado'); location.hash = '#/prestamo/' + id;
  }) } }, 'Crear préstamo');

  view.replaceChildren(h('div', { class: 'stack' },
    h('div', { class: 'panel' }, h('div', { class: 'h2' }, 'Cliente'), pick),
    h('div', { class: 'panel' }, h('div', { class: 'h2' }, 'Condiciones'),
      field('Valor prestado', valor), h('div', { class: 'grid2' }, field('Interés (%)', pct, 'Lo define quien presta'), field('Número de cuotas', cuotas)),
      h('div', { class: 'grid2' }, field('Modalidad de cobro', mod), field('Fecha de desembolso', fecha)),
      h('div', { class: 'field' }, h('label', {}, 'Cómo se entrega el dinero'), medio), cuentaBox,
      h('div', { class: 'field' }, h('label', {}, 'Papelería al cliente (' + pctPap + ' %)'), descPap),
      h('div', { class: 'field' }, h('label', {}, 'Comisión para el cobrador'), pagaCom, h('p', { class: 'hint' }, 'Si eliges "No pagar", este préstamo no suma a la comisión de la liquidación.'))),
    h('div', { class: 'section' }, h('h3', {}, 'Resumen'), prev), crear));
  pintarPick(); calc();
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
      const [cajas, pagos, gastos] = await Promise.all([
        q(sb.from('cajas').select('*').eq('fecha', d)),
        q(sb.from('pagos').select('cobrador_id,valor,metodo,caja_id').eq('fecha_pago', d).eq('estado_pago', 'VIGENTE')),
        q(sb.from('gastos').select('usuario_id,valor,metodo').eq('fecha', d).eq('metodo', 'EFECTIVO'))
      ]);
      const cobs = S.profiles.filter((p) => p.rol === 'COBRADOR' && p.estado === 'ACTIVO');
      if (!cobs.length) { out.replaceChildren(empty('No hay cobradores activos', 'Activa a los cobradores desde Usuarios.')); return; }
      out.replaceChildren(h('div', { class: 'stack' }, cobs.map((c) => tarjetaCaja(c, cajas.find((x) => x.cobrador_id === c.id), pagos.filter((p) => p.cobrador_id === c.id), gastos.filter((g) => g.usuario_id === c.id), d))));
    } catch (e) { fail(e); out.replaceChildren(empty('No se pudo cargar la caja', 'Inténtalo de nuevo.')); }
  }

  function tarjetaCaja(c, cj, pagos, gastos, d) {
    const ef = sum(pagos.filter((p) => p.metodo === 'EFECTIVO' && (!cj || cj.estado === 'ABIERTA' ? !p.caja_id : p.caja_id === cj.id)), 'valor');
    const tr = sum(pagos.filter((p) => p.metodo === 'TRANSFERENCIA'), 'valor');
    const gs = sum(gastos, 'valor');
    const cerrada = cj && cj.estado === 'CERRADA';
    const base = cj ? Number(cj.base_inicial) : 0;
    const esperado = cerrada ? Number(cj.total_esperado) : base + ef - gs;
    const cuerpo = [];
    if (!cj) {
      cuerpo.push(h('p', { class: 'muted', style: { margin: '10px 0' } }, 'Aún no se ha abierto la caja de este cobrador.'),
        h('button', { class: 'btn primary block', on: { click: () => abrir(c, d) } }, 'Abrir caja'));
    } else {
      cuerpo.push(h('div', { class: 'kv', style: { marginTop: '10px' } }, kvc('Base entregada', money(base)), kvc('Cobros en efectivo', money(cerrada ? cj.total_cobros_efectivo : ef)), kvc('Gastos en efectivo', money(cerrada ? cj.total_gastos : gs)), kvc('Transferencias', money(tr))),
        h('div', { class: 'line', style: { marginTop: '6px' } }, h('b', { class: 'grow' }, 'Efectivo esperado'), h('b', { class: 'amt' }, money(esperado))));
      if (cerrada) {
        const df = Number(cj.diferencia);
        cuerpo.push(h('div', { class: 'line' }, h('span', { class: 'grow' }, 'Entregó ' + money(cj.dinero_entregado)), h('b', { class: 'amt ' + (df < 0 ? 'neg' : df > 0 ? 'pos' : '') }, df === 0 ? 'Cuadrado' : (df < 0 ? 'Faltan ' : 'Sobran ') + money(Math.abs(df)))));
      } else {
        cuerpo.push(h('button', { class: 'btn primary block', style: { marginTop: '8px' }, on: { click: () => cerrar(cj, esperado, c) } }, 'Cerrar caja'));
      }
    }
    return h('div', { class: 'panel' }, h('div', { class: 'row between' }, h('b', { style: { fontSize: '18px' } }, c.nombre), h('span', { class: 'tag ' + (cerrada ? 'ok' : cj ? 'warn' : '') }, cerrada ? 'Cerrada' : cj ? 'Abierta' : 'Sin abrir')), cuerpo);
  }
  const kvc = (k, v) => h('div', {}, h('div', { class: 'k' }, k), h('div', { class: 'v' }, v));

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
