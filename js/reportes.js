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
  INGRESO_OFICINA: 'Ingreso de oficina', SALDO_INICIAL: 'Saldo inicial', CIERRE_BASE: 'Cierre de caja: devolución de base', CIERRE_COBROS: 'Cierre de caja: cobros en efectivo',
  CIERRE_ENTREGAS: 'Cierre de caja: entregas para préstamos', DIFERENCIA_CAJA: 'Diferencia de caja', RETIRO_PAPELERIA: 'Retiro de papelería', PAGO_BASE_SEMANAL: 'Pago base semanal', INGRESO: 'Ingreso' };
// Clasificación contable de los movimientos de cuentas
const CLASE = { COBRO_TRANSFERENCIA: 'Operación', COBRO_EFECTIVO: 'Operación', INGRESO_OFICINA: 'Operación', INGRESO: 'Operación', DESEMBOLSO: 'Operación', GASTO: 'Operación', PAGO_LIQUIDACION: 'Operación',
  PAGO_BASE_SEMANAL: 'Operación', RETIRO: 'Operación', RETIRO_PAPELERIA: 'Operación', DIFERENCIA_CAJA: 'Operación', SALDO_INICIAL: 'Operación',
  BASE_COBRADOR: 'Interno de caja', CIERRE_BASE: 'Interno de caja', CIERRE_COBROS: 'Interno de caja', CIERRE_ENTREGAS: 'Interno de caja', ENTREGA_COBRADOR: 'Interno de caja', CIERRE_CAJA: 'Interno de caja',
  TRANSFERENCIA_ENTRADA: 'Entre cuentas', TRANSFERENCIA_SALIDA: 'Entre cuentas' };

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
const W = (t, k) => ({ t, k, w: 1 });   // columna de texto que puede pasar a varias líneas
const REPORTES = [
  { id: 'gerencial', titulo: 'Informe gerencial', icono: 'chart', desc: 'Informe completo para el dueño o el contador: ingresos y egresos, cuentas (saldo inicial, entradas, salidas y saldo final), cartera, cobradores, gastos, indicadores y alertas.',
    usa: ['desde', 'hasta', 'cobrador'], fechas: 'Cobros, préstamos y gastos por su fecha; liquidaciones por su fecha de pago', def: 'mes',
    async run(f, cat) {
      const bog = (ts) => (ts ? new Date(ts).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }) : '');
      const suma = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().substring(0, 10); };
      const dias = f.desde && f.hasta ? Math.round((new Date(f.hasta + 'T12:00:00Z') - new Date(f.desde + 'T12:00:00Z')) / 86400000) + 1 : 0;
      const ant = dias ? { desde: suma(f.desde, -dias), hasta: suma(f.desde, -1) } : null;
      const mio = (id) => !f.cobrador || id === f.cobrador;
      const [ls, aj] = await Promise.all([todo(() => sb.from('liquidaciones').select('*').eq('estado', 'PAGADA')), todo(() => sb.from('liq_ajustes').select('liquidacion_id,tipo,valor'))]);
      const cargar = async (r) => {
        const [pg, pr, gs, cj] = await Promise.all([
          todo(() => rango(sb.from('pagos').select('valor,metodo,cobrador_id,fecha_pago').eq('estado_pago', 'VIGENTE'), 'fecha_pago', r)),
          todo(() => rango(sb.from('prestamos').select('valor_prestado,valor_papeleria,valor_entregado,medio_desembolso,cobrador_id,fecha_desembolso,cliente_id,tipo_operacion,modalidad'), 'fecha_desembolso', r)),
          todo(() => rango(sb.from('gastos').select('valor,metodo,categoria,usuario_id,fecha,descripcion,cuenta_id'), 'fecha', r)),
          todo(() => rango(sb.from('cajas').select('cobrador_id,diferencia,fecha,estado'), 'fecha', r))
        ]);
        return { pagos: pg.filter((x) => mio(x.cobrador_id)), prest: pr.filter((x) => mio(x.cobrador_id)), gastos: gs.filter((x) => mio(x.usuario_id)), cajas: cj.filter((x) => mio(x.cobrador_id)),
          liqs: ls.filter((l) => mio(l.cobrador_id) && (!r.desde || bog(l.fecha_pago) >= r.desde) && (!r.hasta || bog(l.fecha_pago) <= r.hasta)) };
      };
      const [D, P] = await Promise.all([cargar(f), ant ? cargar(ant) : Promise.resolve(null)]);
      const S_ = (arr, k) => arr.reduce((t, r) => t + Number(r[k] || 0), 0);
      const calc = (d) => {
        const cobEf = d.pagos.filter((p) => p.metodo === 'EFECTIVO'), cobTr = d.pagos.filter((p) => p.metodo === 'TRANSFERENCIA');
        const prEf = d.prest.filter((p) => p.medio_desembolso !== 'TRANSFERENCIA'), prTr = d.prest.filter((p) => p.medio_desembolso === 'TRANSFERENCIA');
        const gEf = d.gastos.filter((g) => g.metodo !== 'TRANSFERENCIA'), gTr = d.gastos.filter((g) => g.metodo === 'TRANSFERENCIA');
        const m = { cobEf, cobTr, prEf, prTr, gEf, gTr, ing: S_(d.pagos, 'valor'), pliq: S_(d.liqs, 'neto_pagado'), gast: S_(d.gastos, 'valor'), prestado: S_(d.prest, 'valor_entregado') };
        m.egr = m.prestado + m.gast + m.pliq; m.res = m.ing - m.egr;
        return m;
      };
      const M = calc(D), A = P ? calc(P) : null;
      const vr = (c, a) => (a == null ? '' : a === 0 ? (c === 0 ? 0 : '') : ((c - a) / Math.abs(a)) * 100);
      const R = (concepto, n, valor, antes) => ({ concepto, n, valor, antes: A ? antes : '', var: A ? vr(valor, antes) : '' });
      const H = (t) => ({ concepto: t, n: '', valor: '', antes: '', var: '' });
      const rows = [
        H('INGRESOS'),
        R('Cobros efectivo', M.cobEf.length, S_(M.cobEf, 'valor'), A && S_(A.cobEf, 'valor')),
        R('Cobros transferencia', M.cobTr.length, S_(M.cobTr, 'valor'), A && S_(A.cobTr, 'valor')),
        R('TOTAL INGRESOS', D.pagos.length, M.ing, A && A.ing),
        H('EGRESOS'),
        R('Préstamos efectivo', M.prEf.length, S_(M.prEf, 'valor_entregado'), A && S_(A.prEf, 'valor_entregado')),
        R('Préstamos transferencia', M.prTr.length, S_(M.prTr, 'valor_entregado'), A && S_(A.prTr, 'valor_entregado')),
        R('Gastos efectivo', M.gEf.length, S_(M.gEf, 'valor'), A && S_(A.gEf, 'valor')),
        R('Gastos transferencia', M.gTr.length, S_(M.gTr, 'valor'), A && S_(A.gTr, 'valor')),
        R('Pago a cobradores', D.liqs.length, M.pliq, A && A.pliq),
        R('TOTAL EGRESOS', D.prest.length + D.gastos.length + D.liqs.length, M.egr, A && A.egr),
        H('RESULTADO'),
        R('INGRESOS − EGRESOS', '', M.res, A && A.res),
        H('INFORMATIVO'),
        R('Valor prestado (bruto)', D.prest.length, S_(D.prest, 'valor_prestado'), A && S_(P.prest, 'valor_prestado')),
        R('Papelería retenida', D.prest.length, S_(D.prest, 'valor_papeleria'), A && S_(P.prest, 'valor_papeleria')),
        R('Diferencias de caja', D.cajas.length, S_(D.cajas, 'diferencia'), A && S_(P.cajas, 'diferencia'))
      ];
      // ---- indicadores de control
      const pct = (x, y) => (y > 0 ? ((x / y) * 100).toFixed(1) + ' %' : '—');
      const porCat = new Map(); D.gastos.forEach((g) => porCat.set(g.categoria, (porCat.get(g.categoria) || 0) + Number(g.valor)));
      const mayor = [...porCat.entries()].sort((a, b) => b[1] - a[1])[0];
      const ind = [
        { ind: 'Egresos totales sobre ingresos', val: pct(M.egr, M.ing), ant: A ? pct(A.egr, A.ing) : '' },
        { ind: 'Gastos operativos sobre ingresos', val: pct(M.gast, M.ing), ant: A ? pct(A.gast, A.ing) : '' },
        { ind: 'Pago a cobradores sobre ingresos', val: pct(M.pliq, M.ing), ant: A ? pct(A.pliq, A.ing) : '' },
        { ind: 'Préstamos entregados sobre ingresos', val: pct(M.prestado, M.ing), ant: A ? pct(A.prestado, A.ing) : '' },
        { ind: 'Margen del periodo (resultado / ingresos)', val: M.ing > 0 ? ((M.res / M.ing) * 100).toFixed(1) + ' %' : '—', ant: A && A.ing > 0 ? ((A.res / A.ing) * 100).toFixed(1) + ' %' : '' },
        { ind: 'Gasto operativo promedio por día', val: dias ? money(Math.round(M.gast / dias)) : '—', ant: A && dias ? money(Math.round(A.gast / dias)) : '' },
        { ind: 'Categoría con más gasto', val: mayor ? mayor[0] + ' (' + pct(mayor[1], M.gast) + ')' : '—', ant: '' }
      ];
      // ---- gastos por categoría (con % y comparación)
      const catAnt = new Map(); if (P) P.gastos.forEach((g) => catAnt.set(g.categoria, (catAnt.get(g.categoria) || 0) + Number(g.valor)));
      const catRows = [...new Set([...porCat.keys(), ...catAnt.keys()])].map((k) => ({ cat: k, n: D.gastos.filter((g) => g.categoria === k).length, val: porCat.get(k) || 0, pct: M.gast > 0 ? ((porCat.get(k) || 0) / M.gast) * 100 : 0, ant: P ? (catAnt.get(k) || 0) : '', var: P ? vr(porCat.get(k) || 0, catAnt.get(k) || 0) : '' }))
        .sort((a, b) => b.val - a.val);
      // ---- por cobrador
      const ids = [...new Set([...D.pagos.map((x) => x.cobrador_id), ...D.prest.map((x) => x.cobrador_id), ...D.gastos.map((x) => x.usuario_id), ...D.liqs.map((x) => x.cobrador_id)])].filter(Boolean);
      const cobRows = ids.map((id) => { const c = S_(D.pagos.filter((x) => x.cobrador_id === id), 'valor'), p = S_(D.prest.filter((x) => x.cobrador_id === id), 'valor_entregado'), g = S_(D.gastos.filter((x) => x.usuario_id === id), 'valor'), l = S_(D.liqs.filter((x) => x.cobrador_id === id), 'neto_pagado');
        return { cobrador: cat.perfil[id] || '', cobrado: c, prestado: p, gastos: g, liq: l, res: c - p - g - l }; }).sort((a, b) => b.cobrado - a.cobrado);
      // ---- evolución por semana (lunes a domingo)
      const lunes = (iso) => { const d = new Date(iso + 'T12:00:00Z'); const w = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - w); return d.toISOString().substring(0, 10); };
      const sem = new Map(); const ponerS = (iso, k, v) => { if (!iso) return; const w = lunes(String(iso).substring(0, 10)); if (!sem.has(w)) sem.set(w, { semana: w, ing: 0, egr: 0 }); sem.get(w)[k] += Number(v || 0); };
      D.pagos.forEach((x) => ponerS(x.fecha_pago, 'ing', x.valor)); D.prest.forEach((x) => ponerS(x.fecha_desembolso, 'egr', x.valor_entregado)); D.gastos.forEach((x) => ponerS(x.fecha, 'egr', x.valor));
      D.liqs.forEach((x) => ponerS(bog(x.fecha_pago), 'egr', x.neto_pagado));
      const semRows = [...sem.values()].sort((a, b) => (a.semana < b.semana ? -1 : 1)).map((x) => ({ semana: x.semana, ing: x.ing, egr: x.egr, res: x.ing - x.egr }));
      // ---- pago a cobradores: lo realmente pagado
      const liqRows = D.liqs.map((l) => ({ cobrador: cat.perfil[l.cobrador_id] || '', base: +l.pago_base, neto: +l.neto_pagado, pagada: bog(l.fecha_pago) }));
      // ===================== SECCIONES DEL INFORME GERENCIAL =====================
      const hoy_ = hoyCO(), hastaEf = f.hasta || hoy_;
      const [ctas, movs, papel, cartera, cajasAb] = await Promise.all([
        todo(() => sb.from('cuentas').select('id,nombre,tipo,saldo_inicial,activa')),
        todo(() => { let b = sb.from('movimientos_cuenta').select('id,cuenta_id,fecha,tipo,monto,descripcion,created_at').order('fecha').order('id'); return b.lte('fecha', hastaEf); }),
        sb.from('v_papeleria_por_cuenta').select('*').then((r) => r.data || []).catch(() => []),
        prestamosBase({ cobrador: f.cobrador }, cat, false),
        todo(() => sb.from('cajas').select('cobrador_id,fecha,estado').eq('estado', 'ABIERTA'))
      ]);
      const cuentasOp = ctas.filter((c) => c.tipo !== 'PAPELERIA');
      const nomC = (id) => (ctas.find((c) => c.id === id) || {}).nombre || '';
      const esPap = new Set(ctas.filter((c) => c.tipo === 'PAPELERIA').map((c) => c.id));
      const movsOp = movs.filter((m) => !esPap.has(m.cuenta_id));
      const enPer = (m) => (!f.desde || m.fecha >= f.desde);
      // --- Cuentas
      const ctaRows = cuentasOp.map((c) => {
        const mv = movsOp.filter((m) => m.cuenta_id === c.id);
        const previos = mv.filter((m) => f.desde && m.fecha < f.desde), per = mv.filter(enPer);
        const si = Number(c.saldo_inicial) + S_(previos, 'monto');
        const ent = S_(per.filter((m) => m.monto > 0 && !m.tipo.startsWith('TRANSFERENCIA')), 'monto');
        const sal = -S_(per.filter((m) => m.monto < 0 && !m.tipo.startsWith('TRANSFERENCIA')), 'monto');
        const tin = S_(per.filter((m) => m.tipo === 'TRANSFERENCIA_ENTRADA'), 'monto'), tout = -S_(per.filter((m) => m.tipo === 'TRANSFERENCIA_SALIDA'), 'monto');
        return { cuenta: c.nombre, ini: si, ent, tin, sal, tout, fin: si + ent + tin - sal - tout };
      });
      const totC = (k) => S_(ctaRows, k);
      const saldoFinal = totC('fin');
      // --- Movimientos por tipo (clasificados)
      const porTipo = new Map();
      movsOp.filter(enPer).forEach((m) => { const a = porTipo.get(m.tipo) || { tipo: MOV[m.tipo] || m.tipo, clase: CLASE[m.tipo] || 'Otro', n: 0, ent: 0, sal: 0 }; a.n++; if (m.monto > 0) a.ent += +m.monto; else a.sal -= +m.monto; porTipo.set(m.tipo, a); });
      const ordenC = { 'Operación': 0, 'Interno de caja': 1, 'Entre cuentas': 2, Otro: 3 };
      const tipoRows = [...porTipo.values()].map((a) => ({ ...a, neto: a.ent - a.sal })).sort((a, b) => ordenC[a.clase] - ordenC[b.clase] || b.ent + b.sal - (a.ent + a.sal));
      // --- Cuadre del libro: el saldo calculado debe coincidir con el saldo actual cuando el informe llega a hoy
      const alertas = [];
      const sumaMovTodos = (id) => Number(((ctas.find((c) => c.id === id) || {}).saldo_inicial) || 0) + S_(movsOp.filter((m) => m.cuenta_id === id), 'monto');
      ctaRows.forEach((r, i) => { const d = Math.abs(r.fin - sumaMovTodos(cuentasOp[i].id)); if (d > 0.5) alertas.push({ nivel: 'REVISAR', alerta: 'Cuenta que no cuadra', detalle: `${r.cuenta}: diferencia de ${money(d)} entre el saldo del informe y el libro.` }); });
      // --- Cartera (foto de hoy)
      const act = cartera.filter((x) => x.estado_k === 'ACTIVO');
      const carteraTot = S_(act, 'saldo'), vencidaTot = S_(act, 'valor_vencido'), enMora = act.filter((x) => x.vencidas > 0).length;
      const tramo = (d) => (d <= 0 ? '0. Al día' : d <= 7 ? '1. De 1 a 7 días de atraso' : d <= 30 ? '2. De 8 a 30 días' : d <= 60 ? '3. De 31 a 60 días' : '4. Más de 60 días');
      const aging = new Map(); act.forEach((x) => { const k = tramo(x.dias_atraso); const a = aging.get(k) || { tramo: k.substring(3), n: 0, saldo: 0, vencido: 0 }; a.n++; a.saldo += x.saldo; a.vencido += x.valor_vencido; aging.set(k, a); });
      const agingRows = [...aging.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([, v]) => ({ ...v, pct: carteraTot > 0 ? (v.saldo / carteraTot) * 100 : 0 }));
      const carCob = new Map(); act.forEach((x) => { const a = carCob.get(x.cobrador) || { cobrador: x.cobrador || '(sin cobrador)', n: 0, mora: 0, saldo: 0, vencido: 0 }; a.n++; if (x.vencidas > 0) a.mora++; a.saldo += x.saldo; a.vencido += x.valor_vencido; carCob.set(x.cobrador, a); });
      const carRows = [...carCob.values()].sort((a, b) => b.saldo - a.saldo).map((a) => ({ ...a, pct: a.saldo > 0 ? (a.vencido / a.saldo) * 100 : 0 }));
      // --- Cajas
      const cajaDif = D.cajas.filter((c) => c.estado === 'CERRADA');
      const viejas = cajasAb.filter((c) => mio(c.cobrador_id) && c.fecha < hoy_);
      if (viejas.length) alertas.push({ nivel: 'ATENCIÓN', alerta: 'Cajas sin cerrar', detalle: `${viejas.length} caja${viejas.length === 1 ? '' : 's'} de días anteriores siguen abiertas (la más antigua: ${dmy(viejas.map((c) => c.fecha).sort()[0])}). Ciérralas para que los saldos de las cuentas queden completos.` });
      const faltantes = -S_(cajaDif.filter((c) => c.diferencia < 0), 'diferencia'), sobrantes = S_(cajaDif.filter((c) => c.diferencia > 0), 'diferencia');
      if (faltantes > 0) alertas.push({ nivel: 'ATENCIÓN', alerta: 'Faltantes de caja', detalle: `Suman ${money(faltantes)}.` });
      if (carteraTot > 0 && vencidaTot / carteraTot > 0.15) alertas.push({ nivel: 'ATENCIÓN', alerta: 'Mora alta', detalle: `La cartera vencida es el ${((vencidaTot / carteraTot) * 100).toFixed(1)} % de la cartera activa.` });
      if (A && A.gast > 0 && M.gast > A.gast * 1.3) alertas.push({ nivel: 'ATENCIÓN', alerta: 'Gastos en aumento', detalle: `Los gastos subieron ${(((M.gast - A.gast) / A.gast) * 100).toFixed(0)} % frente al periodo anterior.` });
      if (M.res < 0) alertas.push({ nivel: 'ATENCIÓN', alerta: 'Resultado negativo', detalle: `Los egresos superaron a los ingresos por ${money(-M.res)} (incluye dinero prestado que vuelve en cuotas).` });
      const negs = ctaRows.filter((r) => r.fin < 0); if (negs.length) alertas.push({ nivel: 'REVISAR', alerta: 'Cuentas con saldo negativo', detalle: negs.map((r) => `${r.cuenta} (${money(r.fin)})`).join(', ') + '. Suele ser por cajas sin cerrar o ingresos sin registrar.' });
      if (!alertas.length) alertas.push({ nivel: 'OK', alerta: 'Sin alertas', detalle: 'No se encontraron situaciones para revisar con los datos del periodo.' });
      // --- Papelería (acumulado actual)
      const pap = papel.filter((x) => !f.cobrador);
      const papRow = pap.length ? [{ c: 'Papelería generada (acumulada)', v: S_(pap, 'papeleria_total') }, { c: 'Parte de la empresa', v: S_(pap, 'parte_empresa') }, { c: 'Parte de los cobradores (comisión)', v: S_(pap, 'parte_cobrador') },
        { c: 'Ya retirada', v: S_(pap, 'retirado') }, { c: 'Disponible', v: S_(pap, 'disponible') }] : [];
      // --- Resumen ejecutivo
      const pctS = (x, y) => (y > 0 ? ((x / y) * 100).toFixed(1) + ' %' : '—');
      const ejec = [
        { ind: 'Saldo total en cuentas (cierre)', val: money(saldoFinal), ant: A ? '' : '' },
        { ind: 'Ingresos (cobros)', val: money(M.ing), ant: A ? money(A.ing) : '' },
        { ind: 'Egresos (préstamos + gastos + cobradores)', val: money(M.egr), ant: A ? money(A.egr) : '' },
        { ind: 'Resultado (ingresos − egresos)', val: money(M.res), ant: A ? money(A.res) : '' },
        { ind: 'Dinero prestado a clientes', val: money(M.prestado), ant: A ? money(A.prestado) : '' },
        { ind: 'Gastos operativos', val: money(M.gast), ant: A ? money(A.gast) : '' },
        { ind: 'Pago a cobradores (liquidaciones)', val: money(M.pliq), ant: A ? money(A.pliq) : '' },
        { ind: 'Cartera en la calle (hoy)', val: money(carteraTot), ant: '' },
        { ind: 'Cartera vencida (hoy)', val: money(vencidaTot) + ' · ' + pctS(vencidaTot, carteraTot), ant: '' },
        { ind: 'Préstamos activos / en mora', val: act.length + ' / ' + enMora, ant: '' }];
      const H2 = (t) => t;
      // --- Hojas de detalle para Excel
      const movDet = movsOp.filter(enPer).map((m) => ({ fecha: m.fecha, cuenta: nomC(m.cuenta_id), tipo: MOV[m.tipo] || m.tipo, clase: CLASE[m.tipo] || 'Otro', entra: m.monto > 0 ? +m.monto : '', sale: m.monto < 0 ? -m.monto : '', desc: m.descripcion || '' }));
      const gasDet = D.gastos.map((g) => ({ fecha: g.fecha, cat: g.categoria, desc: g.descripcion || '', metodo: cap(g.metodo), cuenta: nomC(g.cuenta_id), quien: cat.perfil[g.usuario_id] || '', valor: +g.valor })).sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
      const prDet = D.prest.map((p) => ({ fecha: p.fecha_desembolso, cliente: (cat.cliente[p.cliente_id] || {}).nombre_completo || '', cobrador: cat.perfil[p.cobrador_id] || '', tipo: TIPOS[p.tipo_operacion] || p.tipo_operacion, medio: cap(p.medio_desembolso || 'EFECTIVO'), prestado: +p.valor_prestado, papeleria: +p.valor_papeleria, entregado: +p.valor_entregado })).sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
      const liqDet = D.liqs.map((l) => ({ cobrador: cat.perfil[l.cobrador_id] || '', desde: l.fecha_inicio, hasta: l.fecha_fin, base: +l.pago_base, comision: +l.comision_papeleria, faltantes: +l.total_faltantes, neto: +l.neto_pagado, pagada: bog(l.fecha_pago) }));
      const cols5 = A ? [C('Concepto', 'concepto'), C('Reg.', 'n', 'n'), C('Valor', 'valor', 'm'), C('Anterior', 'antes', 'm'), C('Var.', 'var', 'p')] : [C('Concepto', 'concepto'), C('Reg.', 'n', 'n'), C('Valor', 'valor', 'm')];
      const criterios = [
        'Ingresos = cobros de cuotas recibidos en el periodo (efectivo y transferencia), por su fecha de pago.',
        'Egresos = dinero entregado a clientes en préstamos (sin la papelería retenida) + gastos registrados + pago a cobradores. El dinero prestado no es un gasto: vuelve a la empresa en cuotas.',
        'Pago a cobradores = lo realmente pagado en cada liquidación (base + comisión − faltantes ± ajustes), por su fecha de pago; no el pago base pactado.',
        'Cuentas: el saldo inicial es el saldo a la fecha "Desde". Los movimientos internos de caja (base al cobrador, cierres) y las transferencias entre cuentas mueven dinero de un lugar a otro y no son ingresos ni gastos; por eso se muestran aparte.',
        'En las cuentas, el efectivo cobrado por los cobradores entra a la cuenta de oficina cuando se cierra su caja.',
        'La cartera (activa, vencida, atraso) es una foto de hoy, no del periodo. La papelería es el acumulado actual.',
        'Diferencias de caja: negativo = faltante, positivo = sobrante.'].map((t) => ({ t }));
      const sec = (n, t) => n + '. ' + t;
      return { cols: cols5, rows, tituloPrincipal: sec(3, 'Ingresos y egresos del periodo'),
        nota: (A ? 'Anterior = ' + dmy(ant.desde) + ' al ' + dmy(ant.hasta) + ' (mismo número de días). ' : 'Elige Desde y Hasta para comparar con el periodo anterior. ') + 'Los criterios usados están al final del informe.',
        hojas: [
          { nombre: 'Movimientos de cuentas', cols: [C('Fecha', 'fecha', 'd'), C('Cuenta', 'cuenta'), C('Tipo', 'tipo'), C('Clasificación', 'clase'), C('Entra', 'entra', 'm'), C('Sale', 'sale', 'm'), C('Descripción', 'desc')], rows: movDet },
          { nombre: 'Gastos', cols: [C('Fecha', 'fecha', 'd'), C('Categoría', 'cat'), C('Descripción', 'desc'), C('Método', 'metodo'), C('Cuenta', 'cuenta'), C('Registró', 'quien'), C('Valor', 'valor', 'm')], rows: gasDet },
          { nombre: 'Préstamos', cols: [C('Fecha', 'fecha', 'd'), C('Cliente', 'cliente'), C('Cobrador', 'cobrador'), C('Tipo', 'tipo'), C('Medio', 'medio'), C('Prestado', 'prestado', 'm'), C('Papelería', 'papeleria', 'm'), C('Entregado', 'entregado', 'm')], rows: prDet },
          { nombre: 'Liquidaciones', cols: [C('Cobrador', 'cobrador'), C('Desde', 'desde', 'd'), C('Hasta', 'hasta', 'd'), C('Base', 'base', 'm'), C('Comisión', 'comision', 'm'), C('Faltantes', 'faltantes', 'm'), C('Neto pagado', 'neto', 'm'), C('Pagada', 'pagada', 'd')], rows: liqDet }
        ],
        extras: [
          { primero: true, titulo: sec(1, 'Resumen ejecutivo'), cols: [W('Indicador', 'ind'), C('Este periodo', 'val')].concat(A ? [C('Anterior', 'ant')] : []), rows: ejec },
          { primero: true, titulo: sec(2, 'Alertas y puntos para revisar'), cols: [C('Nivel', 'nivel'), W('Qué revisar', 'texto')], rows: alertas.map((a) => ({ nivel: a.nivel, texto: a.alerta + ': ' + a.detalle })) },
          { titulo: sec(4, 'Entradas y salidas de las cuentas, por tipo de movimiento'), cols: [C('Movimiento', 'tipo'), C('Clasificación', 'clase'), C('Reg.', 'n', 'n'), C('Entradas', 'ent', 'm'), C('Salidas', 'sal', 'm'), C('Neto', 'neto', 'm')], rows: tipoRows },
          { titulo: sec(5, 'Cuentas: saldo inicial, entradas, salidas y saldo final'), cols: [C('Cuenta', 'cuenta'), C('Saldo inicial', 'ini', 'm', 1), C('Entradas', 'ent', 'm', 1), C('Transf. recibidas', 'tin', 'm', 1), C('Salidas', 'sal', 'm', 1), C('Transf. enviadas', 'tout', 'm', 1), C('Saldo final', 'fin', 'm', 1)], rows: ctaRows, totales: true },
          { titulo: sec(6, 'Cartera por antigüedad de atraso (hoy)'), cols: [C('Tramo', 'tramo'), C('Préstamos', 'n', 'n'), C('Saldo', 'saldo', 'm'), C('Vencido', 'vencido', 'm'), C('% cartera', 'pct', 'p')], rows: agingRows },
          { titulo: sec(7, 'Cartera por cobrador (hoy)'), cols: [C('Cobrador', 'cobrador'), C('Activos', 'n', 'n'), C('En mora', 'mora', 'n'), C('Saldo', 'saldo', 'm'), C('Vencido', 'vencido', 'm'), C('% vencido', 'pct', 'p')], rows: carRows },
          { titulo: sec(8, 'Resultado por cobrador en el periodo'), cols: [C('Cobrador', 'cobrador'), C('Cobrado', 'cobrado', 'm'), C('Prestado', 'prestado', 'm'), C('Gastos', 'gastos', 'm'), C('Liquidación', 'liq', 'm'), C('Resultado', 'res', 'm')], rows: cobRows },
          { titulo: sec(9, 'Pago a cobradores: lo realmente pagado'), cols: [C('Cobrador', 'cobrador'), C('Base pactado', 'base', 'm'), C('Neto pagado', 'neto', 'm'), C('Pagada', 'pagada', 'd')], rows: liqRows, total: 'neto' },
          { titulo: sec(10, 'Gastos por categoría'), cols: [C('Categoría', 'cat'), C('Reg.', 'n', 'n'), C('Valor', 'val', 'm'), C('% gastos', 'pct', 'p')].concat(A ? [C('Anterior', 'ant', 'm'), C('Var.', 'var', 'p')] : []), rows: catRows, total: 'val' },
          { titulo: sec(11, 'Cajas: faltantes y sobrantes'), cols: [C('Concepto', 'c'), C('Valor', 'v', 'm')], rows: [{ c: 'Cajas cerradas en el periodo', v: '' , n: cajaDif.length }, { c: 'Faltantes', v: faltantes }, { c: 'Sobrantes', v: sobrantes }].map((r) => (r.n != null ? { c: r.c + ': ' + r.n, v: '' } : r)) },
          { titulo: sec(12, 'Papelería'), cols: [C('Concepto', 'c'), C('Valor', 'v', 'm')], rows: papRow },
          { titulo: sec(13, 'Evolución por semana (inicia el lunes)'), cols: [C('Semana', 'semana', 'd'), C('Ingresos', 'ing', 'm'), C('Egresos', 'egr', 'm'), C('Resultado', 'res', 'm')], rows: semRows },
          { titulo: sec(14, 'Indicadores de control'), cols: [W('Indicador', 'ind'), C('Este periodo', 'val')].concat(A ? [C('Anterior', 'ant')] : []), rows: ind },
          { titulo: sec(15, 'Criterios y definiciones'), cols: [W('Criterio', 't')], rows: criterios }
        ] };
    } },
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
    const cls = (c) => (['m', 'n', 'p'].includes(c.f) ? 'r' : c.f === 'd' ? 'c' : '') + (c.w ? ' w' : '');
    return h('div', { class: 'rep-scroll' }, h('table', { class: 'rep-tabla' },
      h('thead', {}, h('tr', {}, cols.map((c) => h('th', { class: cls(c) }, c.t)))),
      h('tbody', {}, rows.map((r) => h('tr', {}, cols.map((c) => h('td', { class: cls(c) + (c.k === 'dif' && r.dif < 0 ? ' neg' : '') }, celda(c, r[c.k])))))),
      totales ? h('tfoot', {}, h('tr', {}, cols.map((c, i) => h('td', { class: cls(c) }, i === 0 ? 'TOTALES' : c.s ? celda(c, rows.reduce((s, r) => s + (Number(r[c.k]) || 0), 0)) : '')))) : null));
  }
  const sumar = (cols, rows) => cols.map((c, i) => (i === 0 ? 'TOTALES' : c.s ? rows.reduce((s, r) => s + (Number(r[c.k]) || 0), 0) : ''));

  const bloque = (x) => (x.rows.length ? h('div', { class: 'rep-extra' }, h('h3', {}, x.titulo),
    tabla(x.cols, x.rows, !!x.totales), x.total ? h('div', { class: 'rep-total' }, 'TOTAL ', h('b', {}, money(x.rows.reduce((s, r) => s + r[x.total], 0)))) : null) : null);

  function pintar() {
    const empresa = (S.cfg.EMPRESA_NOMBRE || '').trim() || 'DH Rutas';
    const ahora = new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'medium', timeStyle: 'short' });
    const n = datos.rows.length;
    cuerpo.replaceChildren(...[
      h('div', { class: 'rep-cab' }, h('div', { class: 'rep-emp' }, empresa), h('h2', {}, rep.titulo),
        h('div', { class: 'rep-meta' }, `Generado: ${ahora} · ${S.profile.nombre} · ${n} registro${n === 1 ? '' : 's'}`), h('div', { class: 'rep-meta' }, texto)),
      ...datos.extras.filter((x) => x.primero).map(bloque),
      datos.tituloPrincipal ? h('h3', { class: 'rep-sec' }, datos.tituloPrincipal) : null,
      datos.nota ? h('p', { class: 'rep-nota' }, datos.nota) : null,
      n ? tabla(datos.cols, datos.rows, datos.cols.some((c) => c.s)) : h('p', { class: 'rep-vacio' }, 'Sin registros con los filtros elegidos.'),
      ...datos.extras.filter((x) => !x.primero).map(bloque),
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
    const ex = [...datos.extras.filter((x) => x.primero), ...datos.extras.filter((x) => !x.primero)].filter((x) => x.rows.length);
    if (ex.length) {
      const fs = [];
      ex.forEach((x) => {
        fs.push([{ v: x.titulo, t: 's', e: 'b' }]);
        fs.push(x.cols.map((c) => ({ v: c.t, t: 's', e: 'h' })));
        x.rows.forEach((r) => fs.push(x.cols.map((c) => celda(c, r[c.k]))));
        if (x.totales) fs.push(x.cols.map((c, i) => (i === 0 ? { v: 'TOTALES', t: 's', e: 'b' } : c.s ? { v: x.rows.reduce((t, r) => t + (Number(r[c.k]) || 0), 0), t: 'n', e: 'bm' } : { v: '', e: 'b' })));
        if (x.total) fs.push([{ v: 'TOTAL', t: 's', e: 'b' }, ...Array(x.cols.length - 2).fill({ v: '', e: 'b' }), { v: x.rows.reduce((s, r) => s + r[x.total], 0), t: 'n', e: 'bm' }]);
        fs.push([]);
      });
      hojas.push({ nombre: datos.hojas ? 'Informe' : 'Resúmenes', anchos: [260, 110, 120, 120, 120, 120, 120], filas: fs });
    }
    (datos.hojas || []).filter((x) => x.rows.length).forEach((x) => hojas.push({ nombre: x.nombre,
      anchos: x.cols.map((c) => (c.f === 'm' ? 105 : c.f === 'd' ? 85 : Math.max(90, Math.min(260, c.t.length * 10)))), congelar: 1,
      filas: [x.cols.map((c) => ({ v: c.t, t: 's', e: 'h' })), ...x.rows.map((r) => x.cols.map((c) => celda(c, r[c.k])))] }));
    descargar(crearXlsx(hojas), `${sinTilde(rep.titulo).replace(/\s+/g, '_')}_${hoyCO()}.xlsx`);
    toast('Archivo de Excel descargado.');
  }

  ctx.view.replaceChildren(h('div', { class: 'stack rep-pagina' }, filtros, barra, cuerpo));
  await generar();
}
