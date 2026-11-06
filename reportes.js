// Reportes para imprimir (PDF) y exportar a Excel. Solo administrador y supervisor.
import { h, icon, money, num, hoyCO, addDays, inicioSemana, fail, empty, skeleton, busy, toast } from './lib.js';
import { S, sb, q, esCob } from './state.js';
import { crearXlsx, descargar } from './xlsx.js';

// ------------------------------------------------------------ utilidades
const cap = (s) => { s = String(s || '').toLowerCase(); return s.charAt(0).toUpperCase() + s.slice(1); };
const dmy = (iso) => { if (!iso) return ''; const [y, m, d] = String(iso).substring(0, 10).split('-'); return `${d}/${m}/${y}`; };
const dias = (a, b) => Math.round((Date.UTC(...b.split('-').map((x, i) => (i === 1 ? x - 1 : +x))) - Date.UTC(...a.split('-').map((x, i) => (i === 1 ? x - 1 : +x)))) / 864e5);
const sinTilde = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const TIPOS = { NUEVO: 'Nuevo', MIGRACION: 'Migración', RENOVACION: 'Renovación', REFINANCIACION: 'Refinanciación' };
const MOV = { DESEMBOLSO: 'Desembolso de préstamo', COBRO_TRANSFERENCIA: 'Cobro por transferencia', COBRO_EFECTIVO: 'Cobro en efectivo', GASTO: 'Gasto',
  BASE_COBRADOR: 'Base entregada al cobrador', CIERRE_CAJA: 'Cierre de caja', ENTREGA_COBRADOR: 'Entrega al cobrador para préstamo', CIERRE_ENTREGAS: 'Cierre de entregas',
  RETIRO: 'Retiro', TRANSFERENCIA_SALIDA: 'Transferencia (sale)', TRANSFERENCIA_ENTRADA: 'Transferencia (entra)', PAGO_LIQUIDACION: 'Pago de liquidación',
  INGRESO_OFICINA: 'Ingreso de oficina', SALDO_INICIAL: 'Saldo inicial' };

/** Trae todas las filas (de 1000 en 1000). `mk` crea la consulta de cero cada vez. */
async function todo(mk) {
  let out = [], desde = 0;
  for (;;) {
    const { data, error } = await mk().range(desde, desde + 999);
    if (error) throw error;
    out = out.concat(data);
    if (data.length < 1000) return out;
    desde += 1000;
  }
}
const rango = (qb, campo, f) => { if (f.desde) qb = qb.gte(campo, f.desde); if (f.hasta) qb = qb.lte(campo, f.hasta); return qb; };

let CAT = null;
async function catalogos(forzar) {
  if (CAT && !forzar) return CAT;
  const [cuentas, clientes] = await Promise.all([
    todo(() => sb.from('cuentas').select('id,nombre,tipo')),
    todo(() => sb.from('clientes').select('id,nombre_completo,documento,telefono,direccion,barrio,estado,ruta_id,cobrador_id,created_at'))
  ]);
  CAT = {
    perfil: Object.fromEntries(S.profiles.map((p) => [p.id, p.nombre])),
    ruta: Object.fromEntries(S.rutas.map((r) => [r.id, r.nombre])),
    cuenta: Object.fromEntries(cuentas.map((c) => [c.id, c])),
    cliente: Object.fromEntries(clientes.map((c) => [c.id, c]))
  };
  return CAT;
}

/** Préstamos con sus cuotas resumidas. */
async function prestamosBase(f, cat, usarFechas) {
  const hoy = hoyCO();
  const [prs, cuo] = await Promise.all([
    todo(() => { let b = sb.from('prestamos').select('*').order('fecha_desembolso', { ascending: false }).order('created_at', { ascending: false }); return usarFechas ? rango(b, 'fecha_desembolso', f) : b; }),
    todo(() => sb.from('cuotas').select('prestamo_id,fecha_programada,valor_programado,valor_pagado,estado'))
  ]);
  const por = {};
  cuo.forEach((c) => (por[c.prestamo_id] = por[c.prestamo_id] || []).push(c));
  return prs.map((p) => {
    const cl = cat.cliente[p.cliente_id] || {};
    let pagadas = 0, venc = 0, valVenc = 0, prox = '', maxAt = 0;
    (por[p.id] || []).forEach((c) => {
      if (c.estado === 'PAGADA') { pagadas++; return; }
      const saldo = Number(c.valor_programado) - Number(c.valor_pagado);
      if (!prox || c.fecha_programada < prox) prox = c.fecha_programada;
      if (c.fecha_programada < hoy) { venc++; valVenc += saldo; maxAt = Math.max(maxAt, dias(c.fecha_programada, hoy)); }
    });
    const act = p.estado === 'ACTIVO';
    return {
      id: p.id, fecha: p.fecha_desembolso, cliente: cl.nombre_completo || '', documento: cl.documento || '', telefono: cl.telefono || '', barrio: cl.barrio || '', direccion: cl.direccion || '',
      cobrador: cat.perfil[p.cobrador_id] || '', ruta: cat.ruta[p.ruta_id] || '', cobrador_id: p.cobrador_id, ruta_id: p.ruta_id, cliente_id: p.cliente_id,
      modalidad: cap(p.modalidad), modalidad_k: p.modalidad, tipo_k: p.tipo_operacion, tipo: TIPOS[p.tipo_operacion] || p.tipo_operacion, estado_k: p.estado, estado: cap(p.estado),
      prestado: +p.valor_prestado, pct: +p.porcentaje_interes, interes: +p.total_interes, papeleria: +p.valor_papeleria, entregado: +p.valor_entregado,
      total: +p.total_a_cobrar, n_cuotas: p.numero_cuotas, valor_cuota: +p.valor_cuota, pagadas, pendientes: p.numero_cuotas - pagadas,
      cobrado: +p.total_a_cobrar - +p.saldo, saldo: +p.saldo, proxima: act ? prox : '', vencidas: act ? venc : 0, valor_vencido: act ? valVenc : 0, dias_atraso: act ? maxAt : 0
    };
  }).filter((x) => pasa(x, f));
}
function pasa(x, f) {
  return (!f.cobrador || x.cobrador_id === f.cobrador) && (!f.ruta || x.ruta_id === f.ruta) && (!f.modalidad || x.modalidad_k === f.modalidad) &&
    (!f.estado || x.estado_k === f.estado) && (!f.tipo || x.tipo_k === f.tipo);
}

