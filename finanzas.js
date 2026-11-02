// Cuentas (incluye efectivo de oficina) y liquidaciones de cobradores.
import { h, clear, icon, money, fdate, ftime, toast, fail, busy, empty, skeleton, sheet, field, selectEl, segmented, moneyInput, moneyVal, hoyCO, inicioSemana, num } from './lib.js';
import { S, sb, q, isAdmin, nombreDe } from './state.js';

const sum = (arr, k) => arr.reduce((a, r) => a + Number(r[k] || 0), 0);
const TIPO_ICON = { EFECTIVO: 'cash', NEQUI: 'wallet', BANCARIA: 'bank', PAPELERIA: 'file' };
const MOV = {
  DESEMBOLSO: 'Desembolso de préstamo', COBRO_TRANSFERENCIA: 'Cobro por transferencia', GASTO: 'Gasto', BASE_COBRADOR: 'Base entregada al cobrador',
  CIERRE_BASE: 'Base devuelta al cerrar caja', CIERRE_COBROS: 'Cobros en efectivo (cierre de caja)', CIERRE_GASTOS: 'Gastos del cobrador (cierre de caja)',
  DIFERENCIA_CAJA: 'Diferencia de caja', INGRESO_OFICINA: 'Ingreso de oficina', PAGO_LIQUIDACION: 'Pago de liquidación', RETIRO_PAPELERIA: 'Retiro de papelería', ANULACION_PAGO: 'Pago anulado'
};

export async function cuentas(ctx) {
  const { view } = ctx;
  ctx.setTop('Cuentas', { actions: [{ icon: 'refresh', label: 'Actualizar', fn: () => ctx.refresh() }] });
  view.replaceChildren(skeleton(5));
  let saldos, pap;
  try {
    [saldos, pap] = await Promise.all([
      q(sb.from('v_saldo_cuentas').select('*').order('nombre')),
      q(sb.from('v_papeleria_por_cuenta').select('*'))
    ]);
  } catch (e) { fail(e); view.replaceChildren(empty('No se pudieron cargar las cuentas', 'Inténtalo de nuevo.')); return; }
  const total = sum(saldos, 'saldo_actual');
  const totalPap = sum(pap, 'papeleria_total'), empresa = sum(pap, 'parte_empresa'), cobr = sum(pap, 'parte_cobrador');

  view.replaceChildren(h('div', { class: 'stack' },
    h('div', { class: 'hero' }, h('div', { class: 'ad', style: { marginTop: 0 } }, 'Dinero disponible en todas las cuentas'), h('div', { class: 'nm', style: { fontSize: '32px', marginTop: '6px' } }, money(total))),
    h('div', { class: 'ledger' }, saldos.map((c) => h('a', { class: 'item', href: '#/cuenta/' + c.id },
      h('span', { style: { marginLeft: '10px', color: 'var(--info)' } }, icon(TIPO_ICON[c.tipo] || 'bank', 26)),
      h('div', { class: 'grow' }, h('div', { class: 'name' }, c.nombre), h('div', { class: 'meta' }, h('span', {}, c.tipo === 'EFECTIVO' ? 'Efectivo de oficina' : c.tipo === 'NEQUI' ? 'Nequi' : c.tipo === 'BANCARIA' ? 'Cuenta bancaria' : 'Papelería'))),
      h('div', { class: 'amt', style: { fontSize: '17px' } }, money(c.saldo_actual))))),
    h('div', { class: 'panel' }, h('div', { class: 'h2' }, 'Papelería acumulada'),
      h('div', { class: 'kv' }, kvc('Total', money(totalPap)), kvc('De la empresa', money(empresa)), kvc('De los cobradores', money(cobr)), kvc('Retirada', 'Ver movimientos')),
      h('div', { class: 'row', style: { marginTop: '12px' } }, h('button', { class: 'btn small', on: { click: () => retirarPapeleria(saldos, ctx) } }, 'Retirar papelería'),
        h('button', { class: 'btn small', on: { click: () => ingreso(saldos, null, ctx) } }, 'Ingreso de oficina'))),
    isAdmin() ? h('button', { class: 'btn', on: { click: () => nuevaCuenta(ctx) } }, icon('plus'), 'Nueva cuenta') : null));
}
const kvc = (k, v) => h('div', {}, h('div', { class: 'k' }, k), h('div', { class: 'v' }, v));

