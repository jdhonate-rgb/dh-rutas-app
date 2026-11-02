// Gastos y resumen del día.
import { h, clear, icon, money, fdate, ftime, toast, fail, busy, empty, skeleton, field, selectEl, segmented, moneyInput, moneyVal, hoyCO, inicioSemana, addDays } from './lib.js';
import { S, sb, q, isStaff, nombreDe } from './state.js';
import { cuentaSesion } from './admin.js';

const CATS = ['Gasolina', 'Alimentación', 'Reparación de moto', 'Transporte', 'Papelería', 'Otros'];

export async function gastos(ctx) {
  const { view } = ctx;
  const staff = isStaff();
  ctx.setTop('Gastos', { actions: [{ icon: 'refresh', label: 'Actualizar', fn: () => ctx.refresh() }] });

  const cat = selectEl(CATS.map((c) => [c, c]), 'Gasolina');
  const det = h('input', { type: 'text', placeholder: 'Detalle (opcional)', maxlength: '120' });
  const val = moneyInput();
  const cuentasOk = S.cuentas.filter((c) => c.tipo !== 'EFECTIVO' && c.tipo !== 'PAPELERIA');
  const metodo = staff ? segmented([['EFECTIVO', 'Efectivo'], ['TRANSFERENCIA', 'Transferencia']], 'EFECTIVO', (v) => { cuentaBox.style.display = v === 'TRANSFERENCIA' ? '' : 'none'; }) : null;
  const cuenta = selectEl(cuentasOk.map((c) => [c.id, c.nombre]));
  const cuentaBox = h('div', { style: { display: 'none' } }, field('Cuenta de la que sale', cuenta));
  const guardar = h('button', { class: 'btn primary block', on: { click: (e) => busy(e.currentTarget, async () => {
    const v = moneyVal(val);
    if (v <= 0) throw new Error('Escribe el valor del gasto.');
    const m = metodo ? metodo.get() : 'EFECTIVO';
    if (m === 'TRANSFERENCIA' && !cuentasOk.length) throw new Error('No hay cuentas disponibles.');
    await q(sb.rpc('registrar_gasto', { p_categoria: cat.value, p_descripcion: det.value.trim() || null, p_valor: v, p_metodo: m, p_cuenta: m === 'TRANSFERENCIA' ? cuenta.value : null, p_obs: null }));
    toast('Gasto de ' + money(v) + ' guardado');
    val.value = ''; det.value = '';
    cargar();
  }) } }, icon('plus'), 'Guardar gasto');

  const lista = h('div', {});
  const desde = h('input', { type: 'date', value: staff ? inicioSemana(hoyCO()) : addDays(hoyCO(), -14) });
  const hasta = h('input', { type: 'date', value: hoyCO() });
  const filtro = h('div', { class: 'grid2' }, field('Desde', desde), field('Hasta', hasta));
  desde.addEventListener('change', () => cargar()); hasta.addEventListener('change', () => cargar());

  view.replaceChildren(h('div', { class: 'stack' },
    h('div', { class: 'panel' }, h('div', { class: 'h2' }, 'Nuevo gasto'), field('Categoría', cat), field('Detalle', det), field('Valor', val), metodo ? h('div', { class: 'field' }, h('label', {}, 'Cómo se pagó'), metodo) : null, cuentaBox, guardar,
      staff ? null : h('p', { class: 'hint', style: { marginTop: '10px' } }, 'Los gastos en efectivo se descuentan de tu caja al cuadrar con la supervisora.')),
    h('div', { class: 'section' }, h('h3', {}, 'Gastos registrados'), filtro, lista)));

  async function cargar() {
    lista.replaceChildren(skeleton(3));
    try {
      const rows = await q(sb.from('gastos').select('*').gte('fecha', desde.value).lte('fecha', hasta.value).order('fecha', { ascending: false }).limit(300));
      const total = rows.reduce((a, r) => a + Number(r.valor), 0);
      if (!rows.length) { lista.replaceChildren(empty('Sin gastos en este rango', 'Los gastos que registres aparecerán aquí.')); return; }
      lista.replaceChildren(
        h('div', { class: 'row between', style: { margin: '4px 2px 8px' } }, h('span', { class: 'muted' }, rows.length + (rows.length === 1 ? ' gasto' : ' gastos')), h('b', {}, money(total))),
        h('div', { class: 'panel' }, rows.map((r) => h('div', { class: 'line' },
          h('div', { class: 'grow' }, h('div', {}, h('b', {}, r.categoria), r.descripcion ? ' · ' + r.descripcion : ''),
            h('div', { class: 'small muted' }, fdate(r.fecha) + (staff ? ' · ' + (nombreDe(r.usuario_id) || 'Oficina') : '') + ' · ' + (r.metodo === 'EFECTIVO' ? 'Efectivo' : 'Transferencia'))),
          h('div', { class: 'amt neg' }, money(r.valor))))));
    } catch (e) { fail(e); lista.replaceChildren(empty('No se pudieron cargar los gastos', 'Inténtalo de nuevo.')); }
  }
  cargar();
}