function resumen(titulo, filas, campo, sumas = []) {
  if (!sumas.length) sumas = ['prestado', 'total', 'saldo'];
  const T = { prestado: 'Prestado', total: 'Total a cobrar', saldo: 'Saldo', valor: 'Valor', programado: 'Valor cuotas', pagado: 'Pagado', entra: 'Entra', sale: 'Sale',
    gan_pactada: 'Ganancia pactada', gan_cobrada: 'Ganancia cobrada', gan_calle: 'Ganancia en la calle', gan_trasl: 'Trasladada a nuevo préstamo' };
  const g = new Map();
  filas.forEach((r) => {
    const k = r[campo] === undefined || r[campo] === '' ? '(sin dato)' : r[campo];
    if (!g.has(k)) g.set(k, { grupo: k, n: 0, ...Object.fromEntries(sumas.map((s) => [s, 0])) });
    const a = g.get(k); a.n++; sumas.forEach((s) => { a[s] += Number(r[s]) || 0; });
  });
  let rows = [...g.values()];
  if (campo === 'fecha') rows.sort((a, b) => (a.grupo < b.grupo ? -1 : 1));
  return { titulo, cols: [{ t: 'Grupo', k: 'grupo' }, { t: 'Registros', k: 'n', f: 'n' }, ...sumas.map((s) => ({ t: T[s] || s, k: s, f: 'm' }))], rows };
}


/** Ganancia = intereses. Se reparte cada cobro en proporción (interés / total a cobrar de ese préstamo). */
function gananciaDe(p) {
  const pactada = p.estado_k === 'CANCELADO' ? 0 : p.interes;
  const cobrada = p.total > 0 && pactada ? Math.min(pactada, p.interes * (p.cobrado / p.total)) : 0;
  const resto = Math.max(0, pactada - cobrada);
  return { gan_pactada: pactada, gan_cobrada: Math.round(cobrada), gan_calle: p.estado_k === 'ACTIVO' ? Math.round(resto) : 0,
    gan_trasl: p.estado_k === 'RENOVADO' || p.estado_k === 'REFINANCIADO' ? Math.round(resto) : 0, pct_cobrado: pactada ? (cobrada / pactada) * 100 : 0 };
}