export async function cuenta(ctx) {
  const { view } = ctx;
  const id = ctx.params[0];
  ctx.setTop('Cuenta', { back: '#/cuentas' });
  view.replaceChildren(skeleton(5));
  let movs, info;
  try {
    [movs, info] = await Promise.all([
      q(sb.from('v_detalle_cuenta').select('*').eq('cuenta_id', id).order('fecha', { ascending: false }).order('id', { ascending: false }).limit(120)),
      q(sb.from('v_saldo_cuentas').select('*').eq('id', id).single())
    ]);
  } catch (e) { fail(e); view.replaceChildren(empty('No se pudo abrir la cuenta', 'Inténtalo de nuevo.')); return; }
  ctx.setTop(info.nombre, { back: '#/cuentas', sub: 'Saldo ' + money(info.saldo_actual) });
  const entradas = sum(movs.filter((m) => m.monto > 0), 'monto'), salidas = -sum(movs.filter((m) => m.monto < 0), 'monto');
  view.replaceChildren(h('div', { class: 'stack' },
    h('div', { class: 'hero' }, h('div', { class: 'ad', style: { marginTop: 0 } }, 'Saldo actual'), h('div', { class: 'nm', style: { fontSize: '32px', marginTop: '6px' } }, money(info.saldo_actual)),
      h('div', { class: 'ad' }, 'Saldo inicial ' + money(info.saldo_inicial))),
    h('div', { class: 'row' }, h('button', { class: 'btn small', on: { click: () => ingreso([info], info.id, ctx) } }, icon('plus', 18), 'Registrar ingreso')),
    movs.length ? h('div', { class: 'panel' }, movs.map((m) => h('div', { class: 'line' },
      h('div', { class: 'grow' }, h('div', {}, h('b', {}, MOV[m.tipo] || m.tipo), m.cliente ? ' · ' + m.cliente : ''),
        h('div', { class: 'small muted' }, fdate(m.fecha) + (m.registrado_por ? ' · ' + m.registrado_por : '') + (m.descripcion && !MOV[m.tipo] ? ' · ' + m.descripcion : '') + ' · saldo ' + money(m.saldo_acumulado))),
      h('div', { class: 'amt ' + (m.monto > 0 ? 'pos' : 'neg') }, (m.monto > 0 ? '+ ' : '− ') + money(Math.abs(m.monto)))))) : empty('Esta cuenta aún no tiene movimientos', 'Los desembolsos, cobros y gastos aparecerán aquí.')));
}

function ingreso(saldos, fija, ctx) {
  const monto = moneyInput(); const concepto = h('input', { type: 'text', placeholder: 'Ej.: aporte del socio' });
  const cta = selectEl(saldos.filter((c) => c.tipo !== 'PAPELERIA').map((c) => [c.id, c.nombre]), fija || (saldos.find((c) => c.tipo === 'EFECTIVO') || saldos[0]).id);
  sheet('Ingreso de oficina', (close) => h('div', {}, fija ? null : field('Cuenta que recibe', cta), field('Valor', monto), field('Concepto', concepto),
    h('button', { class: 'btn primary block', on: { click: (e) => busy(e.currentTarget, async () => {
      if (moneyVal(monto) <= 0) throw new Error('Escribe el valor del ingreso.');
      await q(sb.rpc('registrar_ingreso_oficina', { p_cuenta: fija || cta.value, p_monto: moneyVal(monto), p_concepto: concepto.value.trim() || 'Ingreso de oficina' }));
      close(); toast('Ingreso de ' + money(moneyVal(monto)) + ' registrado'); ctx.refresh();
    }) } }, 'Guardar ingreso')));
}

