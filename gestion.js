// Clientes, préstamos y cuadre de caja (supervisión y administración).
import { h, clear, icon, money, fdate, toast, fail, busy, empty, skeleton, sheet, field, selectEl, segmented, moneyInput, moneyVal, hoyCO, addDays, addMonths, num, clean, confirmarEliminar } from './lib.js';
import { S, sb, q, isAdmin, nombreDe, cfgNum } from './state.js';

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

// ---------------------------------------------------------------- Préstamos
export async function prestamos(ctx) {
  const { view } = ctx;
  ctx.setTop('Préstamos', { actions: [{ icon: 'refresh', label: 'Actualizar', fn: () => ctx.refresh() }] });
  view.replaceChildren(skeleton(6));
  let rows;
  try { rows = await q(sb.from('v_prestamos_resumen').select('id,nombre_completo,modalidad,estado,saldo,valor_prestado,dias_atraso,cobrador_id,fecha_desembolso,cuotas_pagadas,numero_cuotas,tipo_operacion').order('fecha_desembolso', { ascending: false }).limit(1000)); }
  catch (e) { fail(e); view.replaceChildren(empty('No se pudieron cargar los préstamos', 'Inténtalo de nuevo.')); return; }
  let estado = 'ACTIVO', texto = '';
  const lista = h('div', {});
  const chips = h('div', { class: 'chips' }, [['ACTIVO', 'Activos'], ['PAGADO', 'Pagados'], ['ARCHIVADO', 'Archivados'], ['TODOS', 'Todos']].map(([v, t]) =>
    h('button', { class: 'chip' + (estado === v ? ' on' : ''), on: { click: (e) => { estado = v; [...chips.children].forEach((x) => x.classList.remove('on')); e.currentTarget.classList.add('on'); pintar(); } } }, t)));
  const buscar = h('input', { type: 'search', placeholder: 'Buscar cliente', 'aria-label': 'Buscar', on: { input: (e) => { texto = norm(e.target.value); pintar(); } } });
  function pintar() {
    const f = rows.filter((r) => (estado === 'TODOS' || (estado === 'ARCHIVADO' ? ARCHIVADOS.includes(r.estado) : r.estado === estado)) && (!texto || norm(r.nombre_completo).includes(texto)));
    const saldo = sum(f.filter((r) => r.estado === 'ACTIVO'), 'saldo');
    if (!f.length) { lista.replaceChildren(empty('No hay préstamos', 'Crea el primero con el botón Nuevo préstamo.')); return; }
    lista.replaceChildren(h('div', { class: 'row between muted small', style: { margin: '6px 2px 8px' } }, h('span', {}, f.length + (f.length === 1 ? ' préstamo' : ' préstamos')), estado === 'ACTIVO' || estado === 'TODOS' ? h('b', {}, 'Saldo ' + money(saldo)) : null),
      h('div', { class: 'ledger' }, f.slice(0, 300).map((r) => h('a', { class: 'item ' + (r.dias_atraso > 0 && r.estado === 'ACTIVO' ? 's-late' : r.estado === 'ACTIVO' ? 's-hoy' : 's-ok'), href: '#/prestamo/' + r.id },
        h('div', { class: 'grow' }, h('div', { class: 'name' }, r.nombre_completo), h('div', { class: 'meta' }, h('span', {}, cap(r.modalidad)), h('span', {}, r.cuotas_pagadas + '/' + r.numero_cuotas + ' cuotas'), r.estado === 'ACTIVO' && r.dias_atraso > 0 ? h('span', { class: 'late' }, r.dias_atraso + ' d de atraso') : null, h('span', {}, nombreDe(r.cobrador_id)), r.tipo_operacion !== 'NUEVO' ? h('span', { class: 'tag' }, TIPOS[r.tipo_operacion]) : null)),
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
  const qa = ctx.query.anterior || null;
  let tipo = qa ? (ctx.query.tipo === 'REFINANCIACION' ? 'REFINANCIACION' : 'RENOVACION') : (ctx.query.tipo === 'MIGRACION' ? 'MIGRACION' : 'NUEVO');
  const TITULO = { NUEVO: 'Nuevo préstamo', MIGRACION: 'Migrar préstamo', RENOVACION: 'Renovar préstamo', REFINANCIACION: 'Refinanciar préstamo' };
  ctx.setTop(TITULO[tipo], { back: qa ? '#/prestamo/' + qa : '#/prestamos' });
  view.replaceChildren(skeleton(4));
  let cls, ant = null;
  try {
    cls = await q(sb.from('clientes').select('id,nombre_completo,documento,barrio,cobrador_id').eq('estado', 'ACTIVO').order('nombre_completo').limit(2000));
    if (qa) ant = await q(sb.from('v_prestamos_resumen').select('*').eq('id', qa).single());
  } catch (e) { fail(e); view.replaceChildren(empty('No se pudo preparar el formulario', 'Inténtalo de nuevo.')); return; }

  let elegido = ant ? cls.find((c) => c.id === ant.cliente_id) || { id: ant.cliente_id, nombre_completo: ant.nombre_completo } : (ctx.query.cliente ? cls.find((c) => c.id === ctx.query.cliente) : null);
  const pctPap = cfgNum('PCT_PAPELERIA_CLIENTE', 0);
  const omite = S.cfg.DIARIO_OMITE_DOMINGO === 'SI';
  const conDinero = () => tipo === 'NUEVO' || tipo === 'RENOVACION';   // solo ahí sale dinero y se descuenta papelería

  const pick = h('div', {});
  const buscar = h('input', { type: 'search', placeholder: 'Escribe el nombre o documento', autocomplete: 'off' });
  const resultados = h('div', { class: 'ledger', style: { marginTop: '8px' } });
  function pintarPick() {
    clear(pick);
    if (elegido) {
      pick.append(h('div', { class: 'panel row between' }, h('div', {}, h('b', {}, elegido.nombre_completo), h('div', { class: 'small muted' }, [elegido.barrio, nombreDe(elegido.cobrador_id)].filter(Boolean).join(' · '))),
        qa ? null : h('button', { class: 'btn small', type: 'button', on: { click: () => { elegido = null; pintarPick(); calc(); } } }, 'Cambiar')));
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
  const mod = selectEl([['DIARIO', 'Diario'], ['SEMANAL', 'Semanal'], ['QUINCENAL', 'Quincenal'], ['MENSUAL', 'Mensual']], ant ? ant.modalidad : 'DIARIO');
  const cuotas = h('input', { type: 'number', inputmode: 'numeric', min: '1', max: '120', placeholder: '24' });
  const fecha = h('input', { type: 'date', value: hoyCO() });
  const primer = h('input', { type: 'date' });
  let primerManual = false; let lastEnt = 0;
  const defPrimer = () => primerPago(mod.value, fecha.value);
  const syncPrimer = () => { if (!primerManual) primer.value = defPrimer(); };
  primer.addEventListener('input', () => { primerManual = true; });
  const volver = h('button', { type: 'button', class: 'btn small', on: { click: () => { primerManual = false; syncPrimer(); calc(); } } }, 'Usar la fecha por defecto');
  const entrega = segmented([['NO', 'No'], ['SI', 'Sí, el cobrador lo lleva']], 'NO', (v) => { entBox.style.display = v === 'SI' ? '' : 'none'; if (v === 'SI' && !moneyVal(entMonto) && lastEnt) entMonto.value = num(lastEnt); calc(); });
  const entMonto = moneyInput({ 'aria-label': 'Dinero entregado al cobrador' });
  const entBox = h('div', { style: { display: 'none' } }, field('Dinero entregado al cobrador para este préstamo', entMonto, 'Obligatorio. Entra a la caja abierta de hoy del cobrador y queda en el cuadre. Debe ser mínimo lo que recibe el cliente.'));
  const yaPag = moneyInput({ 'aria-label': 'Ya cobrado' });
  const cuentasOk = S.cuentas.filter((c) => c.tipo !== 'EFECTIVO' && c.tipo !== 'PAPELERIA');
  const cuenta = selectEl(cuentasOk.map((c) => [c.id, c.nombre]));
  const medio = segmented([['EFECTIVO', 'Efectivo'], ['TRANSFERENCIA', 'Transferencia']], 'EFECTIVO', (v) => { cuentaBox.style.display = v === 'TRANSFERENCIA' ? '' : 'none'; const e = document.getElementById('bEntrega'); if (e) e.style.display = v === 'TRANSFERENCIA' ? 'none' : ''; if (v === 'TRANSFERENCIA') { setSeg(entrega, 'NO'); entBox.style.display = 'none'; } });
  const cuentaBox = h('div', { style: { display: 'none' } }, field('Cuenta de la que sale', cuenta));
  const descPap = segmented([['SI', 'Sí, descontar'], ['NO', 'No descontar']], 'SI', () => calc());
  const pagaCom = segmented([['SI', 'Sí, pagar'], ['NO', 'No pagar']], conDinero() ? 'SI' : 'NO');
  const prev = h('div', { class: 'panel' });

  const selTipo = qa ? null : segmented([['NUEVO', 'Nuevo'], ['MIGRACION', 'Migración']], tipo, (v) => { tipo = v; ctx.setTop(TITULO[tipo], { back: '#/prestamos' }); setSeg(pagaCom, conDinero() ? 'SI' : 'NO'); aplicarTipo(); calc(); });
  const info = h('div', {});
  const bValor = field('Valor prestado', valor);
  const bYa = h('div', {}, field('Ya cobrado hasta hoy', yaPag, 'Lo que el cliente ya pagó de este préstamo. No mueve dinero de las cuentas.'));
  const bDinero = h('div', {}, h('div', { class: 'field' }, h('label', {}, 'Cómo se entrega el dinero'), medio), cuentaBox,
    h('div', { class: 'field', id: 'bEntrega' }, h('label', {}, '¿El dinero se lo lleva el cobrador al cliente?'), entrega), entBox,
    h('div', { class: 'field' }, h('label', {}, 'Papelería al cliente (' + pctPap + ' %)'), descPap, h('p', { class: 'hint' }, 'Se descuenta al entregar el dinero, pero la deuda del cliente no baja.')));
  const lblFecha = h('label', {}, 'Fecha de desembolso');
  const bFecha = h('div', { class: 'field' }, lblFecha, fecha);
  function aplicarTipo() {
    bValor.style.display = tipo === 'REFINANCIACION' ? 'none' : '';
    bYa.style.display = tipo === 'MIGRACION' ? '' : 'none';
    bDinero.style.display = conDinero() ? '' : 'none';
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
    const conPap = conDinero() && descPap.get() === 'SI';
    const pap = conPap ? Math.round(v * pctPap / 100) : 0, ent = v - pap, int = Math.round(v * p / 100), tot = v + int, cuota = Math.round(tot / n);
    lastEnt = ent;
    const ya = tipo === 'MIGRACION' ? moneyVal(yaPag) : 0;
    if (ya >= tot) { prev.replaceChildren(h('p', { class: 'err' }, 'Lo ya cobrado (' + money(ya) + ') debe ser menor al total a cobrar (' + money(tot) + ').')); return null; }
    const cal = calendario(mod.value, primer.value || defPrimer(), n, omite);
    const L = (a, b, bold) => h('div', { class: 'line' }, h(bold ? 'b' : 'span', { class: 'grow' }, a), h(bold ? 'b' : 'span', { class: 'amt' }, b));
    prev.replaceChildren(...[
      L(tipo === 'REFINANCIACION' ? 'Saldo que se refinancia' : 'Valor prestado', money(v)),
      conDinero() ? L('Papelería (' + (conPap ? pctPap + ' %' : 'no se descuenta') + ')', money(pap)) : null,
      conDinero() ? L('Se entrega al cliente', money(ent), true) : null,
      L('Interés (' + p + ' %)', money(int)),
      L('Total a cobrar', money(tot), true),
      ya ? L('Ya cobrado', '− ' + money(ya)) : null,
      ya ? L('Saldo pendiente', money(tot - ya), true) : null,
      L(n + ' cuotas de', money(cuota)),
      L(tipo === 'MIGRACION' ? 'Primera cuota' : 'Primer cobro', fdate(cal[0])),
      entrega.get() === 'SI' && conDinero() ? L('Entregado al cobrador', money(moneyVal(entMonto) || 0)) : null,
      L('Última cuota', fdate(cal[cal.length - 1]))].filter(Boolean));
    return { v, p, n, ya };
  }
  [valor, pct, cuotas, yaPag, primer, entMonto].forEach((e) => e.addEventListener('input', calc));
  fecha.addEventListener('input', () => { syncPrimer(); calc(); });
  mod.addEventListener('change', () => { syncPrimer(); calc(); });

  const crear = h('button', { class: 'btn primary block', on: { click: (e) => busy(e.currentTarget, async () => {
    if (!elegido) throw new Error('Elige el cliente.');
    const r = calc();
    if (!r) throw new Error('Completa los datos del préstamo.');
    if (conDinero() && medio.get() === 'EFECTIVO' && entrega.get() === 'SI' && !(moneyVal(entMonto) > 0)) throw new Error('Escribe el dinero entregado al cobrador.');
    if (conDinero() && medio.get() === 'TRANSFERENCIA' && !cuentasOk.length) throw new Error('No hay cuentas disponibles para el desembolso.');
    const id = await q(sb.rpc('crear_prestamo', {
      p_cliente: elegido.id, p_valor: r.v, p_porcentaje: r.p, p_modalidad: mod.value, p_cuotas: r.n,
      p_cuenta: conDinero() && medio.get() === 'TRANSFERENCIA' ? cuenta.value : null, p_medio: conDinero() ? medio.get() : 'EFECTIVO',
      p_fecha_desembolso: fecha.value, p_anterior: qa, p_tipo: tipo, p_ya_pagado: r.ya,
      p_descuenta_papeleria: conDinero() ? descPap.get() === 'SI' : null, p_paga_comision: pagaCom.get() === 'SI',
      p_fecha_primer_pago: primer.value || null,
      p_entrega_cobrador: conDinero() && medio.get() === 'EFECTIVO' && entrega.get() === 'SI' ? moneyVal(entMonto) : null }));
    toast({ NUEVO: 'Préstamo creado', MIGRACION: 'Préstamo migrado', RENOVACION: 'Préstamo renovado', REFINANCIACION: 'Préstamo refinanciado' }[tipo]); location.hash = '#/prestamo/' + id;
  }) } }, 'Guardar préstamo');

  view.replaceChildren(h('div', { class: 'stack' },
    selTipo ? h('div', { class: 'panel' }, h('div', { class: 'h2' }, 'Tipo de préstamo'), selTipo) : null,
    info,
    h('div', { class: 'panel' }, h('div', { class: 'h2' }, 'Cliente'), pick),
    h('div', { class: 'panel' }, h('div', { class: 'h2' }, 'Condiciones'),
      bValor, h('div', { class: 'grid2' }, field('Interés (%)', pct, 'Lo define quien presta'), field('Número de cuotas', cuotas)),
      h('div', { class: 'grid2' }, field('Modalidad de cobro', mod), bFecha),
      h('div', { class: 'field' }, h('label', {}, 'Fecha del primer cobro'), primer, h('p', { class: 'hint' }, 'Sale la que corresponde según la modalidad; si quieres otra, cámbiala. ', volver)),
      bYa, bDinero,
      h('div', { class: 'field' }, h('label', {}, 'Comisión para el cobrador'), pagaCom, h('p', { class: 'hint' }, 'Si eliges "No pagar", este préstamo no suma a la comisión de la liquidación.'))),
    h('div', { class: 'section' }, h('h3', {}, 'Resumen'), prev), crear));
  aplicarTipo(); syncPrimer(); pintarPick(); calc();
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
      const cobs = S.profiles.filter((p) => p.rol === 'COBRADOR' && p.estado === 'ACTIVO');
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
        ents.length ? h('div', { class: 'small muted', style: { margin: '6px 2px' } }, ents.map((e) => ((e.prestamos && e.prestamos.clientes && e.prestamos.clientes.nombre_completo) || 'Cliente') + ' ' + money(e.monto)).join(' · ')) : null,
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