// ---------------------------------------------------------------- Resumen del día
export async function resumen(ctx) {
  const { view } = ctx;
  ctx.setTop('Resumen del día', { sub: fdate(hoyCO(), true), actions: [{ icon: 'refresh', label: 'Actualizar', fn: () => ctx.refresh() }] });
  view.replaceChildren(skeleton(4));
  try { await (isStaff() ? resumenStaff(ctx) : resumenCobrador(ctx)); }
  catch (e) { fail(e); view.replaceChildren(empty('No se pudo cargar el resumen', 'Revisa tu conexión e inténtalo de nuevo.')); }
}

async function resumenCobrador(ctx) {
  const hoy = hoyCO();
  const [pagos, gastosHoy, cajas, ruta] = await Promise.all([
    q(sb.from('pagos').select('*,clientes(nombre_completo)').eq('fecha_pago', hoy).eq('estado_pago', 'VIGENTE').order('hora_pago', { ascending: false })),
    q(sb.from('gastos').select('*').eq('fecha', hoy)),
    q(sb.from('cajas').select('*').eq('fecha', hoy)),
    q(sb.from('v_ruta').select('valor_a_cobrar'))
  ]);
  const caja = cajas[0];
  const efectivo = sum(pagos.filter((p) => p.metodo === 'EFECTIVO'), 'valor');
  const transf = sum(pagos.filter((p) => p.metodo === 'TRANSFERENCIA'), 'valor');
  const gast = sum(gastosHoy.filter((g) => g.metodo === 'EFECTIVO'), 'valor');
  const base = caja ? Number(caja.base_inicial) : 0;
  const entregar = base + efectivo - gast;
  const faltan = ruta.filter((r) => Number(r.valor_a_cobrar) > 0);
  ctx.view.replaceChildren(h('div', { class: 'stack' },
    h('div', { class: 'hero' },
      h('div', { class: 'ad', style: { marginTop: 0 } }, 'Efectivo que debes entregar'),
      h('div', { class: 'due' }, h('div', { class: 'lbl' }, caja && caja.estado === 'CERRADA' ? 'Caja cerrada' : caja ? 'Caja abierta' : 'Caja sin abrir'), h('div', { class: 'plate' }, money(entregar)))),
    h('div', { class: 'strip' },
      stat('Cobrado hoy', money(efectivo + transf), 'good'), stat('Falta por cobrar', money(sum(faltan, 'valor_a_cobrar')), ''),
      stat('En efectivo', money(efectivo)), stat('Por transferencia', money(transf))),
    h('div', { class: 'panel' },
      linea('Base recibida', money(base)), linea('Cobros en efectivo', '+ ' + money(efectivo)), linea('Gastos en efectivo', '− ' + money(gast)),
      h('div', { class: 'line' }, h('b', { class: 'grow' }, 'Efectivo a entregar'), h('b', { class: 'amt' }, money(entregar))),
      caja && caja.estado === 'CERRADA' ? h('div', { class: 'line' }, h('span', { class: 'grow' }, 'Resultado del cuadre'), h('b', { class: 'amt ' + (Number(caja.diferencia) < 0 ? 'neg' : 'pos') }, Number(caja.diferencia) === 0 ? 'Cuadrado' : (Number(caja.diferencia) < 0 ? 'Faltan ' : 'Sobran ') + money(Math.abs(caja.diferencia)))) : null),
    h('div', { class: 'section' }, h('h3', {}, 'Cobros de hoy (' + pagos.length + ')'),
      pagos.length ? h('div', { class: 'panel' }, pagos.map((p) => h('div', { class: 'line' },
        h('div', { class: 'grow' }, h('div', {}, h('b', {}, p.clientes ? p.clientes.nombre_completo : 'Cliente')), h('div', { class: 'small muted' }, ftime(p.hora_pago) + ' · ' + (p.metodo === 'EFECTIVO' ? 'Efectivo' : 'Transferencia'))),
        h('div', { class: 'amt pos' }, money(p.valor))))) : empty('Todavía no hay cobros', 'Cuando registres un cobro aparecerá aquí.')),
    cuentaSesion(ctx)));
}