function retirarPapeleria(saldos, ctx) {
  const opciones = saldos.filter((c) => c.tipo !== 'PAPELERIA').map((c) => [c.id, c.nombre]);
  const filas = h('div', {});
  const concepto = h('input', { type: 'text', value: 'Retiro de papelería' });
  const agregar = () => {
    const sel = selectEl(opciones, opciones[0][0]); const m = moneyInput();
    const fila = h('div', { class: 'grid2', style: { marginBottom: '10px' } }, sel, m);
    fila.sel = sel; fila.m = m; filas.append(fila);
  };
  agregar();
  sheet('Retirar papelería', (close) => h('div', {},
    h('p', { class: 'muted', style: { marginBottom: '12px' } }, 'Puedes repartir el retiro entre varias cuentas. Se descuenta de cada una.'),
    filas, h('button', { class: 'btn small', type: 'button', style: { marginBottom: '14px' }, on: { click: agregar } }, icon('plus', 18), 'Agregar otra cuenta'),
    field('Concepto', concepto),
    h('button', { class: 'btn primary block', on: { click: (e) => busy(e.currentTarget, async () => {
      const partes = [...filas.children].map((f) => ({ cuenta: f.sel.value, monto: moneyVal(f.m) })).filter((p) => p.monto > 0);
      if (!partes.length) throw new Error('Escribe al menos un valor.');
      await q(sb.rpc('retirar_papeleria', { p_partes: partes, p_concepto: concepto.value.trim() || 'Retiro de papelería' }));
      close(); toast('Retiro de ' + money(sum(partes, 'monto')) + ' registrado'); ctx.refresh();
    }) } }, 'Registrar retiro')));
}

function nuevaCuenta(ctx) {
  const nombre = h('input', { type: 'text', placeholder: 'Ej.: Nequi 3' });
  const tipo = selectEl([['NEQUI', 'Nequi'], ['BANCARIA', 'Cuenta bancaria'], ['EFECTIVO', 'Efectivo'], ['PAPELERIA', 'Papelería']], 'NEQUI');
  const saldo = moneyInput();
  sheet('Nueva cuenta', (close) => h('div', {}, field('Nombre', nombre), field('Tipo', tipo), field('Saldo inicial', saldo),
    h('button', { class: 'btn primary block', on: { click: (e) => busy(e.currentTarget, async () => {
      if (!nombre.value.trim()) throw new Error('Escribe el nombre de la cuenta.');
      await q(sb.from('cuentas').insert({ nombre: nombre.value.trim(), tipo: tipo.value, saldo_inicial: moneyVal(saldo), fecha_saldo_inicial: hoyCO() }));
      S.cuentas = await q(sb.from('cuentas').select('id,codigo,nombre,tipo,activa').eq('activa', true).order('nombre'));
      close(); toast('Cuenta creada'); ctx.refresh();
    }) } }, 'Crear cuenta')));
}