// ------------------------------------------------------------ definición de reportes
const C = (t, k, f, s) => ({ t, k, f, s });
const REPORTES = [
  { id: 'ganancias', titulo: 'Ganancias (intereses)', icono: 'percent', desc: 'Cuánto genera en ganancias (intereses) cada préstamo, cuánto de esa ganancia ya cobró y cuánto tiene todavía en la calle.',
    usa: ['desde', 'hasta', 'cobrador', 'ruta', 'modalidad', 'estado', 'tipo'], fechas: 'Fecha de desembolso del préstamo', def: '',
    async run(f, cat) {
      const base = await prestamosBase(f, cat, true);
      const rows = base.map((p) => ({ ...p, ...gananciaDe(p) }));
      const ids = new Map(rows.map((r) => [r.id, r]));
      // Ganancia cobrada mes a mes (según la fecha en que el cliente pagó) de los préstamos del reporte
      const pagos = await todo(() => sb.from('pagos').select('prestamo_id,valor,fecha_pago').eq('estado_pago', 'VIGENTE'));
      const mes = new Map();
      pagos.forEach((x) => {
        const r = ids.get(x.prestamo_id); if (!r || r.estado_k === 'CANCELADO' || !r.total) return;
        const k = String(x.fecha_pago).substring(0, 7);
        const a = mes.get(k) || { grupo: k, n: 0, valor: 0, gan_cobrada: 0 };
        a.n++; a.valor += +x.valor; a.gan_cobrada += +x.valor * (r.interes / r.total); mes.set(k, a);
      });
      const porMes = [...mes.values()].sort((a, b) => (a.grupo < b.grupo ? -1 : 1)).map((a) => ({ ...a, gan_cobrada: Math.round(a.gan_cobrada) }));
      const sumas = ['gan_pactada', 'gan_cobrada', 'gan_calle', 'gan_trasl'];
      return { cols: [C('Fecha', 'fecha', 'd'), C('Cliente', 'cliente'), C('Cobrador', 'cobrador'), C('Modalidad', 'modalidad'), C('Tipo', 'tipo'), C('Estado', 'estado'),
        C('Prestado', 'prestado', 'm', 1), C('% Int.', 'pct', 'p'), C('Total a cobrar', 'total', 'm', 1), C('Cobrado (total)', 'cobrado', 'm', 1),
        C('Ganancia pactada', 'gan_pactada', 'm', 1), C('Ganancia cobrada', 'gan_cobrada', 'm', 1), C('Ganancia en la calle', 'gan_calle', 'm', 1),
        C('Trasladada a nuevo préstamo', 'gan_trasl', 'm', 1), C('% ganancia cobrada', 'pct_cobrado', 'p')],
        rows, extras: [resumen('Resumen general por estado del préstamo', rows, 'estado', sumas), resumen('Resumen por frecuencia de pago', rows, 'modalidad', sumas),
          resumen('Resumen por cobrador', rows, 'cobrador', sumas), resumen('Resumen por tipo de operación', rows, 'tipo', sumas),
          { titulo: 'Ganancia cobrada mes a mes (según fecha de pago del cliente)',
            cols: [{ t: 'Mes', k: 'grupo' }, { t: 'Cobros', k: 'n', f: 'n' }, { t: 'Total cobrado', k: 'valor', f: 'm' }, { t: 'Ganancia incluida en lo cobrado', k: 'gan_cobrada', f: 'm' }], rows: porMes, total: 'gan_cobrada' }],
        nota: 'Ganancia = intereses pactados. Cada cobro se reparte en proporción entre capital e interés del mismo préstamo. "En la calle" = ganancia de préstamos activos que aún no se ha cobrado. "Trasladada" = ganancia pendiente de préstamos renovados o refinanciados, que pasó al préstamo nuevo. Los préstamos cancelados no cuentan.' };
    } },
  { id: 'prestamos', titulo: 'Préstamos', icono: 'cash', desc: 'Todos los préstamos con filtros por frecuencia, estado, tipo, cobrador y ruta. Cuotas pagadas y pendientes.',
    usa: ['desde', 'hasta', 'cobrador', 'ruta', 'modalidad', 'estado', 'tipo'], fechas: 'Fecha de desembolso', def: '',
    async run(f, cat) {
      const rows = await prestamosBase(f, cat, true);
      return { cols: [C('Fecha', 'fecha', 'd'), C('Cliente', 'cliente'), C('Documento', 'documento'), C('Teléfono', 'telefono'), C('Cobrador', 'cobrador'), C('Ruta', 'ruta'),
        C('Modalidad', 'modalidad'), C('Tipo', 'tipo'), C('Estado', 'estado'), C('Prestado', 'prestado', 'm', 1), C('% Int.', 'pct', 'p'), C('Interés', 'interes', 'm', 1),
        C('Papelería', 'papeleria', 'm', 1), C('Total a cobrar', 'total', 'm', 1), C('Cuotas', 'n_cuotas', 'n'), C('Valor cuota', 'valor_cuota', 'm'),
        C('Cuotas pagadas', 'pagadas', 'n', 1), C('Cuotas pendientes', 'pendientes', 'n', 1), C('Cobrado', 'cobrado', 'm', 1), C('Saldo', 'saldo', 'm', 1),
        C('Próxima cuota', 'proxima', 'd'), C('Días atraso', 'dias_atraso', 'n')],
        rows, extras: [resumen('Resumen por estado', rows, 'estado'), resumen('Resumen por modalidad', rows, 'modalidad'), resumen('Resumen por tipo de operación', rows, 'tipo')] };
    } },
  { id: 'cuotas', titulo: 'Cuotas', icono: 'calendar', desc: 'Cuotas pagadas, pendientes o atrasadas, por fecha programada.',
    usa: ['desde', 'hasta', 'cuotas', 'cobrador', 'ruta', 'modalidad', 'estado', 'tipo'], fechas: 'Fecha programada de la cuota', def: '',
    async run(f, cat) {
      const hoy = hoyCO();
      const prs = Object.fromEntries((await prestamosBase(f, cat, false)).map((p) => [p.id, p]));
      const cuo = await todo(() => rango(sb.from('cuotas').select('prestamo_id,numero,fecha_programada,valor_programado,valor_pagado,estado').order('fecha_programada'), 'fecha_programada', f));
      const rows = [];
      cuo.forEach((c) => {
        const p = prs[c.prestamo_id]; if (!p) return;
        const pagada = c.estado === 'PAGADA', atras = !pagada && c.fecha_programada < hoy;
        if (f.cuotas === 'PAGADAS' && !pagada) return;
        if (f.cuotas === 'PENDIENTES' && (pagada || p.estado_k !== 'ACTIVO')) return;
        if (f.cuotas === 'ATRASADAS' && (!atras || p.estado_k !== 'ACTIVO')) return;
        rows.push({ fecha: c.fecha_programada, cliente: p.cliente, telefono: p.telefono, cobrador: p.cobrador, ruta: p.ruta, modalidad: p.modalidad, prestamo: p.fecha,
          num: `${c.numero} / ${p.n_cuotas}`, programado: +c.valor_programado, pagado: +c.valor_pagado, saldo: c.valor_programado - c.valor_pagado,
          estado: pagada ? 'Pagada' : atras ? 'Atrasada' : c.estado === 'PARCIAL' ? 'Parcial' : 'Pendiente', dias: atras ? dias(c.fecha_programada, hoy) : 0, pest: p.estado });
      });
      return { cols: [C('Fecha cuota', 'fecha', 'd'), C('Cliente', 'cliente'), C('Teléfono', 'telefono'), C('Cobrador', 'cobrador'), C('Ruta', 'ruta'), C('Modalidad', 'modalidad'),
        C('Préstamo del', 'prestamo', 'd'), C('Cuota Nº', 'num'), C('Valor cuota', 'programado', 'm', 1), C('Pagado', 'pagado', 'm', 1), C('Saldo cuota', 'saldo', 'm', 1),
        C('Estado cuota', 'estado'), C('Días atraso', 'dias', 'n'), C('Estado préstamo', 'pest')],
        rows, extras: [resumen('Resumen por estado de cuota', rows, 'estado', ['programado', 'pagado', 'saldo'])] };
    } },
  { id: 'mora', titulo: 'Mora y atrasados', icono: 'alert', desc: 'Préstamos activos con cuotas vencidas, del más atrasado al menos atrasado.',
    usa: ['cobrador', 'ruta', 'modalidad'], fechas: '', def: '',
    async run(f, cat) {
      const rows = (await prestamosBase({ ...f, estado: 'ACTIVO' }, cat, false)).filter((x) => x.vencidas > 0).sort((a, b) => b.dias_atraso - a.dias_atraso);
      return { cols: [C('Cliente', 'cliente'), C('Teléfono', 'telefono'), C('Dirección', 'direccion'), C('Barrio', 'barrio'), C('Cobrador', 'cobrador'), C('Ruta', 'ruta'),
        C('Modalidad', 'modalidad'), C('Préstamo del', 'fecha', 'd'), C('Cuotas vencidas', 'vencidas', 'n', 1), C('Valor vencido', 'valor_vencido', 'm', 1),
        C('Saldo total', 'saldo', 'm', 1), C('Días de atraso', 'dias_atraso', 'n')], rows, extras: [] };
    } },
  { id: 'cartera', titulo: 'Cartera por cobrador', icono: 'users', desc: 'Saldo en cartera, mora, colocado y cobrado de cada cobrador.',
    usa: ['desde', 'hasta', 'cobrador'], fechas: 'Colocado y cobrado dentro del periodo (la cartera es la de hoy)', def: 'mes',
    async run(f, cat) {
      const todos = await prestamosBase({}, cat, false);
      const pagos = await todo(() => rango(sb.from('pagos').select('cobrador_id,valor,metodo,fecha_pago').eq('estado_pago', 'VIGENTE'), 'fecha_pago', f));
      const g = {};
      const fila = (id) => (g[id] = g[id] || { cobrador: cat.perfil[id] || '(sin cobrador)', id, activos: 0, saldo: 0, vencido: 0, mora: 0, colocado: 0, n_nuevos: 0, cobrado: 0, efectivo: 0, transf: 0, cl: new Set() });
      todos.forEach((p) => {
        const r = fila(p.cobrador_id);
        if (p.estado_k === 'ACTIVO') { r.activos++; r.saldo += p.saldo; r.vencido += p.valor_vencido; if (p.vencidas) r.mora++; r.cl.add(p.cliente_id); }
        if ((!f.desde || p.fecha >= f.desde) && (!f.hasta || p.fecha <= f.hasta)) { r.colocado += p.prestado; r.n_nuevos++; }
      });
      pagos.forEach((x) => { const r = fila(x.cobrador_id); r.cobrado += +x.valor; if (x.metodo === 'EFECTIVO') r.efectivo += +x.valor; else r.transf += +x.valor; });
      const rows = Object.values(g).filter((r) => !f.cobrador || r.id === f.cobrador).sort((a, b) => a.cobrador.localeCompare(b.cobrador))
        .map((r) => ({ ...r, clientes: r.cl.size, pct_mora: r.saldo ? (r.vencido / r.saldo) * 100 : 0 }));
      return { cols: [C('Cobrador', 'cobrador'), C('Clientes activos', 'clientes', 'n', 1), C('Préstamos activos', 'activos', 'n', 1), C('Saldo en cartera', 'saldo', 'm', 1), C('Valor vencido', 'vencido', 'm', 1),
        C('% en mora', 'pct_mora', 'p'), C('Préstamos en mora', 'mora', 'n', 1), C('Préstamos nuevos', 'n_nuevos', 'n', 1), C('Colocado', 'colocado', 'm', 1),
        C('Cobrado', 'cobrado', 'm', 1), C('En efectivo', 'efectivo', 'm', 1), C('Por transferencia', 'transf', 'm', 1)], rows, extras: [] };
    } },
  { id: 'clientes', titulo: 'Clientes', icono: 'user', desc: 'Directorio con historial de préstamos, saldo actual y valor vencido.',
    usa: ['desde', 'hasta', 'cobrador', 'ruta'], fechas: 'Fecha de registro del cliente', def: '',
    async run(f, cat) {
      const prs = await prestamosBase({}, cat, false);
      const ag = {};
      prs.forEach((p) => {
        const a = (ag[p.cliente_id] = ag[p.cliente_id] || { total: 0, prestado: 0, activos: 0, saldo: 0, vencido: 0, ultimo: '' });
        a.total++; a.prestado += p.prestado;
        if (p.estado_k === 'ACTIVO') { a.activos++; a.saldo += p.saldo; a.vencido += p.valor_vencido; }
        if (!a.ultimo || p.fecha > a.ultimo) a.ultimo = p.fecha;
      });
      const rows = [];
      Object.values(cat.cliente).forEach((c) => {
        const a = ag[c.id] || { total: 0, prestado: 0, activos: 0, saldo: 0, vencido: 0, ultimo: '' };
        const alta = String(c.created_at || '').substring(0, 10);
        if ((f.cobrador && c.cobrador_id !== f.cobrador) || (f.ruta && c.ruta_id !== f.ruta) || (f.desde && alta < f.desde) || (f.hasta && alta > f.hasta)) return;
        rows.push({ nombre: c.nombre_completo, documento: c.documento || '', telefono: c.telefono || '', direccion: c.direccion || '', barrio: c.barrio || '', cobrador: cat.perfil[c.cobrador_id] || '',
          ruta: cat.ruta[c.ruta_id] || '', estado: cap(c.estado), ...a });
      });
      rows.sort((x, y) => x.nombre.localeCompare(y.nombre));
      return { cols: [C('Cliente', 'nombre'), C('Documento', 'documento'), C('Teléfono', 'telefono'), C('Dirección', 'direccion'), C('Barrio', 'barrio'), C('Cobrador', 'cobrador'), C('Ruta', 'ruta'),
        C('Estado', 'estado'), C('Préstamos (histórico)', 'total', 'n', 1), C('Total prestado', 'prestado', 'm', 1), C('Préstamos activos', 'activos', 'n', 1), C('Saldo actual', 'saldo', 'm', 1),
        C('Valor vencido', 'vencido', 'm', 1), C('Último préstamo', 'ultimo', 'd')], rows, extras: [] };
    } },
  { id: 'cobros', titulo: 'Cobros', icono: 'wallet', desc: 'Pagos recibidos por día, método de pago, cobrador y cuenta.',
    usa: ['desde', 'hasta', 'cobrador', 'ruta', 'modalidad', 'metodo', 'cuenta'], fechas: 'Fecha del pago', def: 'mes',
    async run(f, cat) {
      const [pagos, prs] = await Promise.all([
        todo(() => rango(sb.from('pagos').select('*').eq('estado_pago', 'VIGENTE').order('fecha_pago', { ascending: false }).order('hora_pago', { ascending: false }), 'fecha_pago', f)),
        todo(() => sb.from('prestamos').select('id,modalidad'))]);
      const mod = Object.fromEntries(prs.map((p) => [p.id, p.modalidad]));
      const rows = [];
      pagos.forEach((x) => {
        if ((f.cobrador && x.cobrador_id !== f.cobrador) || (f.ruta && x.ruta_id !== f.ruta) || (f.modalidad && mod[x.prestamo_id] !== f.modalidad) || (f.metodo && x.metodo !== f.metodo) || (f.cuenta && x.cuenta_destino_id !== f.cuenta)) return;
        rows.push({ fecha: x.fecha_pago, hora: new Date(x.hora_pago).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota', hour12: false }),
          cliente: (cat.cliente[x.cliente_id] || {}).nombre_completo || '', cobrador: cat.perfil[x.cobrador_id] || '', ruta: cat.ruta[x.ruta_id] || '', modalidad: cap(mod[x.prestamo_id]),
          metodo: cap(x.metodo), cuenta: (cat.cuenta[x.cuenta_destino_id] || {}).nombre || '', valor: +x.valor, saldo_ant: +x.saldo_anterior, saldo_nuevo: +x.saldo_nuevo, obs: x.observacion || '' });
      });
      return { cols: [C('Fecha', 'fecha', 'd'), C('Hora', 'hora'), C('Cliente', 'cliente'), C('Cobrador', 'cobrador'), C('Ruta', 'ruta'), C('Modalidad', 'modalidad'), C('Método', 'metodo'),
        C('Cuenta destino', 'cuenta'), C('Valor cobrado', 'valor', 'm', 1), C('Saldo anterior', 'saldo_ant', 'm'), C('Saldo nuevo', 'saldo_nuevo', 'm'), C('Observación', 'obs')], rows,
        extras: [resumen('Resumen por método', rows, 'metodo', ['valor']), resumen('Resumen por cobrador', rows, 'cobrador', ['valor']), resumen('Resumen por día', rows, 'fecha', ['valor'])] };
    } },
  { id: 'gastos', titulo: 'Gastos', icono: 'receipt', desc: 'Gastos por categoría, cuenta y quién los registró.',
    usa: ['desde', 'hasta', 'cobrador', 'ruta', 'metodo', 'cuenta'], fechas: 'Fecha del gasto (el cobrador es quien lo registró)', def: 'mes',
    async run(f, cat) {
      const gs = await todo(() => rango(sb.from('gastos').select('*').order('fecha', { ascending: false }), 'fecha', f));
      const rows = gs.filter((g) => (!f.ruta || g.ruta_id === f.ruta) && (!f.cobrador || g.usuario_id === f.cobrador) && (!f.metodo || g.metodo === f.metodo) && (!f.cuenta || g.cuenta_id === f.cuenta))
        .map((g) => ({ fecha: g.fecha, categoria: g.categoria, descripcion: g.descripcion || '', valor: +g.valor, metodo: cap(g.metodo), cuenta: (cat.cuenta[g.cuenta_id] || {}).nombre || '',
          ruta: cat.ruta[g.ruta_id] || '', quien: cat.perfil[g.usuario_id] || '', obs: g.observacion || '' }));
      return { cols: [C('Fecha', 'fecha', 'd'), C('Categoría', 'categoria'), C('Descripción', 'descripcion'), C('Valor', 'valor', 'm', 1), C('Método', 'metodo'), C('Cuenta', 'cuenta'),
        C('Ruta', 'ruta'), C('Registrado por', 'quien'), C('Observación', 'obs')], rows, extras: [resumen('Resumen por categoría', rows, 'categoria', ['valor'])] };
    } },
  { id: 'cajas', titulo: 'Cajas y cuadres', icono: 'box', desc: 'Cuadre diario de cada cobrador: base, entregas, cobros, gastos, entregado y diferencia.',
    usa: ['desde', 'hasta', 'cobrador'], fechas: 'Fecha de la caja', def: 'mes',
    async run(f, cat) {
      const cj = await todo(() => rango(sb.from('cajas').select('*').order('fecha', { ascending: false }), 'fecha', f));
      let ent = {};
      try { (await todo(() => sb.from('caja_entregas').select('caja_id,monto'))).forEach((e) => { const a = (ent[e.caja_id] = ent[e.caja_id] || { n: 0, m: 0 }); a.n++; a.m += +e.monto; }); } catch { ent = {}; }
      const rows = cj.filter((c) => !f.cobrador || c.cobrador_id === f.cobrador).map((c) => {
        const e = ent[c.id] || { n: 0, m: 0 };
        return { fecha: c.fecha, cobrador: cat.perfil[c.cobrador_id] || '', estado: cap(c.estado), base: +c.base_inicial, entregas: e.m, n_ent: e.n, cobros: +c.total_cobros_efectivo, gastos: +c.total_gastos,
          esperado: +c.total_esperado, entregado: c.dinero_entregado == null ? '' : +c.dinero_entregado, dif: c.diferencia == null ? '' : +c.diferencia, obs: c.observacion || '' };
      });
      return { cols: [C('Fecha', 'fecha', 'd'), C('Cobrador', 'cobrador'), C('Estado', 'estado'), C('Base entregada', 'base', 'm', 1), C('Entregas para préstamos', 'entregas', 'm', 1), C('# entregas', 'n_ent', 'n', 1),
        C('Cobros en efectivo', 'cobros', 'm', 1), C('Gastos', 'gastos', 'm', 1), C('Total esperado', 'esperado', 'm', 1), C('Dinero entregado', 'entregado', 'm', 1),
        C('Diferencia (− faltante / + sobrante)', 'dif', 'm', 1), C('Observación', 'obs')], rows, extras: [] };
    } },
  { id: 'cuentas', titulo: 'Cuentas y movimientos', icono: 'bank', desc: 'Saldo actual de cada cuenta y todos sus movimientos por rango de fechas.',
    usa: ['desde', 'hasta', 'cuenta'], fechas: 'Fecha del movimiento', def: 'mes',
    async run(f, cat) {
      const saldos = (await todo(() => sb.from('v_saldo_cuentas').select('id,nombre,tipo,saldo_actual'))).filter((c) => c.tipo !== 'PAPELERIA')
        .map((c) => ({ cuenta: c.nombre, tipo: cap(c.tipo), saldo: +c.saldo_actual }));
      const mv = await todo(() => rango(sb.from('movimientos_cuenta').select('*').order('fecha', { ascending: false }).order('id', { ascending: false }), 'fecha', f));
      const rows = [];
      mv.forEach((m) => {
        const c = cat.cuenta[m.cuenta_id]; if (!c || c.tipo === 'PAPELERIA' || (f.cuenta && m.cuenta_id !== f.cuenta)) return;
        const v = +m.monto;
        rows.push({ fecha: m.fecha, cuenta: c.nombre, tipo: MOV[m.tipo] || cap(String(m.tipo).replace(/_/g, ' ')), desc: m.descripcion || '', entra: v > 0 ? v : 0, sale: v < 0 ? -v : 0, quien: cat.perfil[m.creado_por] || '' });
      });
      return { cols: [C('Fecha', 'fecha', 'd'), C('Cuenta', 'cuenta'), C('Tipo de movimiento', 'tipo'), C('Detalle', 'desc'), C('Entra', 'entra', 'm', 1), C('Sale', 'sale', 'm', 1), C('Registrado por', 'quien')], rows,
        extras: [{ titulo: 'Saldo actual de cada cuenta', cols: [{ t: 'Cuenta', k: 'cuenta' }, { t: 'Tipo', k: 'tipo' }, { t: 'Saldo', k: 'saldo', f: 'm' }], rows: saldos, total: 'saldo' },
          resumen('Movimientos por tipo (en el periodo)', rows, 'tipo', ['entra', 'sale'])] };
    } },
  { id: 'liquidaciones', titulo: 'Liquidaciones', icono: 'file', desc: 'Pagos semanales a cobradores con bonos, descuentos y faltantes.',
    usa: ['desde', 'hasta', 'cobrador'], fechas: 'Fin de la semana liquidada', def: '',
    async run(f, cat) {
      const [ls, aj] = await Promise.all([todo(() => rango(sb.from('liquidaciones').select('*').order('fecha_fin', { ascending: false }), 'fecha_fin', f)), todo(() => sb.from('liq_ajustes').select('liquidacion_id,tipo,valor'))]);
      const a = {}; aj.forEach((x) => { const r = (a[x.liquidacion_id] = a[x.liquidacion_id] || { b: 0, d: 0 }); if (x.tipo === 'BONO') r.b += +x.valor; else r.d += +x.valor; });
      const rows = ls.filter((l) => !f.cobrador || l.cobrador_id === f.cobrador).map((l) => {
        const x = a[l.id] || { b: 0, d: 0 };
        return { cobrador: cat.perfil[l.cobrador_id] || '', ini: l.fecha_inicio, fin: l.fecha_fin, base: +l.pago_base, comision: +l.comision_papeleria, bonos: x.b, desc: x.d, faltantes: +l.total_faltantes,
          neto: l.neto_pagado == null ? '' : +l.neto_pagado, estado: cap(l.estado), metodo: l.metodo ? cap(l.metodo) : '', pagada: l.fecha_pago ? String(l.fecha_pago).substring(0, 10) : '' };
      });
      return { cols: [C('Cobrador', 'cobrador'), C('Desde', 'ini', 'd'), C('Hasta', 'fin', 'd'), C('Pago base', 'base', 'm', 1), C('Comisión papelería', 'comision', 'm', 1), C('Bonos', 'bonos', 'm', 1),
        C('Descuentos', 'desc', 'm', 1), C('Faltantes de caja', 'faltantes', 'm', 1), C('Neto pagado', 'neto', 'm', 1), C('Estado', 'estado'), C('Método', 'metodo'), C('Fecha de pago', 'pagada', 'd')], rows, extras: [] };
    } }
];

