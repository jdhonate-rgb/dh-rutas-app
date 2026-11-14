// Gastos y resumen del día.
import { h, clear, icon, money, fdate, ftime, toast, fail, busy, empty, skeleton, sheet, field, selectEl, segmented, moneyInput, moneyVal, hoyCO, inicioSemana, addDays, confirmarEliminar } from './lib.js';
import { S, sb, q, isStaff, nombreDe, esCob } from './state.js';
import { cuentaSesion } from './admin.js';
import { conceptosDia, SEL_PRESTAMOS, SEL_PAGOS, SEL_GASTOS } from './movs.js';

const CATS = ['Gasolina', 'Alimentación', 'Reparación de moto', 'Transporte', 'Papelería', 'Otros'];

export async function gastos(ctx) {
  const { view } = ctx;
  const staff = isStaff();
  ctx.setTop('Gastos', { actions: [{ icon: 'refresh', label: 'Actualizar', fn: () => ctx.refresh() }] });

  const cat = selectEl(CATS.map((c) => [c, c]), 'Gasolina');
  const det = h('input', { type: 'text', placeholder: 'Detalle (opcional)', maxlength: '120' });
  const val = moneyInput();
  const permTr = !staff && S.profile && S.profile.gastos_transferencia === true;
  const misCuentas = new Set((S.profile && S.profile.cuentas_permitidas) || []);
  const cuentasOk = S.cuentas.filter((c) => c.tipo !== 'EFECTIVO' && c.tipo !== 'PAPELERIA' && (staff || misCuentas.has(c.id)));
  const metodo = (staff || (permTr && cuentasOk.length)) ? segmented([['EFECTIVO', 'Efectivo'], ['TRANSFERENCIA', 'Transferencia']], 'EFECTIVO', (v) => { cuentaBox.style.display = v === 'TRANSFERENCIA' ? '' : 'none'; }) : null;
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
  const desde = h('input', { type: 'date', value: staff ? inicioSemana(hoyCO()) : hoyCO() });
  const hasta = h('input', { type: 'date', value: hoyCO() });
  // El cobrador solo ve los gastos de hoy (sin filtro de fechas); la supervisión conserva el filtro.
  const filtro = staff ? h('div', { class: 'grid2' }, field('Desde', desde), field('Hasta', hasta)) : null;
  desde.addEventListener('change', () => cargar()); hasta.addEventListener('change', () => cargar());

  view.replaceChildren(h('div', { class: 'stack' },
    h('div', { class: 'panel' }, h('div', { class: 'h2' }, 'Nuevo gasto'), field('Categoría', cat), field('Detalle', det), field('Valor', val), metodo ? h('div', { class: 'field' }, h('label', {}, 'Cómo se pagó'), metodo) : null, cuentaBox, guardar,
      staff ? null : h('p', { class: 'hint', style: { marginTop: '10px' } }, 'Los gastos en efectivo se descuentan de tu caja al cuadrar con la supervisora. Los gastos por transferencia salen de la cuenta que elijas y no afectan tu efectivo.')),
    h('div', { class: 'section' }, h('h3', {}, staff ? 'Gastos registrados' : 'Gastos de hoy'), filtro, lista)));

  async function cargar() {
    lista.replaceChildren(skeleton(3));
    try {
      if (!staff) { desde.value = hoyCO(); hasta.value = hoyCO(); }
      const rows = await q(sb.from('gastos').select('*').gte('fecha', desde.value).lte('fecha', hasta.value).order('fecha', { ascending: false }).limit(300));
      const total = rows.reduce((a, r) => a + Number(r.valor), 0);
      if (!rows.length) { lista.replaceChildren(empty(staff ? 'Sin gastos en este rango' : 'Aún no registras gastos hoy', 'Los gastos que registres aparecerán aquí.')); return; }
      lista.replaceChildren(
        h('div', { class: 'row between', style: { margin: '4px 2px 8px' } }, h('span', { class: 'muted' }, rows.length + (rows.length === 1 ? ' gasto' : ' gastos')), h('b', {}, money(total))),
        h('div', { class: 'panel' }, rows.map((r) => h('div', { class: 'line' },
          h('div', { class: 'grow' }, h('div', {}, h('b', {}, r.categoria), r.descripcion ? ' · ' + r.descripcion : ''),
            h('div', { class: 'small muted' }, fdate(r.fecha) + (staff ? ' · ' + (nombreDe(r.usuario_id) || 'Oficina') : '') + ' · ' + (r.metodo === 'EFECTIVO' ? 'Efectivo' : 'Transferencia'))),
          h('div', { class: 'amt neg' }, money(r.valor)),
          staff ? h('button', { class: 'icon-btn', style: { color: 'var(--bad)' }, 'aria-label': 'Eliminar gasto', on: { click: () => confirmarEliminar({ titulo: 'Eliminar gasto de ' + money(r.valor), texto: 'El gasto se borra y, si salió de una cuenta o de una caja, el dinero se reversa.', onOk: async (m) => { await q(sb.rpc('eliminar_gasto', { p_gasto: r.id, p_motivo: m })); toast('Gasto eliminado'); cargar(); } }) } }, icon('trash', 20)) : null))));
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
  let efDisp = null; try { const x = await q(sb.rpc('mi_efectivo_disponible')); efDisp = x == null ? null : Number(x); } catch { efDisp = null; }
  let rd = null; try { rd = await q(sb.rpc('mi_resumen_dia', { p_fecha: hoy })); } catch { rd = null; }
  const [pagos, gastosHoy, cajas, ruta, prestQ, entQ] = await Promise.all([
    q(sb.from('pagos').select('*,clientes(nombre_completo)').eq('fecha_pago', hoy).eq('estado_pago', 'VIGENTE').order('hora_pago', { ascending: false })),
    q(sb.from('gastos').select('*').eq('fecha', hoy)),
    q(sb.from('cajas').select('*').eq('fecha', hoy)),
    q(sb.from('v_ruta').select('prestamo_id,nombre_completo,barrio,valor_a_cobrar,dias_atraso').gt('valor_a_cobrar', 0).order('nombre_completo')),
    q(sb.from('prestamos').select(SEL_PRESTAMOS).eq('fecha_desembolso', hoy).order('created_at')).catch(() => null),
    q(sb.from('caja_entregas').select('prestamo_id,monto,valor_cliente,cajas!inner(fecha),prestamos(clientes(nombre_completo))').eq('cajas.fecha', hoy)).catch(() => null)
  ]);
  const caja = cajas[0];
  const efectivo = sum(pagos.filter((p) => p.metodo === 'EFECTIVO'), 'valor');
  const transf = sum(pagos.filter((p) => p.metodo === 'TRANSFERENCIA'), 'valor');
  const gast = sum(gastosHoy.filter((g) => g.metodo === 'EFECTIVO'), 'valor');
  const gastTr = sum(gastosHoy.filter((g) => g.metodo === 'TRANSFERENCIA'), 'valor');
  const base = caja ? Number(caja.base_inicial) : 0;
  const entregar = efDisp != null ? efDisp : base + efectivo - gast;   // incluye préstamos hechos desde su caja
  const prest = (rd && rd.prestamos) || [];
  const prestHoy = prestQ || prest.map((p) => ({ id: p.prestamo_id, valor_prestado: p.valor, valor_papeleria: p.papeleria, valor_entregado: p.entregado, medio_desembolso: p.medio, tipo_operacion: p.tipo, clientes: { nombre_completo: p.cliente } }));
  const pctCom = rd ? Number(rd.pct_comision) : 40;
  const entregaCaja = Math.max(base + efectivo - gast - entregar, 0);
  const faltan = ruta.filter((r) => Number(r.valor_a_cobrar) > 0);
  ctx.view.replaceChildren(h('div', { class: 'stack' },
    h('div', { class: 'hero' },
      h('div', { class: 'ad', style: { marginTop: 0 } }, 'Efectivo que debes entregar'),
      h('div', { class: 'due' }, h('div', { class: 'lbl' }, caja && caja.estado === 'CERRADA' ? 'Caja cerrada' : caja ? 'Caja abierta' : 'Caja sin abrir'), h('div', { class: 'plate' }, money(entregar)))),
    h('div', { class: 'strip' },
      statBtn('Cobrado hoy', money(efectivo + transf), 'good', () => detallePagos('Cobrado hoy', pagos)),
      statBtn('Falta por cobrar', money(sum(faltan, 'valor_a_cobrar')), '', () => detalleFaltan(faltan))),
    h('div', { class: 'panel' }, h('div', { class: 'h2' }, 'Movimientos del día'),
      conceptosDia({ pagosEf: pagos.filter((p) => p.metodo === 'EFECTIVO'), pagosTr: pagos.filter((p) => p.metodo === 'TRANSFERENCIA'), gastos: gastosHoy, prests: prestHoy, base, ents: entQ, esperado: caja && caja.estado === 'CERRADA' ? Number(caja.total_esperado) : (entQ ? undefined : entregar) })),
    S.profile && S.profile.cobra_comision === false ? null : h('div', { class: 'panel' }, h('div', { class: 'h2' }, 'Comisión por papelería'),
      linea('Papelería de tus préstamos hoy', money(rd ? rd.papeleria_hoy : 0)),
      linea('Comisión de hoy (' + pctCom + ' %)', money(rd ? rd.comision_hoy : 0)),
      linea('Comisión de la semana', money(rd ? rd.comision_semana : 0)),
      h('p', { class: 'small muted', style: { margin: '4px 0 0' } }, 'Toda la papelería es de la empresa. Tu comisión se te paga en efectivo en tu liquidación.')),
    h('div', { class: 'panel' },
      h('div', { class: 'line' }, h('b', { class: 'grow' }, 'Efectivo a entregar'), h('b', { class: 'amt' }, money(entregar))),
      caja && caja.estado === 'CERRADA' ? h('div', { class: 'line' }, h('span', { class: 'grow' }, 'Resultado del cuadre'), h('b', { class: 'amt ' + (Number(caja.diferencia) < 0 ? 'neg' : 'pos') }, Number(caja.diferencia) === 0 ? 'Cuadrado' : (Number(caja.diferencia) < 0 ? 'Faltan ' : 'Sobran ') + money(Math.abs(caja.diferencia)))) : null),
    cuentaSesion(ctx)));
}

async function resumenStaff(ctx) {
  const dia = h('input', { type: 'date', value: hoyCO() });
  const cobs = S.profiles.filter((p) => esCob(p) && p.estado === 'ACTIVO');
  const sel = selectEl([['', 'Todos'], ...cobs.map((c) => [c.id, c.nombre])], '');
  const out = h('div', {});
  ctx.view.replaceChildren(h('div', { class: 'stack' }, h('div', { class: 'row', style: { gap: '10px', alignItems: 'flex-end' } }, h('div', { style: { flex: 1 } }, field('Día', dia)), h('div', { style: { flex: 1 } }, field('Cobrador', sel))), out));
  let datos = null;
  dia.addEventListener('change', () => cargar());
  sel.addEventListener('change', () => pintar());
  async function cargar() {
    out.replaceChildren(skeleton(3));
    try {
      const [gas, cajas, pend, pgs, pres, ents] = await Promise.all([
        q(sb.from('gastos').select(SEL_GASTOS).eq('fecha', dia.value)),
        q(sb.from('cajas').select('cobrador_id,estado,diferencia,base_inicial,total_esperado').eq('fecha', dia.value)),
        dia.value === hoyCO() ? q(sb.from('v_ruta').select('cobrador_id,valor_a_cobrar')) : Promise.resolve([]),
        q(sb.from('pagos').select(SEL_PAGOS).eq('fecha_pago', dia.value).eq('estado_pago', 'VIGENTE').order('hora_pago', { ascending: false })),
        q(sb.from('prestamos').select(SEL_PRESTAMOS).eq('fecha_desembolso', dia.value).order('created_at')),
        q(sb.from('caja_entregas').select('prestamo_id,monto,valor_cliente,cajas!inner(fecha,cobrador_id),prestamos(clientes(nombre_completo))').eq('cajas.fecha', dia.value))
      ]);
      datos = { gas, cajas, pend, pgs, pres, ents };
      pintar();
    } catch (e) { fail(e); out.replaceChildren(empty('No se pudo cargar', 'Inténtalo de nuevo.')); }
  }
  function pintar() {
    if (!datos) return;
    const { gas, cajas, pend, pgs, pres, ents } = datos;
    const lista = sel.value ? cobs.filter((c) => c.id === sel.value) : cobs;
    const ids = new Set(lista.map((c) => c.id));
    const pg = pgs.filter((p) => ids.has(p.cobrador_id)), gs = gas.filter((g) => ids.has(g.usuario_id));
    const ef = sumv(pg.filter((p) => p.metodo === 'EFECTIVO'), 'valor'), tr = sumv(pg.filter((p) => p.metodo === 'TRANSFERENCIA'), 'valor');
    out.replaceChildren(h('div', { class: 'stack' },
      h('div', { class: 'strip' },
        statBtn('Cobrado', money(ef + tr), 'good', () => detallePagos('Cobrado ' + fdate(dia.value), pg, true)),
        statBtn('Gastos', money(sumv(gs, 'valor')), 'bad', () => detalleGastos('Gastos ' + fdate(dia.value), gs, true))),
      lista.length ? lista.map((c) => {
        const cj = cajas.find((x) => x.cobrador_id === c.id);
        const mios = pgs.filter((p) => p.cobrador_id === c.id);
        const falta = sumv(pend.filter((x) => x.cobrador_id === c.id), 'valor_a_cobrar');
        return h('div', { class: 'panel' },
          h('div', { class: 'row between' }, h('b', { style: { fontSize: '18px' } }, c.nombre), h('span', { class: 'tag ' + (cj ? (cj.estado === 'CERRADA' ? 'ok' : 'warn') : '') }, cj ? (cj.estado === 'CERRADA' ? 'Caja cerrada' : 'Caja abierta') : 'Sin caja')),
          dia.value === hoyCO() ? h('div', { class: 'small muted', style: { marginTop: '4px' } }, 'Falta por cobrar: ' + money(falta)) : null,
          conceptosDia({ pagosEf: mios.filter((p) => p.metodo === 'EFECTIVO'), pagosTr: mios.filter((p) => p.metodo === 'TRANSFERENCIA'), gastos: gas.filter((g) => g.usuario_id === c.id), prests: pres.filter((p) => p.cobrador_id === c.id), base: cj ? cj.base_inicial : 0, ents: ents.filter((e) => e.cajas.cobrador_id === c.id), esperado: cj && cj.estado === 'CERRADA' ? Number(cj.total_esperado) : undefined }));
      }) : empty('No hay cobradores activos', 'Activa a los cobradores desde Usuarios.')));
  }
  cargar();
}

const sum = (arr, k) => arr.reduce((a, r) => a + Number(r[k] || 0), 0);
const sumv = sum;
const statBtn = (l, v, cls, fn) => h('button', { type: 'button', class: 'stat tap ' + (cls || ''), on: { click: fn } }, h('div', { class: 'v' }, v), h('div', { class: 'l' }, l, ' ›'));
function detallePagos(titulo, pagos, conQuien) {
  const nomCta = (id) => (S.cuentas.find((c) => c.id === id) || {}).nombre || 'Cuenta';
  const porCuenta = {};
  pagos.filter((p) => p.metodo === 'TRANSFERENCIA').forEach((p) => { const k = nomCta(p.cuenta_destino_id); porCuenta[k] = (porCuenta[k] || 0) + Number(p.valor); });
  sheet(titulo + ' · ' + money(sum(pagos, 'valor')), (close) => pagos.length
    ? h('div', { class: 'stack' },
        h('div', { class: 'panel' }, pagos.map((p) => h('a', { class: 'line', href: '#/prestamo/' + p.prestamo_id, on: { click: close } },
          h('div', { class: 'grow' }, h('b', {}, p.clientes ? p.clientes.nombre_completo : 'Cliente'), h('div', { class: 'small muted' }, ftime(p.hora_pago) + (conQuien ? ' · ' + nombreDe(p.cobrador_id) : '') + ' · ' + (p.metodo === 'EFECTIVO' ? 'Efectivo' : 'Transferencia' + (p.cuenta_destino_id ? ' a ' + nomCta(p.cuenta_destino_id) : '')))),
          h('div', { class: 'amt pos' }, money(p.valor))))),
        Object.keys(porCuenta).length ? h('div', { class: 'panel' }, h('div', { class: 'h2' }, 'Transferencias por cuenta'), Object.entries(porCuenta).map(([k, v]) => linea(k, money(v)))) : null)
    : empty('Sin cobros', 'Aquí aparecerán los clientes que te paguen.'));
}
function detalleFaltan(faltan) {
  sheet('Falta por cobrar · ' + money(sum(faltan, 'valor_a_cobrar')), (close) => faltan.length
    ? h('div', { class: 'panel' }, faltan.map((r) => h('a', { class: 'line', href: '#/prestamo/' + r.prestamo_id, on: { click: close } },
        h('div', { class: 'grow' }, h('b', {}, r.nombre_completo), h('div', { class: 'small muted' }, [r.barrio, Number(r.dias_atraso) > 0 ? r.dias_atraso + (Number(r.dias_atraso) === 1 ? ' día' : ' días') + ' de atraso' : 'Hoy'].filter(Boolean).join(' · '))),
        h('div', { class: 'amt' }, money(r.valor_a_cobrar)))))
    : empty('Todo cobrado', 'No te queda nadie por cobrar hoy.'));
}
const stat = (l, v, cls) => h('div', { class: 'stat ' + (cls || '') }, h('div', { class: 'v' }, v), h('div', { class: 'l' }, l));
const linea = (l, v) => h('div', { class: 'line' }, h('span', { class: 'grow' }, l), h('span', { class: 'amt' }, v));
const kvb = (k, v, fn) => h('button', { type: 'button', class: 'kvbtn', on: { click: fn } }, h('div', { class: 'k' }, k + ' ›'), h('div', { class: 'v' }, v));
function detalleGastos(titulo, gs, conQuien) {
  sheet(titulo + ' · ' + money(sum(gs, 'valor')), () => gs.length
    ? h('div', { class: 'panel' }, gs.map((g) => h('div', { class: 'line' },
        h('div', { class: 'grow' }, h('b', {}, g.categoria + (g.descripcion ? ' · ' + g.descripcion : '')), h('div', { class: 'small muted' }, (conQuien ? (nombreDe(g.usuario_id) || 'Oficina') + ' · ' : '') + (g.metodo === 'EFECTIVO' ? 'Efectivo' : 'Transferencia'))),
        h('div', { class: 'amt neg' }, money(g.valor)))))
    : empty('Sin gastos', 'No hay gastos registrados.'));
}
const kvc = (k, v) => h('div', {}, h('div', { class: 'k' }, k), h('div', { class: 'v' }, v));