// ---------------------------------------------------------------- Liquidaciones
export async function liquidaciones(ctx) {
  const { view } = ctx;
  ctx.setTop('Liquidaciones', { actions: [{ icon: 'refresh', label: 'Actualizar', fn: () => ctx.refresh() }] });
  view.replaceChildren(skeleton(4));
  let rows;
  try { rows = await q(sb.from('liquidaciones').select('*').order('created_at', { ascending: false }).limit(100)); }
  catch (e) { fail(e); view.replaceChildren(empty('No se pudieron cargar las liquidaciones', 'Inténtalo de nuevo.')); return; }
  view.replaceChildren(h('div', { class: 'stack' },
    rows.length ? h('div', { class: 'ledger' }, rows.map((l) => h('a', { class: 'item ' + (l.estado === 'PAGADA' ? 's-ok' : 's-hoy'), href: '#/liquidacion/' + l.id },
      h('div', { class: 'grow' }, h('div', { class: 'name' }, nombreDe(l.cobrador_id)), h('div', { class: 'meta' }, h('span', {}, fdate(l.fecha_inicio) + ' al ' + fdate(l.fecha_fin)), h('span', { class: l.estado === 'PAGADA' ? 'okc' : '' }, l.estado === 'PAGADA' ? 'Pagada' : 'Pendiente de pago'))),
      l.estado === 'PAGADA' ? h('div', { class: 'plate paid' }, money(l.neto_pagado), h('small', {}, 'pagado')) : h('span', { class: 'muted' }, icon('chev', 20))))) : empty('Aún no hay liquidaciones', 'Crea la primera para calcular el pago semanal de un cobrador.'),
    h('button', { class: 'btn primary fab', on: { click: () => nuevaLiq() } }, icon('plus'), 'Nueva liquidación')));

  function nuevaLiq() {
    const cobs = S.profiles.filter((p) => p.rol === 'COBRADOR' && p.estado === 'ACTIVO');
    const cob = selectEl(cobs.map((c) => [c.id, c.nombre]));
    const ini = h('input', { type: 'date', value: inicioSemana(hoyCO()) }); const fin = h('input', { type: 'date', value: hoyCO() });
    sheet('Nueva liquidación', (close) => h('div', {},
      field('Cobrador', cob), h('div', { class: 'grid2' }, field('Desde', ini), field('Hasta', fin)),
      h('p', { class: 'hint', style: { marginBottom: '14px' } }, 'Se calcula con el pago base, la comisión de papelería de los préstamos del periodo y los faltantes de caja pendientes.'),
      h('button', { class: 'btn primary block', on: { click: (e) => busy(e.currentTarget, async () => {
        if (!cobs.length) throw new Error('No hay cobradores activos.');
        const id = await q(sb.rpc('crear_liquidacion', { p_cobrador: cob.value, p_inicio: ini.value, p_fin: fin.value }));
        close(); location.hash = '#/liquidacion/' + id;
      }) } }, 'Calcular liquidación')));
  }
}

export async function liquidacion(ctx) {
  const { view } = ctx;
  const id = ctx.params[0];
  ctx.setTop('Liquidación', { back: '#/liquidaciones' });
  view.replaceChildren(skeleton(4));
  let l, aj;
  try {
    [l, aj] = await Promise.all([q(sb.from('liquidaciones').select('*').eq('id', id).single()), q(sb.from('liq_ajustes').select('*').eq('liquidacion_id', id).order('fecha'))]);
  } catch (e) { fail(e); view.replaceChildren(empty('No se pudo abrir la liquidación', 'Inténtalo de nuevo.')); return; }
  ctx.setTop(nombreDe(l.cobrador_id), { back: '#/liquidaciones', sub: fdate(l.fecha_inicio) + ' al ' + fdate(l.fecha_fin) });
  const ajuste = aj.reduce((a, x) => a + (x.tipo === 'BONO' ? Number(x.valor) : -Number(x.valor)), 0);
  const neto = Math.max(Number(l.pago_base) + Number(l.comision_papeleria) - Number(l.total_faltantes) + ajuste, 0);
  const pagada = l.estado === 'PAGADA';
  view.replaceChildren(h('div', { class: 'stack' },
    h('div', { class: 'hero' }, h('div', { class: 'ad', style: { marginTop: 0 } }, pagada ? 'Pagado' : 'Total a pagar'), h('div', { class: 'due' }, h('div', { class: 'lbl' }, pagada ? 'Liquidación pagada' : 'Pendiente de pago'), h('div', { class: 'plate' }, money(pagada ? l.neto_pagado : neto)))),
    h('div', { class: 'panel' },
      linea('Pago base', money(l.pago_base)), linea('Comisión de papelería', '+ ' + money(l.comision_papeleria)), linea('Faltantes de caja', '− ' + money(l.total_faltantes)),
      aj.map((x) => h('div', { class: 'line' }, h('div', { class: 'grow' }, h('div', {}, x.tipo === 'BONO' ? 'Bono' : 'Descuento'), h('div', { class: 'small muted' }, x.motivo || '')), h('div', { class: 'amt ' + (x.tipo === 'BONO' ? 'pos' : 'neg') }, (x.tipo === 'BONO' ? '+ ' : '− ') + money(x.valor)))),
      h('div', { class: 'line' }, h('b', { class: 'grow' }, 'Neto'), h('b', { class: 'amt' }, money(pagada ? l.neto_pagado : neto)))),
    pagada ? h('p', { class: 'muted small' }, 'Pagada el ' + fdate(l.fecha_pago) + ' por ' + (l.metodo === 'EFECTIVO' ? 'efectivo' : 'transferencia') + '.')
      : h('div', { class: 'stack' },
        h('button', { class: 'btn', on: { click: () => agregarAjuste(l, ctx) } }, icon('plus'), 'Agregar descuento o bono'),
        h('div', { class: 'actionbar' }, h('button', { class: 'btn primary block', on: { click: () => pagar(l, neto, ctx) } }, 'Pagar ' + money(neto))))));
}
const linea = (l, v) => h('div', { class: 'line' }, h('span', { class: 'grow' }, l), h('span', { class: 'amt' }, v));

