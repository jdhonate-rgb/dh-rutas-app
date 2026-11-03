// Cuentas (incluye efectivo de oficina) y liquidaciones de cobradores.
import { h, clear, icon, money, fdate, ftime, toast, fail, busy, empty, skeleton, sheet, field, selectEl, segmented, moneyInput, moneyVal, hoyCO, inicioSemana, num } from './lib.js';
import { S, sb, q, isAdmin, isStaff, nombreDe } from './state.js';

const sum = (arr, k) => arr.reduce((a, r) => a + Number(r[k] || 0), 0);
const TIPO_ICON = { EFECTIVO: 'cash', NEQUI: 'wallet', BANCARIA: 'bank', PAPELERIA: 'file' };
const MOV = {
  DESEMBOLSO: 'Desembolso de préstamo', COBRO_TRANSFERENCIA: 'Cobro por transferencia', GASTO: 'Gasto', BASE_COBRADOR: 'Base entregada al cobrador',
  CIERRE_BASE: 'Base devuelta al cerrar caja', CIERRE_COBROS: 'Cobros en efectivo (cierre de caja)', CIERRE_GASTOS: 'Gastos del cobrador (cierre de caja)',
  DIFERENCIA_CAJA: 'Diferencia de caja', INGRESO_OFICINA: 'Ingreso de oficina', PAGO_LIQUIDACION: 'Pago de liquidación', RETIRO_PAPELERIA: 'Retiro de papelería', ANULACION_PAGO: 'Pago anulado', AJUSTE_ELIMINACION: 'Ajuste por eliminación', INGRESO: 'Ingreso'
};

export async function cuentas(ctx) {
  const { view } = ctx;
  ctx.setTop('Cuentas', { actions: [{ icon: 'refresh', label: 'Actualizar', fn: () => ctx.refresh() }] });
  view.replaceChildren(skeleton(5));
  let saldos, pap;
  try {
    [saldos, pap] = await Promise.all([
      q(sb.from('v_saldo_cuentas').select('*').order('nombre')),
      isStaff() ? q(sb.from('v_papeleria_por_cuenta').select('*')) : Promise.resolve([])
    ]);
  } catch (e) { fail(e); view.replaceChildren(empty('No se pudieron cargar las cuentas', 'Inténtalo de nuevo.')); return; }
  const total = sum(saldos, 'saldo_actual');
  const totalPap = sum(pap, 'papeleria_total'), empresa = sum(pap, 'parte_empresa'), cobr = sum(pap, 'parte_cobrador'), retirada = sum(pap, 'retirado'), disp = sum(pap, 'disponible');
  const conFondo = pap.filter((p) => Number(p.disponible) > 0);
  const nomCta = (id) => (saldos.find((c) => c.id === id) || {}).nombre || 'Cuenta';

  view.replaceChildren(h('div', { class: 'stack' },
    h('div', { class: 'hero' }, h('div', { class: 'ad', style: { marginTop: 0 } }, 'Dinero disponible en todas las cuentas'), h('div', { class: 'nm', style: { fontSize: '32px', marginTop: '6px' } }, money(total))),
    h('div', { class: 'ledger' }, saldos.map((c) => h('a', { class: 'item', href: '#/cuenta/' + c.id },
      h('span', { style: { marginLeft: '10px', color: 'var(--info)' } }, icon(TIPO_ICON[c.tipo] || 'bank', 26)),
      h('div', { class: 'grow' }, h('div', { class: 'name' }, c.nombre), h('div', { class: 'meta' }, h('span', {}, c.tipo === 'EFECTIVO' ? 'Efectivo de oficina' : c.tipo === 'NEQUI' ? 'Nequi' : c.tipo === 'BANCARIA' ? 'Cuenta bancaria' : 'Papelería'), (() => { const p = pap.find((x) => x.cuenta_id === c.id); return p && Number(p.papeleria_total) > 0 ? h('span', {}, 'Papelería disponible ' + money(p.disponible)) : null; })())),
      h('div', { class: 'amt', style: { fontSize: '17px' } }, money(c.saldo_actual))))),
    isStaff() ? h('div', { class: 'panel' }, h('div', { class: 'h2' }, 'Papelería'),
      h('div', { class: 'kv' }, kvc('Total acumulado', money(totalPap)), kvc('De los cobradores', money(cobr)), kvc('De la empresa', money(empresa)), kvc('Ya retirada', money(retirada))),
      h('div', { class: 'line' }, h('b', { class: 'grow' }, 'Disponible para retirar'), h('b', { class: 'amt pos' }, money(disp))),
      conFondo.length ? h('div', { class: 'small muted', style: { marginTop: '8px' } }, 'Por cuenta: ' + conFondo.map((p) => nomCta(p.cuenta_id) + ' ' + money(p.disponible)).join(' · ')) : h('div', { class: 'small muted', style: { marginTop: '8px' } }, 'No hay papelería disponible para retirar.'),
      h('div', { class: 'row', style: { marginTop: '12px' } }, h('button', { class: 'btn small', disabled: !conFondo.length, on: { click: () => retirarPapeleria(conFondo, nomCta, ctx) } }, 'Retirar papelería'),
        h('button', { class: 'btn small', on: { click: () => ingreso(saldos, null, ctx) } }, 'Ingreso de oficina'))) : null,
    isAdmin() ? h('button', { class: 'btn', on: { click: () => nuevaCuenta(ctx) } }, icon('plus'), 'Nueva cuenta') : null));
}
const kvc = (k, v) => h('div', {}, h('div', { class: 'k' }, k), h('div', { class: 'v' }, v));