// ------------------------------------------------------------ filtros
const OPC = {
  modalidad: [['', 'Todas'], ['DIARIO', 'Diario'], ['SEMANAL', 'Semanal'], ['QUINCENAL', 'Quincenal'], ['MENSUAL', 'Mensual']],
  estado: [['', 'Todos'], ['ACTIVO', 'Activo'], ['PAGADO', 'Pagado'], ['RENOVADO', 'Renovado'], ['REFINANCIADO', 'Refinanciado'], ['CANCELADO', 'Cancelado']],
  tipo: [['', 'Todos'], ['NUEVO', 'Nuevo'], ['MIGRACION', 'Migración'], ['RENOVACION', 'Renovación'], ['REFINANCIACION', 'Refinanciación']],
  cuotas: [['', 'Todas'], ['PAGADAS', 'Pagadas'], ['PENDIENTES', 'Pendientes'], ['ATRASADAS', 'Atrasadas']],
  metodo: [['', 'Todos'], ['EFECTIVO', 'Efectivo'], ['TRANSFERENCIA', 'Transferencia']]
};
const ETQ = { desde: 'Desde', hasta: 'Hasta', cobrador: 'Cobrador', ruta: 'Ruta', modalidad: 'Frecuencia de pago', estado: 'Estado del préstamo', tipo: 'Tipo de operación', cuotas: 'Cuotas', cuenta: 'Cuenta', metodo: 'Método de pago' };

