// Movimientos del día: misma estructura para Caja y Resumen del día (cobrador y supervisión).
// Cada concepto muestra nombre, cantidad y valor total; al tocarlo se abre el detalle.
import { h, money, ftime, sheet, empty } from './lib.js';
import { S } from './state.js';

export const sumv = (arr, k) => arr.reduce((a, r) => a + Number(r[k] || 0), 0);
const nomCta = (id) => (S.cuentas.find((x) => x.id === id) || {}).nombre || 'Cuenta';
const tipoTxt = { NUEVO: 'Nuevo', RENOVACION: 'Renovación', REFINANCIACION: 'Refinanciación', MIGRACION: 'Migración' };

export function detalle(titulo, total, filas, nota) {
  sheet(titulo + ' · ' + money(total), (close) => h('div', { class: 'stack' },
    nota ? h('p', { class: 'small muted', style: { margin: 0 } }, nota) : null,
    filas.length ? h('div', { class: 'panel' }, filas.map((f) => h(f.href ? 'a' : 'div', Object.assign({ class: 'line' }, f.href ? { href: f.href, on: { click: close } } : {}),
      h('div', { class: 'grow' }, h('b', {}, f.t), f.s ? h('div', { class: 'small muted' }, f.s) : null), h('b', { class: 'amt' }, money(f.v)))))
      : empty('Sin registros', 'No hay movimientos de este tipo en el día.')));
}

export const concepto = (nombre, filas, total, nota, tono) => h('button', { type: 'button', class: 'line tap', style: { width: '100%', textAlign: 'left', background: 'none', border: 0, padding: '10px 2px', font: 'inherit', color: 'inherit', cursor: 'pointer' }, on: { click: () => detalle(nombre, total, filas, nota) } },
  h('div', { class: 'grow' }, h('b', {}, nombre), h('div', { class: 'small muted' }, filas.length + (filas.length === 1 ? ' registro' : ' registros'))),
  h('b', { class: 'amt ' + (tono || '') }, money(total)), h('span', { class: 'muted', 'aria-hidden': 'true', style: { marginLeft: '6px' } }, '›'));

export const calcLinea = (k, v, strong) => h('div', { class: 'line' }, strong ? h('b', { class: 'grow' }, k) : h('span', { class: 'grow' }, k), strong ? h('b', { class: 'amt' }, v) : h('span', { class: 'amt' }, v));