function agregarAjuste(l, ctx) {
  const tipo = segmented([['DESCUENTO', 'Descuento'], ['BONO', 'Bono']], 'DESCUENTO');
  const val = moneyInput(); const motivo = h('input', { type: 'text', placeholder: 'Motivo' });
  sheet('Descuento o bono', (close) => h('div', {}, h('div', { class: 'field' }, h('label', {}, 'Tipo'), tipo), field('Valor', val), field('Motivo', motivo),
    h('button', { class: 'btn primary block', on: { click: (e) => busy(e.currentTarget, async () => {
      if (moneyVal(val) <= 0) throw new Error('Escribe el valor.');
      if (!motivo.value.trim()) throw new Error('Escribe el motivo.');
      await q(sb.from('liq_ajustes').insert({ liquidacion_id: l.id, tipo: tipo.get(), valor: moneyVal(val), motivo: motivo.value.trim() }));
      close(); toast('Guardado'); ctx.refresh();
    }) } }, 'Guardar')));
}
function pagar(l, neto, ctx) {
  const cuentasOk = S.cuentas.filter((c) => c.tipo !== 'EFECTIVO' && c.tipo !== 'PAPELERIA');
  const metodo = segmented([['EFECTIVO', 'Efectivo'], ['TRANSFERENCIA', 'Transferencia']], 'EFECTIVO', (v) => { box.style.display = v === 'TRANSFERENCIA' ? '' : 'none'; });
  const cuenta = selectEl(cuentasOk.map((c) => [c.id, c.nombre]));
  const box = h('div', { style: { display: 'none' } }, field('Cuenta de la que sale', cuenta));
  sheet('Pagar liquidación', (close) => h('div', {}, h('p', { class: 'muted', style: { marginBottom: '12px' } }, nombreDe(l.cobrador_id) + ' · ' + money(neto)),
    h('div', { class: 'field' }, h('label', {}, 'Cómo se paga'), metodo), box,
    h('button', { class: 'btn primary block', on: { click: (e) => busy(e.currentTarget, async () => {
      const m = metodo.get();
      if (m === 'TRANSFERENCIA' && !cuentasOk.length) throw new Error('No hay cuentas disponibles.');
      await q(sb.rpc('pagar_liquidacion', { p_liq: l.id, p_metodo: m, p_cuenta: m === 'TRANSFERENCIA' ? cuenta.value : null }));
      close(); toast('Liquidación pagada'); ctx.refresh();
    }) } }, 'Confirmar pago')));
}