function opciones(k, cat) {
  if (OPC[k]) return OPC[k];
  if (k === 'cobrador') return [['', 'Todos'], ...S.profiles.filter((p) => esCob(p)).map((p) => [p.id, p.nombre])];
  if (k === 'ruta') return [['', 'Todas'], ...S.rutas.map((r) => [r.id, r.nombre])];
  if (k === 'cuenta') return [['', 'Todas'], ...Object.values(cat.cuenta).filter((c) => c.tipo !== 'PAPELERIA').map((c) => [c.id, c.nombre])];
  return [];
}
const textoFiltros = (rep, f, cat) => {
  const p = [];
  rep.usa.forEach((k) => {
    if (!f[k]) return;
    const v = (k === 'desde' || k === 'hasta') ? dmy(f[k]) : (opciones(k, cat).find((o) => o[0] === f[k]) || [0, f[k]])[1];
    p.push(`${ETQ[k]}: ${v}`);
  });
  return p.length ? p.join('  ·  ') : 'Sin filtros (todos los registros)';
};

// ------------------------------------------------------------ pantallas
export async function indice(ctx) {
  ctx.setTop('Reportes', { actions: [{ icon: 'refresh', label: 'Actualizar', fn: () => ctx.refresh() }] });
  ctx.view.replaceChildren(skeleton(4));
  const hoy = hoyCO(), mes = hoy.substring(0, 8) + '01';
  let k = null;
  try { k = (await q(sb.rpc('informe_gerencial', { p_desde: mes, p_hasta: hoy }))).kpis; } catch { k = null; }
  let gan = null;
  try {
    const ps = await todo(() => sb.from('prestamos').select('estado,total_interes,total_a_cobrar,saldo'));
    gan = { pact: 0, cob: 0, calle: 0 };
    ps.forEach((p) => {
      if (p.estado === 'CANCELADO') return;
      const t = +p.total_a_cobrar, i = +p.total_interes, c = t > 0 ? i * ((t - +p.saldo) / t) : 0;
      gan.pact += i; gan.cob += c; if (p.estado === 'ACTIVO') gan.calle += i - c;
    });
  } catch { gan = null; }
  const kp = (t, v, mal) => h('div', { class: 'rep-kpi' + (mal ? ' mal' : '') }, h('span', {}, t), h('b', {}, v));
  ctx.view.replaceChildren(h('div', { class: 'stack' },
    k ? h('div', { class: 'section' }, h('h3', {}, 'Resumen del mes'), h('div', { class: 'rep-kpis' },
      kp('Cartera activa', money(k.cartera_activa)), kp('Cartera vencida', money(k.cartera_vencida), k.cartera_vencida > 0), kp('Préstamos activos', num(k.prestamos_activos)),
      kp('Préstamos en mora', num(k.prestamos_en_mora), k.prestamos_en_mora > 0), kp('Prestado en el mes', money(k.prestado_periodo)), kp('Cobrado en el mes', money(k.cobrado_periodo)),
      kp('Gastos del mes', money(k.gastos_periodo)), kp('Saldo en cuentas', money(k.saldo_total_cuentas)))) : null,
    gan ? h('div', { class: 'section' }, h('h3', {}, 'Ganancias (intereses) de todos los préstamos'), h('div', { class: 'rep-kpis' },
      kp('Ganancia pactada', money(gan.pact)), kp('Ganancia ya cobrada', money(gan.cob)), kp('Ganancia en la calle', money(gan.calle)),
      kp('% de ganancia cobrada', (gan.pact ? (gan.cob / gan.pact) * 100 : 0).toFixed(1) + '%')), h('a', { class: 'btn', href: '#/reportes/ganancias' }, icon('percent', 20), 'Ver reporte de ganancias')) : null,
    h('div', { class: 'section' }, h('h3', {}, 'Reportes'), h('p', { class: 'muted small' }, 'Elige un reporte, ajusta los filtros y luego imprímelo en PDF o expórtalo a Excel.'),
      h('div', { class: 'rep-grid' }, REPORTES.map((r) => h('a', { class: 'rep-card', href: '#/reportes/' + r.id }, icon(r.icono, 26), h('b', {}, r.titulo), h('span', {}, r.desc)))))));
}