export async function cuenta(ctx) {
  const { view } = ctx;
  const id = ctx.params[0];
  ctx.setTop('Cuenta', { back: '#/cuentas' });
  view.replaceChildren(skeleton(5));
  let movs, info, pc = null;
  try {
    [movs, info, pc] = await Promise.all([
      q(sb.from('v_detalle_cuenta').select('*').eq('cuenta_id', id).order('fecha', { ascending: false }).order('id', { ascending: false }).limit(120)),
      q(sb.from('v_saldo_cuentas').select('*').eq('id', id).single()),
      isStaff() ? q(sb.from('v_papeleria_por_cuenta').select('*').eq('cuenta_id', id)).then((r) => r[0] || null) : Promise.resolve(null)
    ]);
  } catch (e) { fail(e); view.replaceChildren(empty('No se pudo abrir la cuenta', 'Inténtalo de nuevo.')); return; }
  ctx.setTop(info.nombre, { back: '#/cuentas', sub: 'Saldo ' + money(info.saldo_actual) });
  const entradas = sum(movs.filter((m) => m.monto > 0), 'monto'), salidas = -sum(movs.filter((m) => m.monto < 0), 'monto');
  view.replaceChildren(h('div', { class: 'stack' },
    h('div', { class: 'hero' }, h('div', { class: 'ad', style: { marginTop: 0 } }, 'Saldo actual'), h('div', { class: 'nm', style: { fontSize: '32px', marginTop: '6px' } }, money(info.saldo_actual)),
      h('div', { class: 'ad' }, 'Saldo inicial ' + money(info.saldo_inicial))),
    pc && Number(pc.papeleria_total) > 0 ? h('div', { class: 'panel' }, h('div', { class: 'h2' }, 'Papelería en esta cuenta'),
      h('div', { class: 'kv' }, kvc('Descontada en desembolsos', money(pc.papeleria_total)), kvc('Ya retirada', money(pc.retirado))),
      h('div', { class: 'line' }, h('b', { class: 'grow' }, 'Disponible para retirar'), h('b', { class: 'amt pos' }, money(pc.disponible))),
      h('p', { class: 'hint' }, 'Es parte del saldo de la cuenta; solo se muestra aparte de forma informativa.')) : null,
    isStaff() ? h('div', { class: 'row' }, h('button', { class: 'btn small', on: { click: () => ingreso([info], info.id, ctx) } }, icon('plus', 18), 'Registrar ingreso')) : null,
    movs.length ? h('div', { class: 'panel' }, movs.map((m) => h('div', { class: 'line tap', role: 'button', tabindex: '0', style: { cursor: 'pointer' }, on: { click: () => desglose(m) } },
      h('div', { class: 'grow' }, h('div', {}, h('b', {}, MOV[m.tipo] || m.tipo), m.cliente ? ' · ' + m.cliente : ''),
        h('div', { class: 'small muted' }, fdate(m.fecha) + (m.registrado_por ? ' · ' + m.registrado_por : '') + (m.descripcion && !MOV[m.tipo] ? ' · ' + m.descripcion : '') + ' · saldo ' + money(m.saldo_acumulado))),
      h('div', { class: 'amt ' + (m.monto > 0 ? 'pos' : 'neg') }, (m.monto > 0 ? '+ ' : '− ') + money(Math.abs(m.monto)))))) : empty('Esta cuenta aún no tiene movimientos', 'Los desembolsos, cobros y gastos aparecerán aquí.')));
}