// Estructura completa del día (igual en Caja y en Resumen, para cobrador y supervisión):
// INGRESOS y EGRESOS en efectivo → efectivo que debe entregar; y aparte lo que va por transferencia.
// p = { base, ents (filas de caja_entregas o null), pagosEf, pagosTr, gastos, prests, totEf, totGs, esperado (opcional) }
export function conceptosDia(p) {
  const gEf = p.gastos.filter((g) => g.metodo !== 'TRANSFERENCIA'), gTr = p.gastos.filter((g) => g.metodo === 'TRANSFERENCIA');
  const pEf = p.prests.filter((x) => x.medio_desembolso !== 'TRANSFERENCIA'), pTr = p.prests.filter((x) => x.medio_desembolso === 'TRANSFERENCIA');
  const ents = p.ents || null;
  const idsCaja = ents ? new Set(ents.map((e) => e.prestamo_id)) : null;
  const pOficina = idsCaja ? pEf.filter((x) => !idsCaja.has(x.id)) : [];
  const nombreDe = (e) => (e.prestamos && e.prestamos.clientes && e.prestamos.clientes.nombre_completo) || ((p.prests.find((x) => x.id === e.prestamo_id) || {}).clientes || {}).nombre_completo || 'Cliente';
  const fPago = (x) => ({ t: (x.clientes && x.clientes.nombre_completo) || 'Cliente', s: ftime(x.hora_pago) + (x.metodo === 'TRANSFERENCIA' ? ' · ' + nomCta(x.cuenta_destino_id) : ' · Efectivo'), v: x.valor, href: '#/prestamo/' + x.prestamo_id });
  const fGasto = (g) => ({ t: g.categoria + (g.descripcion ? ' · ' + g.descripcion : ''), s: g.metodo === 'TRANSFERENCIA' ? 'Desde ' + nomCta(g.cuenta_id) : 'Efectivo', v: g.valor });
  const fPrest = (x) => ({ t: (x.clientes && x.clientes.nombre_completo) || 'Cliente',
    s: (tipoTxt[x.tipo_operacion] || x.tipo_operacion || '') + ' · papelería ' + money(x.valor_papeleria) + ' · entregado ' + money(x.valor_entregado) + (x.medio_desembolso === 'TRANSFERENCIA' ? ' · desde ' + nomCta(x.cuenta_id) : ''),
    v: x.valor_prestado, href: '#/prestamo/' + x.id });
  const base = Number(p.base || 0);
  const totEf = p.totEf != null ? p.totEf : sumv(p.pagosEf, 'valor');
  const totGs = p.totGs != null ? p.totGs : sumv(gEf, 'valor');
  const entM = ents ? sumv(ents, 'monto') : 0, entC = ents ? sumv(ents, 'valor_cliente') : 0;
  const ingresos = base + entM + totEf, egresos = entC + totGs;
  const esperado = p.esperado != null ? p.esperado : ingresos - egresos;
  const titulo = (t, sub) => h('div', { style: { margin: '14px 0 2px' } }, h('div', { style: { fontWeight: '800', letterSpacing: '.3px' } }, t), sub ? h('div', { class: 'small muted' }, sub) : null);
  const total = (k, v, tono) => h('div', { class: 'line', style: { borderTop: '2px solid var(--line, #d8dee9)', marginTop: '4px' } }, h('b', { class: 'grow' }, k), h('b', { class: 'amt ' + (tono || '') }, money(v)));
  const fijo = (nombre, sub, v) => h('div', { class: 'line', style: { padding: '10px 2px' } }, h('div', { class: 'grow' }, h('b', {}, nombre), h('div', { class: 'small muted' }, sub)), h('b', { class: 'amt' }, money(v)));
  return h('div', {},
    titulo('INGRESOS EN EFECTIVO', 'Dinero que entra a la caja del cobrador'),
    fijo('Base recibida', 'Efectivo que la oficina le entregó al abrir la caja', base),
    ents ? concepto('Dinero recibido para préstamos', ents.map((e) => ({ t: nombreDe(e), s: 'Entregado al cobrador para este préstamo', v: e.monto, href: '#/prestamo/' + e.prestamo_id })), entM, 'Efectivo que la oficina le dio al cobrador para prestar.') : null,
    concepto('Cobros en efectivo', p.pagosEf.map(fPago), totEf, 'Pagos de clientes recibidos en efectivo.', 'pos'),
    total('Total ingresos en efectivo', ingresos),
    titulo('EGRESOS EN EFECTIVO', 'Dinero que sale de la caja del cobrador'),
    ents ? concepto('Préstamos entregados a clientes', ents.map((e) => ({ t: nombreDe(e), s: 'Valor entregado al cliente', v: e.valor_cliente, href: '#/prestamo/' + e.prestamo_id })), entC, 'Dinero que el cobrador entregó a clientes (el valor prestado menos la papelería).') : null,
    concepto('Gastos en efectivo', gEf.map(fGasto), totGs, 'Gastos pagados con efectivo de la caja.', 'neg'),
    total('Total egresos en efectivo', egresos),
    h('div', { class: 'line', style: { background: 'var(--soft, rgba(0,0,0,.04))', borderRadius: '10px', padding: '12px 10px', marginTop: '10px' } }, h('b', { class: 'grow' }, 'EFECTIVO QUE DEBE ENTREGAR'), h('b', { class: 'amt', style: { fontSize: '18px' } }, money(esperado))),
    p.nota ? h('p', { class: 'small muted', style: { margin: '4px 2px 0' } }, p.nota) : h('p', { class: 'small muted', style: { margin: '4px 2px 0' } }, 'Ingresos en efectivo menos egresos en efectivo.'),
    titulo('POR TRANSFERENCIA', 'Van directo a una cuenta: no suman ni restan al efectivo del cobrador'),
    concepto('Cobros por transferencia', p.pagosTr.map(fPago), sumv(p.pagosTr, 'valor'), 'Ingresan a la cuenta indicada en cada cobro.'),
    concepto('Gastos por transferencia', gTr.map(fGasto), sumv(gTr, 'valor'), 'Salen de la cuenta indicada en cada gasto.', 'neg'),
    concepto('Préstamos por transferencia', pTr.map(fPrest), sumv(pTr, 'valor_prestado'), 'Préstamos pagados desde una cuenta. Valor prestado.'),
    ents ? concepto('Préstamos en efectivo pagados por la oficina', pOficina.map(fPrest), sumv(pOficina, 'valor_prestado'), 'Préstamos de la ruta que pagó la oficina en efectivo; no salen de la caja del cobrador.') : null);
}

export const SEL_PRESTAMOS = 'id,cobrador_id,valor_prestado,valor_papeleria,valor_entregado,medio_desembolso,tipo_operacion,cuenta_id,clientes(nombre_completo)';
export const SEL_PAGOS = 'prestamo_id,cobrador_id,valor,metodo,caja_id,hora_pago,cuenta_destino_id,clientes(nombre_completo)';
export const SEL_GASTOS = 'usuario_id,valor,metodo,categoria,descripcion,cuenta_id';