async function resumenStaff(ctx) {
  const dia = h('input', { type: 'date', value: hoyCO() });
  const out = h('div', {});
  ctx.view.replaceChildren(h('div', { class: 'stack' }, field('Día', dia), out));
  dia.addEventListener('change', () => cargar());
  async function cargar() {
    out.replaceChildren(skeleton(3));
    try {
      const [res, gas, cajas, pend] = await Promise.all([
        q(sb.from('v_resumen_dia').select('*').eq('fecha', dia.value)),
        q(sb.from('gastos').select('usuario_id,valor,metodo').eq('fecha', dia.value)),
        q(sb.from('cajas').select('cobrador_id,estado,diferencia').eq('fecha', dia.value)),
        dia.value === hoyCO() ? q(sb.from('v_ruta').select('cobrador_id,valor_a_cobrar')) : Promise.resolve([])
      ]);
      const cobs = S.profiles.filter((p) => p.rol === 'COBRADOR' && p.estado === 'ACTIVO');
      const filas = cobs.map((c) => {
        const r = res.find((x) => x.cobrador_id === c.id) || {};
        const g = sum(gas.filter((x) => x.usuario_id === c.id && x.metodo === 'EFECTIVO'), 'valor');
        const cj = cajas.find((x) => x.cobrador_id === c.id);
        return { c, n: Number(r.num_cobros || 0), ef: Number(r.efectivo || 0), tr: Number(r.transferencias || 0), g, caja: cj, falta: sum(pend.filter((x) => x.cobrador_id === c.id), 'valor_a_cobrar') };
      });
      const tot = { ef: sum(filas, 'ef'), tr: sum(filas, 'tr'), g: sum(gas, 'valor') };
      out.replaceChildren(h('div', { class: 'stack' },
        h('div', { class: 'strip' }, stat('Cobrado', money(tot.ef + tot.tr), 'good'), stat('Gastos', money(tot.g), 'bad'), stat('Efectivo', money(tot.ef)), stat('Transferencias', money(tot.tr))),
        filas.length ? filas.map((f) => h('div', { class: 'panel' },
          h('div', { class: 'row between' }, h('b', {}, f.c.nombre), h('span', { class: 'tag ' + (f.caja ? (f.caja.estado === 'CERRADA' ? 'ok' : 'warn') : '') }, f.caja ? (f.caja.estado === 'CERRADA' ? 'Caja cerrada' : 'Caja abierta') : 'Sin caja')),
          h('div', { class: 'kv', style: { marginTop: '10px' } }, kvc('Cobros', f.n + ''), kvc('Total cobrado', money(f.ef + f.tr)), kvc('Efectivo', money(f.ef)), kvc('Transferencias', money(f.tr)), kvc('Gastos en efectivo', money(f.g)), dia.value === hoyCO() ? kvc('Falta por cobrar', money(f.falta)) : kvc('Cuadre', f.caja && f.caja.estado === 'CERRADA' ? (Number(f.caja.diferencia) === 0 ? 'Cuadrado' : money(f.caja.diferencia)) : '—')))) : empty('No hay cobradores activos', 'Activa cobradores desde Usuarios.')));
    } catch (e) { fail(e); out.replaceChildren(empty('No se pudo cargar', 'Inténtalo de nuevo.')); }
  }
  cargar();
}

const sum = (arr, k) => arr.reduce((a, r) => a + Number(r[k] || 0), 0);
const stat = (l, v, cls) => h('div', { class: 'stat ' + (cls || '') }, h('div', { class: 'v' }, v), h('div', { class: 'l' }, l));
const linea = (l, v) => h('div', { class: 'line' }, h('span', { class: 'grow' }, l), h('span', { class: 'amt' }, v));
const kvc = (k, v) => h('div', {}, h('div', { class: 'k' }, k), h('div', { class: 'v' }, v));
