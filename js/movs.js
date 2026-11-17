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

// Filas de detalle (para abrir al tocar un concepto)
export const fPago = (x) => ({ t: (x.clientes && x.clientes.nombre_completo) || 'Cliente', s: ftime(x.hora_pago) + (x.metodo === 'TRANSFERENCIA' ? ' · ' + nomCta(x.cuenta_destino_id) : ' · Efectivo'), v: x.valor, href: '#/prestamo/' + x.prestamo_id });
export const fGasto = (g) => ({ t: g.categoria + (g.descripcion ? ' · ' + g.descripcion : ''), s: g.metodo === 'TRANSFERENCIA' ? 'Desde ' + nomCta(g.cuenta_id) : 'Efectivo', v: g.valor });
export const fPrest = (x) => ({ t: (x.clientes && x.clientes.nombre_completo) || 'Cliente',
  s: (tipoTxt[x.tipo_operacion] || x.tipo_operacion || '') + ' · papelería ' + money(x.valor_papeleria) + ' · entregado ' + money(x.valor_entregado) + (x.medio_desembolso === 'TRANSFERENCIA' ? ' · desde ' + nomCta(x.cuenta_id) : ''),
  v: x.valor_prestado, href: '#/prestamo/' + x.id });

export const SEL_PRESTAMOS = 'id,cobrador_id,valor_prestado,valor_papeleria,valor_entregado,medio_desembolso,tipo_operacion,cuenta_id,clientes(nombre_completo)';
export const SEL_PAGOS = 'prestamo_id,cobrador_id,valor,metodo,caja_id,hora_pago,cuenta_destino_id,clientes(nombre_completo)';
export const SEL_GASTOS = 'usuario_id,valor,metodo,categoria,descripcion,cuenta_id';