function desglose(m) {
  const staff = isStaff();
  const L = (a, b, bold) => h('div', { class: 'line' }, h(bold ? 'b' : 'span', { class: 'grow' }, a), h(bold ? 'b' : 'span', { class: 'amt' }, b));
  sheet(MOV[m.tipo] || m.tipo, (close) => {
    const box = h('div', { class: 'stack' });
    const base = h('div', { class: 'panel' },
      L('Valor', (m.monto > 0 ? '+ ' : '− ') + money(Math.abs(m.monto)), true), L('Fecha', fdate(m.fecha)), m.registrado_por ? L('Registrado por', m.registrado_por) : null,
      m.cliente ? L('Cliente', m.cliente) : null, m.descripcion ? L('Detalle', m.descripcion) : null, L('Saldo de la cuenta después', money(m.saldo_acumulado)));
    box.append(base);
    if (staff) cargar();
    async function cargar() {
      try {
        const extra = [];
        if (m.prestamo_id) {
          const p = await q(sb.from('v_prestamos_resumen').select('*').eq('id', m.prestamo_id).maybeSingle());
          if (p) {
            const pap = Number(p.valor_prestado) - Number(p.valor_entregado);
            extra.push(h('div', { class: 'panel' }, h('div', { class: 'h2' }, 'Préstamo'),
              L('Valor prestado', money(p.valor_prestado)), L('Papelería descontada', money(pap)), L('Entregado al cliente', money(p.valor_entregado)),
              L('Interés (' + Number(p.porcentaje_interes) + ' %)', money(p.total_interes)), L('Total a cobrar', money(p.total_a_cobrar), true),
              L('Cobrado', money(p.total_cobrado)), L('Saldo', money(p.saldo)), L('Cuotas', p.numero_cuotas + ' · ' + String(p.modalidad).toLowerCase()),
              h('a', { class: 'btn small', href: '#/prestamo/' + p.id, on: { click: close } }, 'Ver préstamo')));
          }
        }
        if (m.pago_id) {
          const g = await q(sb.from('pagos').select('*').eq('id', m.pago_id).maybeSingle());
          if (g) extra.push(h('div', { class: 'panel' }, h('div', { class: 'h2' }, 'Cobro'), L('Valor cobrado', money(g.valor)), L('Método', g.metodo === 'EFECTIVO' ? 'Efectivo' : 'Transferencia'),
            L('Cobrador', nombreDe(g.cobrador_id)), L('Hora', fdate(g.fecha_pago) + ' ' + ftime(g.hora_pago)), L('Saldo antes → después', money(g.saldo_anterior) + ' → ' + money(g.saldo_nuevo)), g.observacion ? L('Nota', g.observacion) : null));
        }
        if (m.gasto_id) {
          const g = await q(sb.from('gastos').select('*').eq('id', m.gasto_id).maybeSingle());
          if (g) extra.push(h('div', { class: 'panel' }, h('div', { class: 'h2' }, 'Gasto'), L('Categoría', g.categoria), g.descripcion ? L('Descripción', g.descripcion) : null, L('Registrado por', nombreDe(g.usuario_id)), L('Método', g.metodo === 'EFECTIVO' ? 'Efectivo' : 'Transferencia')));
        }
        if (m.caja_id) {
          const [cj, ps, gs] = await Promise.all([
            q(sb.from('cajas').select('*').eq('id', m.caja_id).maybeSingle()),
            q(sb.from('pagos').select('valor,metodo,cliente_id,hora_pago,clientes(nombre_completo)').eq('caja_id', m.caja_id).eq('estado_pago', 'VIGENTE').eq('metodo', 'EFECTIVO').order('hora_pago')),
            q(sb.from('gastos').select('valor,categoria,descripcion').eq('caja_id', m.caja_id).order('categoria'))
          ]);
          if (cj) extra.push(h('div', { class: 'panel' }, h('div', { class: 'h2' }, 'Caja de ' + nombreDe(cj.cobrador_id) + ' · ' + fdate(cj.fecha)),
            L('Base entregada', money(cj.base_inicial)), L('Cobros en efectivo', money(cj.total_cobros_efectivo)), L('Gastos en efectivo', money(cj.total_gastos)), L('Esperado', money(cj.total_esperado)),
            cj.dinero_entregado != null ? L('Entregó', money(cj.dinero_entregado)) : null, cj.diferencia != null ? L('Diferencia', money(cj.diferencia), true) : null));
          if (m.tipo === 'CIERRE_COBROS' && ps.length) extra.push(h('div', { class: 'panel' }, h('div', { class: 'h2' }, 'Cobros incluidos'), ps.map((p) => L((p.clientes && p.clientes.nombre_completo) || 'Cliente', money(p.valor)))));
          if (m.tipo === 'CIERRE_GASTOS' && gs.length) extra.push(h('div', { class: 'panel' }, h('div', { class: 'h2' }, 'Gastos incluidos'), gs.map((g) => L(g.categoria + (g.descripcion ? ' · ' + g.descripcion : ''), money(g.valor)))));
        }
        if (m.liquidacion_id) {
          const l = await q(sb.from('liquidaciones').select('*').eq('id', m.liquidacion_id).maybeSingle());
          if (l) extra.push(h('div', { class: 'panel' }, h('div', { class: 'h2' }, 'Liquidación'), L('Cobrador', nombreDe(l.cobrador_id)), L('Periodo', fdate(l.fecha_inicio) + ' al ' + fdate(l.fecha_fin)),
            L('Pago base', money(l.pago_base)), L('Comisión de papelería', money(l.comision_papeleria)), L('Faltantes', money(l.total_faltantes)), L('Neto pagado', money(l.neto_pagado), true)));
        }
        box.append(...extra);
      } catch (e) { fail(e); }
    }
    return box;
  });
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

function retirarPapeleria(conFondo, nomCta, ctx) {
  const disp = (id) => Number((conFondo.find((p) => p.cuenta_id === id) || {}).disponible || 0);
  const opciones = conFondo.map((p) => [p.cuenta_id, nomCta(p.cuenta_id) + ' · disponible ' + money(p.disponible)]);
  const sel = selectEl(opciones, opciones[0][0]); const m = moneyInput();
  const max = h('button', { type: 'button', class: 'chip', on: { click: () => { m.value = num(disp(sel.value)); } } }, 'Retirar todo lo disponible');
  const concepto = h('input', { type: 'text', value: 'Retiro de papelería' });
  sheet('Retirar papelería', (close) => h('div', {},
    h('p', { class: 'muted', style: { marginBottom: '12px' } }, 'Solo se puede retirar de una cuenta que tenga papelería de un desembolso, y hasta el valor disponible en ella.'),
    field('Cuenta', sel), field('Valor', m), h('div', { style: { marginBottom: '14px' } }, max), field('Concepto', concepto),
    h('button', { class: 'btn primary block', on: { click: (e) => busy(e.currentTarget, async () => {
      const v = moneyVal(m);
      if (v <= 0) throw new Error('Escribe el valor.');
      if (v > disp(sel.value)) throw new Error('Esa cuenta solo tiene ' + money(disp(sel.value)) + ' de papelería disponible.');
      await q(sb.rpc('retirar_papeleria', { p_partes: [{ cuenta: sel.value, monto: v }], p_concepto: concepto.value.trim() || 'Retiro de papelería' }));
      close(); toast('Retiro de ' + money(v) + ' registrado'); ctx.refresh();
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