export async function reporte(ctx) {
  const rep = REPORTES.find((r) => r.id === ctx.params[0]);
  if (!rep) { location.hash = '#/reportes'; return; }
  ctx.setTop(rep.titulo, { back: '#/reportes' });
  ctx.view.replaceChildren(skeleton(3));
  const cat = await catalogos(true);
  const hoy = hoyCO();
  const f = { desde: rep.def === 'mes' ? hoy.substring(0, 8) + '01' : '', hasta: rep.def === 'mes' ? hoy : '', cobrador: '', ruta: '', modalidad: '', estado: '', tipo: '', cuotas: '', cuenta: '', metodo: '' };
  let datos = null, texto = '';

  const cuerpo = h('div', { class: 'rep-doc' });
  const barra = h('div', { class: 'rep-barra' });
  const inputs = {};
  const campo = (k) => {
    let el;
    if (k === 'desde' || k === 'hasta') el = h('input', { type: 'date', value: f[k], on: { change: () => { f[k] = el.value; } } });
    else { el = h('select', { on: { change: () => { f[k] = el.value; } } }, opciones(k, cat).map(([v, t]) => h('option', { value: v }, t))); el.value = f[k]; }
    inputs[k] = el;
    return h('label', { class: 'rep-campo' }, h('span', {}, ETQ[k]), el);
  };
  const atajo = (txt, d, hs) => h('button', { class: 'chip', type: 'button', on: { click: () => { f.desde = d; f.hasta = hs; inputs.desde.value = d; inputs.hasta.value = hs; generar(); } } }, txt);
  const mesIni = hoy.substring(0, 8) + '01';
  const filtros = h('div', { class: 'rep-filtros no-print' },
    h('div', { class: 'rep-campos' }, rep.usa.map(campo)),
    rep.usa.includes('desde') ? h('div', { class: 'rep-atajos' }, h('span', { class: 'muted small' }, rep.fechas ? 'Las fechas filtran por: ' + rep.fechas : ''),
      atajo('Hoy', hoy, hoy), atajo('Esta semana', inicioSemana(hoy), hoy), atajo('Este mes', mesIni, hoy), atajo('Mes pasado', (() => { const d = new Date(mesIni + 'T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().substring(0, 10); })(), addDays(mesIni, -1)), atajo('Todo', '', '')) : null,
    h('div', { class: 'rep-acciones' },
      h('button', { class: 'btn primary', on: { click: (e) => busy(e.currentTarget, generar) } }, icon('refresh', 20), 'Generar'),
      h('button', { class: 'btn', on: { click: imprimir } }, icon('file', 20), 'Imprimir / PDF'),
      h('button', { class: 'btn', on: { click: excel } }, icon('chart', 20), 'Exportar a Excel')));

  function tabla(cols, rows, totales) {
    const celda = (c, v) => {
      if (v === '' || v == null) return '';
      if (c.f === 'm') return money(v); if (c.f === 'n') return num(v); if (c.f === 'p') return Number(v).toFixed(1) + '%'; if (c.f === 'd') return dmy(v); return v;
    };
    const cls = (c) => (['m', 'n', 'p'].includes(c.f) ? 'r' : c.f === 'd' ? 'c' : '');
    return h('div', { class: 'rep-scroll' }, h('table', { class: 'rep-tabla' },
      h('thead', {}, h('tr', {}, cols.map((c) => h('th', { class: cls(c) }, c.t)))),
      h('tbody', {}, rows.map((r) => h('tr', {}, cols.map((c) => h('td', { class: cls(c) + (c.k === 'dif' && r.dif < 0 ? ' neg' : '') }, celda(c, r[c.k])))))),
      totales ? h('tfoot', {}, h('tr', {}, cols.map((c, i) => h('td', { class: cls(c) }, i === 0 ? 'TOTALES' : c.s ? celda(c, rows.reduce((s, r) => s + (Number(r[c.k]) || 0), 0)) : '')))) : null));
  }
  const sumar = (cols, rows) => cols.map((c, i) => (i === 0 ? 'TOTALES' : c.s ? rows.reduce((s, r) => s + (Number(r[c.k]) || 0), 0) : ''));

  function pintar() {
    const empresa = (S.cfg.EMPRESA_NOMBRE || '').trim() || 'DH Rutas';
    const ahora = new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'medium', timeStyle: 'short' });
    const n = datos.rows.length;
    cuerpo.replaceChildren(...[
      h('div', { class: 'rep-cab' }, h('div', { class: 'rep-emp' }, empresa), h('h2', {}, rep.titulo),
        h('div', { class: 'rep-meta' }, `Generado: ${ahora} · ${S.profile.nombre} · ${n} registro${n === 1 ? '' : 's'}`), h('div', { class: 'rep-meta' }, texto)),
      datos.nota ? h('p', { class: 'rep-nota' }, datos.nota) : null,
      n ? tabla(datos.cols, datos.rows, datos.cols.some((c) => c.s)) : h('p', { class: 'rep-vacio' }, 'Sin registros con los filtros elegidos.'),
      ...datos.extras.filter((x) => x.rows.length).map((x) => h('div', { class: 'rep-extra' }, h('h3', {}, x.titulo),
        tabla(x.cols, x.rows, false), x.total ? h('div', { class: 'rep-total' }, 'TOTAL ', h('b', {}, money(x.rows.reduce((s, r) => s + r[x.total], 0)))) : null)),
      h('div', { class: 'rep-fin' }, '— Fin del reporte —')].filter(Boolean));
  }

  async function generar() {
    try {
      Object.keys(inputs).forEach((k) => { f[k] = inputs[k].value; });
      if (f.desde && f.hasta && f.desde > f.hasta) { toast('La fecha "Desde" no puede ser mayor que "Hasta".', 'bad'); return; }
      cuerpo.replaceChildren(skeleton(4));
      datos = await rep.run(f, cat);
      texto = textoFiltros(rep, f, cat);
      pintar();
    } catch (e) { fail(e); cuerpo.replaceChildren(empty('No se pudo generar el reporte', 'Revisa tu conexión e inténtalo de nuevo.')); datos = null; }
  }
  function imprimir() {
    if (!datos) { toast('Primero genera el reporte.', 'bad'); return; }
    const t = document.title; document.title = `${rep.titulo} ${hoyCO()}`;
    window.print();
    setTimeout(() => { document.title = t; }, 500);
  }
  function excel() {
    if (!datos) { toast('Primero genera el reporte.', 'bad'); return; }
    const empresa = (S.cfg.EMPRESA_NOMBRE || '').trim() || 'DH Rutas';
    const celda = (c, v) => (v === '' || v == null ? { v: '' } : c.f === 'm' ? { v, t: 'n', e: 'm' } : c.f === 'n' ? { v, t: 'n', e: 'i' } : c.f === 'p' ? { v, t: 'n', e: 'p' } : c.f === 'd' ? { v, t: 'd', e: 'd' } : { v, t: 's' });
    const nc = datos.cols.length;
    const fila = (arr, alto) => Object.assign(arr, alto ? { alto } : {});
    const filas = [
      fila([{ v: `${empresa} · ${rep.titulo}`, t: 's', e: 'tit' }, ...Array(nc - 1).fill({ v: '', e: 'tit' })], 26),
      [{ v: `Generado: ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })} · ${datos.rows.length} registros`, t: 's', e: 'sub' }],
      [{ v: texto, t: 's', e: 'sub' }], ...(datos.nota ? [[{ v: datos.nota, t: 's', e: 'sub' }]] : []), [],
      fila(datos.cols.map((c) => ({ v: c.t, t: 's', e: 'h' })), 32),
      ...datos.rows.map((r) => datos.cols.map((c) => celda(c, r[c.k])))
    ];
    if (datos.cols.some((c) => c.s) && datos.rows.length) {
      filas.push(datos.cols.map((c, i) => (i === 0 ? { v: 'TOTALES', t: 's', e: 'b' } : c.s ? { v: sumar(datos.cols, datos.rows)[i], t: 'n', e: c.f === 'm' ? 'bm' : 'bi' } : { v: '', e: 'b' })));
    }
    const hojas = [{ nombre: rep.titulo, anchos: datos.cols.map((c) => (['m'].includes(c.f) ? 105 : c.f === 'd' ? 85 : c.f === 'n' || c.f === 'p' ? 70 : Math.max(90, Math.min(220, c.t.length * 9)))), filas, congelar: datos.nota ? 6 : 5 }];
    const ex = datos.extras.filter((x) => x.rows.length);
    if (ex.length) {
      const fs = [];
      ex.forEach((x) => {
        fs.push([{ v: x.titulo, t: 's', e: 'b' }]);
        fs.push(x.cols.map((c) => ({ v: c.t, t: 's', e: 'h' })));
        x.rows.forEach((r) => fs.push(x.cols.map((c) => celda(c, r[c.k]))));
        if (x.total) fs.push([{ v: 'TOTAL', t: 's', e: 'b' }, ...Array(x.cols.length - 2).fill({ v: '', e: 'b' }), { v: x.rows.reduce((s, r) => s + r[x.total], 0), t: 'n', e: 'bm' }]);
        fs.push([]);
      });
      hojas.push({ nombre: 'Resúmenes', anchos: [230, 90, 120, 120, 120], filas: fs });
    }
    descargar(crearXlsx(hojas), `${sinTilde(rep.titulo).replace(/\s+/g, '_')}_${hoyCO()}.xlsx`);
    toast('Archivo de Excel descargado.');
  }

  ctx.view.replaceChildren(h('div', { class: 'stack rep-pagina' }, filtros, barra, cuerpo));
  await generar();
}
