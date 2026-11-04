// Ruta del cobrador, tarjeta del cliente (préstamo) y registro de cobros.
import { h, clear, icon, money, fdate, ftime, toast, fail, busy, empty, skeleton, sheet, field, selectEl, segmented, moneyInput, moneyVal, telDigits, hoyCO, num } from './lib.js';
import { S, sb, q, isStaff, nombreDe } from './state.js';
import { confirmarEliminar } from './lib.js';
const TIPOS = { NUEVO: 'Nuevo', MIGRACION: 'Migración', RENOVACION: 'Renovación', REFINANCIACION: 'Refinanciado' };

const F = { vista: 'hoy', mod: 'TODAS', buscar: '', cobrador: 'TODOS' };
const MODS = [['TODAS', 'Todas'], ['DIARIO', 'Diario'], ['SEMANAL', 'Semanal'], ['QUINCENAL', 'Quincenal'], ['MENSUAL', 'Mensual']];
const VISTAS = [['todos', 'Todos'], ['hoy', 'Hoy'], ['atrasados', 'Atrasados'], ['pagados', 'Pagados']];
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export async function ruta(ctx) {
  const { view } = ctx;
  ctx.setTop('Ruta', { sub: fdate(hoyCO(), true), actions: [{ icon: 'refresh', label: 'Actualizar', fn: () => ctx.refresh() }] });
  view.replaceChildren(skeleton(5));
  let rows;
  try {
    if (!isStaff()) {
      const cj = await q(sb.from('cajas').select('id,estado').eq('fecha', hoyCO()));
      if (!cj.length || cj[0].estado !== 'ABIERTA') {
        view.replaceChildren(empty(cj.length ? 'Tu caja está cerrada' : 'Tu caja aún no está abierta',
          cj.length ? 'Ya cerraste cuentas por hoy. Mañana la supervisora abrirá tu caja y podrás ver la ruta.' : 'La supervisora debe abrir tu caja del día para que veas la ruta y registres cobros.',
          h('a', { class: 'btn', href: '#/resumen' }, 'Ver resumen del día')));
        return;
      }
    }
    rows = await q(sb.from('v_ruta').select('*').order('nombre_completo'));
  }
  catch (e) {
    fail(e);
    view.replaceChildren(empty('No se pudo cargar la ruta', 'Revisa tu conexión e inténtalo de nuevo.', h('button', { class: 'btn', on: { click: () => ctx.refresh() } }, 'Reintentar')));
    return;
  }

  const staff = isStaff();
  const strip = h('div', { class: 'strip' });
  const tabs = h('div', { class: 'tabs', role: 'tablist' });
  const list = h('div', { class: 'stack' });
  const buscar = h('input', { type: 'search', placeholder: 'Buscar cliente o barrio', value: F.buscar, 'aria-label': 'Buscar', on: { input: (e) => { F.buscar = e.target.value; pintarLista(); } } });

  const chips = h('div', { class: 'chips' }, MODS.map(([v, t]) =>
    h('button', { class: 'chip' + (F.mod === v ? ' on' : ''), on: { click: (e) => { F.mod = v; [...chips.children].forEach((c) => c.classList.remove('on')); e.currentTarget.classList.add('on'); pintarLista(); } } }, t)));

  let cobSel = null;
  if (staff) {
    const cobs = S.profiles.filter((p) => p.rol === 'COBRADOR' && p.estado === 'ACTIVO');
    cobSel = selectEl([['TODOS', 'Todos los cobradores'], ...cobs.map((c) => [c.id, c.nombre])], F.cobrador, { 'aria-label': 'Cobrador', on: { change: (e) => { F.cobrador = e.target.value; pintarLista(); } } });
  }

  function base() {
    const t = norm(F.buscar);
    return rows.filter((r) => (F.mod === 'TODAS' || r.modalidad === F.mod)
      && (F.cobrador === 'TODOS' || r.cobrador_id === F.cobrador)
      && (!t || norm(r.nombre_completo + ' ' + r.barrio + ' ' + r.direccion).includes(t)));
  }
  function pintarLista() {
    const b = base();
    const sets = {
      todos: b,
      hoy: b.filter((r) => r.es_hoy).sort((x, y) => norm(x.barrio).localeCompare(norm(y.barrio)) || x.nombre_completo.localeCompare(y.nombre_completo)),
      atrasados: b.filter((r) => r.atrasado).sort((x, y) => y.dias_atraso - x.dias_atraso),
      pagados: b.filter((r) => r.pagado_hoy)
    };
    clear(tabs).append(...VISTAS.map(([v, t]) => h('button', { class: F.vista === v ? 'on' : '', role: 'tab', on: { click: () => { F.vista = v; pintarLista(); } } }, t, h('b', {}, String(sets[v].length)))));
    const porCobrar = b.reduce((a, r) => a + Number(r.valor_a_cobrar || 0), 0);
    const cobrado = b.reduce((a, r) => a + Number(r.cobrado_hoy || 0), 0);
    clear(strip).append(
      h('button', { class: 'stat tap', type: 'button', on: { click: () => detalleRuta('Falta por cobrar', b.filter((r) => Number(r.valor_a_cobrar || 0) > 0), 'valor_a_cobrar', staff) } }, h('div', { class: 'v' }, money(porCobrar)), h('div', { class: 'l' }, 'Falta por cobrar')),
      h('button', { class: 'stat good tap', type: 'button', on: { click: () => detalleRuta('Cobrado hoy', b.filter((r) => Number(r.cobrado_hoy || 0) > 0), 'cobrado_hoy', staff) } }, h('div', { class: 'v' }, money(cobrado)), h('div', { class: 'l' }, 'Cobrado hoy')));
    const items = sets[F.vista];
    clear(list);
    if (!items.length) {
      const msg = {
        hoy: ['Nada para cobrar hoy', 'Cuando haya cuotas con fecha de hoy aparecerán aquí.'],
        atrasados: ['No hay clientes atrasados', 'Buen trabajo: todos están al día.'],
        pagados: ['Aún no hay cobros hoy', 'Los clientes que paguen hoy aparecen aquí. Mañana esta lista empieza limpia.'],
        todos: ['No hay préstamos activos', F.buscar || F.mod !== 'TODAS' ? 'Prueba quitando los filtros.' : 'Cuando se creen préstamos aparecerán aquí.']
      }[F.vista];
      list.append(empty(msg[0], msg[1]));
    } else {
      list.append(h('div', { class: 'ledger' }, items.map((r) => fila(r, staff))));
    }
  }
  view.replaceChildren(
    h('div', { class: 'stack' }, strip, tabs, h('div', {}, chips, h('div', { class: 'search' }, icon('search', 20), buscar), cobSel ? h('div', { style: { marginTop: '10px' } }, cobSel) : null), list));
  pintarLista();
}

function detalleRuta(titulo, items, campo, staff) {
  const total = items.reduce((a, r) => a + Number(r[campo] || 0), 0);
  sheet(titulo + ' · ' + money(total), (close) => items.length
    ? h('div', { class: 'ledger' }, items.map((r) => h('a', { class: 'item', href: '#/prestamo/' + r.prestamo_id, on: { click: close } },
        h('div', { class: 'grow' }, h('div', { class: 'name' }, r.nombre_completo), h('div', { class: 'meta' }, r.barrio ? h('span', {}, r.barrio) : null, r.atrasado ? h('span', { class: 'late' }, r.dias_atraso + ' d de atraso') : null, staff && r.cobrador_id ? h('span', {}, nombreDe(r.cobrador_id)) : null)),
        h('div', { class: 'amt' }, money(r[campo])))))
    : h('p', { class: 'muted' }, 'No hay registros.'));
}
function fila(r, staff) {
  const debe = Number(r.valor_a_cobrar || 0);
  const st = debe > 0 ? (r.atrasado ? 's-late' : 's-hoy') : (r.pagado_hoy ? 's-ok' : '');
  let placa;
  if (debe > 0) placa = h('div', { class: 'plate' }, money(debe), h('small', {}, r.atrasado ? 'debe' : 'cobrar hoy'));
  else if (r.pagado_hoy) placa = h('div', { class: 'plate paid' }, money(r.cobrado_hoy), h('small', {}, 'pagó hoy'));
  else placa = h('div', { class: 'plate quiet' }, money(r.valor_cuota), h('small', {}, 'cuota'));
  return h('a', { class: 'item ' + st, href: '#/prestamo/' + r.prestamo_id },
    h('div', { class: 'grow' },
      h('div', { class: 'name' }, r.nombre_completo),
      h('div', { class: 'meta' },
        r.barrio ? h('span', {}, r.barrio) : null,
        h('span', {}, cap(r.modalidad)),
        r.atrasado ? h('span', { class: 'late' }, r.dias_atraso + (r.dias_atraso === 1 ? ' día' : ' días') + ' de atraso') : null,
        debe > 0 && r.pagado_hoy ? h('span', { class: 'okc' }, 'Abonó ' + money(r.cobrado_hoy)) : null,
        staff && r.cobrador_id ? h('span', {}, nombreDe(r.cobrador_id)) : null)),
    placa);
}
const cap = (s) => (s ? s[0] + s.slice(1).toLowerCase() : '');

// ---------------------------------------------------------------- Tarjeta
export async function tarjeta(ctx) {
  const { view } = ctx;
  const id = ctx.params[0];
  ctx.setTop('Cliente', { back: isStaff() ? '#/prestamos' : '#/ruta' });
  view.replaceChildren(skeleton(4));
  let pr, cuotas, pagos, cli;
  try {
    [pr, cuotas, pagos] = await Promise.all([
      q(sb.from('v_prestamos_resumen').select('*').eq('id', id).single()),
      q(sb.from('cuotas').select('*').eq('prestamo_id', id).order('numero')),
      q(sb.from('pagos').select('*').eq('prestamo_id', id).order('hora_pago', { ascending: false }))
    ]);
    cli = await q(sb.from('clientes').select('*').eq('id', pr.cliente_id).single());
  } catch (e) {
    fail(e);
    view.replaceChildren(empty('No se pudo abrir el préstamo', 'Puede que no sea de tu ruta o que no tengas conexión.'));
    return;
  }
  const hoy = hoyCO();
  const staff = isStaff();
  ctx.setTop(cli.nombre_completo, { back: staff ? '#/prestamos' : '#/ruta', sub: cap(pr.modalidad) + (staff && pr.tipo_operacion && pr.tipo_operacion !== 'NUEVO' ? ' · ' + TIPOS[pr.tipo_operacion] : '') + ' · ' + (pr.estado === 'ACTIVO' ? 'Activo' : pr.estado.toLowerCase()) });

  const pend = cuotas.filter((c) => c.estado !== 'PAGADA');
  const debeHoy = pend.filter((c) => c.fecha_programada <= hoy).reduce((a, c) => a + Number(c.saldo_cuota), 0);
  const atrasoDias = pend.length && pend[0].fecha_programada < hoy ? Math.round((new Date(hoy) - new Date(pend[0].fecha_programada)) / 864e5) : 0;
  const dir = [cli.direccion, cli.barrio].filter(Boolean).join(' · ');
  const tel = telDigits(cli.telefono);
  const mapa = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent([cli.direccion, cli.barrio, 'Colombia'].filter(Boolean).join(', '));
  const pct = pr.numero_cuotas ? Math.round((pr.cuotas_pagadas / pr.numero_cuotas) * 100) : 0;
  const pagadoHoy = pagos.filter((p) => p.estado_pago === 'VIGENTE' && p.fecha_pago === hoy).reduce((a, p) => a + Number(p.valor), 0);

  const hero = h('div', { class: 'hero' },
    h('div', { class: 'nm' }, cli.nombre_completo),
    dir ? h('div', { class: 'ad' }, dir) : null,
    cli.referencia_direccion ? h('div', { class: 'ad' }, cli.referencia_direccion) : null,
    h('div', { class: 'due' },
      h('div', { class: 'lbl' }, pr.estado !== 'ACTIVO' ? 'Préstamo ' + pr.estado.toLowerCase() : debeHoy > 0 ? (atrasoDias > 0 ? 'Debe (' + atrasoDias + (atrasoDias === 1 ? ' día' : ' días') + ' de atraso)' : 'Cobrar hoy') : pagadoHoy > 0 ? 'Pagó hoy ' + money(pagadoHoy) : 'Al día'),
      pr.estado === 'ACTIVO' ? h('div', { class: 'plate' }, money(debeHoy > 0 ? debeHoy : pr.valor_cuota), h('small', {}, debeHoy > 0 ? 'a cobrar' : 'próxima cuota')) : null),
    h('div', { class: 'quickacts' },
      h('a', { class: 'qa' + (tel ? '' : ' off'), href: tel ? 'tel:+' + tel : '#' }, icon('phone'), 'Llamar'),
      h('a', { class: 'qa' + (tel ? '' : ' off'), href: tel ? 'https://wa.me/' + tel : '#', target: '_blank', rel: 'noopener' }, icon('chat'), 'WhatsApp'),
      h('a', { class: 'qa' + (dir ? '' : ' off'), href: mapa, target: '_blank', rel: 'noopener' }, icon('pin'), 'Mapa')));

  const kv = h('div', { class: 'kv' },
    kvc('Prestado', money(pr.valor_prestado)), kvc('Interés', Number(pr.porcentaje_interes) + ' % · ' + money(pr.total_interes)),
    kvc('Total a cobrar', money(pr.total_a_cobrar)), kvc('Cobrado', money(pr.total_cobrado)),
    kvc('Saldo', money(pr.saldo)), kvc('Valor de la cuota', money(pr.valor_cuota)),
    kvc('Desembolso', fdate(pr.fecha_desembolso)), kvc(pr.estado === 'ACTIVO' ? 'Próxima cuota' : 'Última cuota', fdate(pr.estado === 'ACTIVO' ? pr.proxima_cuota : pr.fecha_final)),
    kvc('Documento', cli.documento || '—'), kvc('Teléfono', cli.telefono || '—'));

  const prog = h('div', { class: 'panel' },
    h('div', { class: 'row between small' }, h('b', {}, pr.cuotas_pagadas + ' de ' + pr.numero_cuotas + ' cuotas pagadas'), h('span', { class: 'muted' }, pct + ' %')),
    h('div', { class: 'progress', style: { marginTop: '8px' } }, h('i', { style: { width: pct + '%' } })));

  const grid = h('div', { class: 'cuotas' }, cuotas.map((c) => {
    const late = c.estado !== 'PAGADA' && c.fecha_programada < hoy;
    const cls = c.estado === 'PAGADA' ? 'pag' : c.estado === 'PARCIAL' ? 'par' : late ? 'late' : '';
    return h('div', { class: 'cu ' + cls + (c.fecha_programada === hoy ? ' hoy' : ''), title: money(c.valor_pagado) + ' de ' + money(c.valor_programado) }, h('b', {}, '#' + c.numero), fdate(c.fecha_programada));
  }));

  const hist = h('div', { class: 'panel' }, pagos.length ? pagos.map((p) => {
    const anul = p.estado_pago === 'ANULADO';
    return h('div', { class: 'line' },
      h('div', { class: 'grow' + (anul ? ' void' : '') },
        h('div', {}, fdate(p.fecha_pago) + ' · ' + ftime(p.hora_pago), ' ', h('span', { class: 'tag' + (p.metodo === 'EFECTIVO' ? '' : ' ok') }, p.metodo === 'EFECTIVO' ? 'Efectivo' : 'Transferencia')),
        p.observacion ? h('div', { class: 'small muted' }, p.observacion) : null),
      h('div', { class: 'amt' + (anul ? ' void' : '') }, money(p.valor)),
      staff && !anul ? h('button', { class: 'icon-btn', style: { color: 'var(--warn, var(--bad))' }, 'aria-label': 'Anular pago', title: 'Anular', on: { click: () => anular(p, ctx) } }, icon('close', 20)) : null,
      staff ? h('button', { class: 'icon-btn', style: { color: 'var(--bad)' }, 'aria-label': 'Eliminar pago', title: 'Eliminar', on: { click: () => confirmarEliminar({ titulo: 'Eliminar pago de ' + money(p.valor), texto: 'El pago se borra por completo y el saldo del cliente se restablece. Si fue por transferencia o en una caja cerrada, el dinero se reversa en las cuentas.', onOk: async (m) => { await q(sb.rpc('eliminar_pago', { p_pago: p.id, p_motivo: m })); toast('Pago eliminado'); ctx.refresh(); } }) } }, icon('trash', 20)) : null);
  }) : h('p', { class: 'muted' }, 'Todavía no hay pagos registrados.'));

  // El cobrador solo ve las cuotas (sin valor prestado, interés, fechas de desembolso ni saldos del préstamo)
  const listaCuotas = h('div', { class: 'panel' }, cuotas.map((c) => {
    const late = c.estado !== 'PAGADA' && c.fecha_programada < hoy;
    const etiqueta = c.estado === 'PAGADA' ? 'Pagada' : c.estado === 'PARCIAL' ? 'Abonada ' + money(c.valor_pagado) : late ? 'Atrasada' : c.fecha_programada === hoy ? 'Hoy' : 'Pendiente';
    const cls = c.estado === 'PAGADA' ? 'ok' : c.estado === 'PARCIAL' ? 'warn' : late ? 'bad' : '';
    return h('div', { class: 'line' },
      h('div', { class: 'grow' }, h('b', {}, 'Cuota ' + c.numero), h('div', { class: 'small muted' }, fdate(c.fecha_programada))),
      h('span', { class: 'tag ' + cls }, etiqueta),
      h('div', { class: 'amt', style: { minWidth: '84px', textAlign: 'right' } }, money(c.valor_programado)));
  }));
  view.replaceChildren(h('div', { class: 'stack' },
    hero, prog,
    kv,
    h('div', { class: 'section' }, h('h3', {}, 'Cuotas'), grid),
    h('div', { class: 'section' }, h('h3', {}, 'Pagos'), hist),
    !staff ? h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '8px' } },
      pr.estado === 'PAGADO' ? h('a', { class: 'btn small primary', href: '#/prestamo-nuevo?tipo=RENOVACION&anterior=' + pr.id }, 'Renovar') : null,
      pr.estado === 'ACTIVO' && Number(pr.saldo) > 0 ? h('a', { class: 'btn small', href: '#/prestamo-nuevo?tipo=REFINANCIACION&anterior=' + pr.id }, 'Refinanciar') : null) : null,
    staff ? h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '8px' } },
      h('a', { class: 'btn small', href: '#/cliente/' + cli.id }, 'Ver cliente'),
      pr.estado === 'PAGADO' ? h('a', { class: 'btn small primary', href: '#/prestamo-nuevo?tipo=RENOVACION&anterior=' + pr.id }, 'Renovar') : null,
      pr.estado === 'ACTIVO' && Number(pr.saldo) > 0 ? h('a', { class: 'btn small', href: '#/prestamo-nuevo?tipo=REFINANCIACION&anterior=' + pr.id }, 'Refinanciar') : null,
      pr.estado === 'ACTIVO' || pr.estado === 'PAGADO' ? h('a', { class: 'btn small', href: '#/prestamo-nuevo?cliente=' + cli.id }, 'Nuevo préstamo') : null,
      h('button', { class: 'btn small', on: { click: () => editarFechas(pr, ctx) } }, 'Editar fechas'),
      h('button', { class: 'btn small', on: { click: () => opciones(pr, ctx) } }, 'Papelería / comisión'),
      h('button', { class: 'btn small danger', on: { click: () => confirmarEliminar({ titulo: 'Eliminar préstamo', texto: 'Se elimina el préstamo con sus cuotas y pagos, y se reversan los movimientos de dinero (desembolso, papelería, cobros). Esta acción no se puede deshacer.', onOk: async (m) => { await q(sb.rpc('eliminar_prestamo', { p_prestamo: pr.id, p_motivo: m })); toast('Préstamo eliminado'); location.hash = '#/prestamos'; } }) } }, 'Eliminar préstamo')) : null,
    pr.estado === 'ACTIVO' ? h('div', { class: 'actionbar' }, h('button', { class: 'btn primary block', on: { click: () => abrirCobro(ctx, pr, debeHoy, cuotas) } }, icon('cash'), 'Registrar cobro')) : null));
}
const kvc = (k, v) => h('div', {}, h('div', { class: 'k' }, k), h('div', { class: 'v' }, v));

function abrirCobro(ctx, pr, debeHoy, cuotas) {
  const saldo = Number(pr.saldo);
  const inicial = Math.min(debeHoy > 0 ? debeHoy : Number(pr.valor_cuota), saldo);
  const monto = moneyInput({ 'aria-label': 'Valor cobrado' });
  const poner = (v) => { monto.value = num(Math.min(v, saldo)); };
  poner(inicial);
  const metodo = segmented([['EFECTIVO', 'Efectivo'], ['TRANSFERENCIA', 'Transferencia']], 'EFECTIVO', (v) => { cuentaBox.style.display = v === 'TRANSFERENCIA' ? '' : 'none'; });
  const cuentasOk = S.cuentas.filter((c) => c.tipo !== 'EFECTIVO' && c.tipo !== 'PAPELERIA');
  const cuenta = selectEl(cuentasOk.map((c) => [c.id, c.nombre]), S.profile.cuenta_recaudo_id || (cuentasOk[0] && cuentasOk[0].id));
  const cuentaBox = h('div', { style: { display: 'none' } },
    cuentasOk.length ? field('Cuenta donde entró el dinero', cuenta)
      : h('p', { class: 'hint', style: { marginBottom: '14px' } }, S.profile.cuenta_recaudo_id ? 'El dinero se acredita a tu cuenta de recaudo.' : 'No tienes cuenta de recaudo asignada. Pídele al administrador que la configure.'));
  const obs = h('textarea', { placeholder: 'Opcional', maxlength: '200' });

  sheet('Registrar cobro', (close) => h('div', {},
    h('p', { class: 'muted', style: { marginBottom: '12px' } }, pr.nombre_completo + ' · saldo ' + money(saldo)),
    field('Valor cobrado', monto),
    h('div', { class: 'quick', style: { marginBottom: '14px' } },
      h('button', { class: 'chip', type: 'button', on: { click: () => poner(Number(pr.valor_cuota)) } }, 'Cuota ' + money(pr.valor_cuota)),
      debeHoy > 0 && debeHoy !== Number(pr.valor_cuota) ? h('button', { class: 'chip', type: 'button', on: { click: () => poner(debeHoy) } }, 'Lo vencido ' + money(debeHoy)) : null,
      h('button', { class: 'chip', type: 'button', on: { click: () => poner(saldo) } }, 'Saldo total ' + money(saldo))),
    h('div', { class: 'field' }, h('label', {}, 'Cómo pagó'), metodo),
    cuentaBox,
    field('Nota', obs),
    h('button', { class: 'btn primary block', on: { click: (e) => busy(e.currentTarget, async () => {
      const v = moneyVal(monto);
      if (v <= 0) throw new Error('Escribe el valor cobrado.');
      if (v > saldo) throw new Error('El valor no puede ser mayor al saldo (' + money(saldo) + ').');
      const m = metodo.get();
      const u = await ubicacion();
      await q(sb.rpc('registrar_pago', { p_prestamo: pr.id, p_valor: v, p_metodo: m, p_cuenta: m === 'TRANSFERENCIA' && cuentasOk.length ? cuenta.value : null, p_obs: obs.value.trim() || null, p_lat: u.lat ?? null, p_lng: u.lng ?? null }));
      close();
      toast('Cobro de ' + money(v) + ' registrado' + (v >= saldo ? '. Préstamo pagado.' : ''));
      if (isStaff()) ctx.refresh(); else location.hash = '#/ruta';
    }) } }, 'Confirmar cobro')));
}
function ubicacion() {
  return new Promise((res) => {
    if (!navigator.geolocation) return res({});
    navigator.geolocation.getCurrentPosition((p) => res({ lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6) }), () => res({}), { timeout: 3500, maximumAge: 60000 });
  });
}
function anular(p, ctx) {
  const motivo = h('textarea', { placeholder: 'Ej.: valor mal digitado', maxlength: '200' });
  sheet('Anular pago de ' + money(p.valor), (close) => h('div', {},
    h('p', { class: 'muted', style: { marginBottom: '12px' } }, 'El pago queda marcado como anulado, el saldo del cliente se restablece y se devuelve el dinero de la cuenta si fue por transferencia.'),
    field('Motivo', motivo),
    h('button', { class: 'btn danger block', on: { click: (e) => busy(e.currentTarget, async () => {
      if (!motivo.value.trim()) throw new Error('Escribe el motivo de la anulación.');
      await q(sb.rpc('anular_pago', { p_pago: p.id, p_motivo: motivo.value.trim() }));
      close(); toast('Pago anulado'); ctx.refresh();
    }) } }, 'Anular pago')));
}

function opciones(pr, ctx) {
  const dinero = pr.tipo_operacion === 'NUEVO' || pr.tipo_operacion === 'RENOVACION';
  const pap = segmented([['SI', 'Sí'], ['NO', 'No']], pr.descuenta_papeleria ? 'SI' : 'NO');
  const com = segmented([['SI', 'Sí'], ['NO', 'No']], pr.paga_comision ? 'SI' : 'NO');
  sheet('Papelería y comisión', (close) => h('div', {},
    dinero ? h('div', { class: 'field' }, h('label', {}, 'Descontar papelería al cliente'), pap, h('p', { class: 'hint' }, 'Solo aplica a préstamos nuevos y renovados.')) : h('p', { class: 'hint', style: { marginBottom: '14px' } }, 'Los préstamos migrados o refinanciados no llevan papelería.'),
    h('div', { class: 'field' }, h('label', {}, 'Pagar comisión al cobrador'), com),
    h('button', { class: 'btn primary block', on: { click: (e) => busy(e.currentTarget, async () => {
      await q(sb.rpc('editar_prestamo_opciones', { p_prestamo: pr.id, p_descuenta_papeleria: dinero ? pap.get() === 'SI' : null, p_paga_comision: com.get() === 'SI' }));
      close(); toast('Cambios guardados'); ctx.refresh();
    }) } }, 'Guardar')));
}

// Supervisora / administrador: corregir la fecha del préstamo y del primer cobro (las cuotas se recalculan; los cobros hechos se conservan)
function editarFechas(pr, ctx) {
  const fd = h('input', { type: 'date', value: pr.fecha_desembolso });
  const fp = h('input', { type: 'date', value: pr.fecha_primer_pago });
  sheet('Editar fechas del préstamo', (close) => h('div', { class: 'stack' },
    h('p', { class: 'hint panelnote' }, 'Sirve para corregir un error de fecha. Las fechas de todas las cuotas se vuelven a calcular desde el primer cobro; lo que el cliente ya pagó no cambia.'),
    field('Fecha del préstamo (desembolso)', fd),
    field('Fecha del primer cobro', fp),
    h('button', { class: 'btn primary block', on: { click: (e) => busy(e.currentTarget, async () => {
      if (!fd.value || !fp.value) throw new Error('Escribe las dos fechas.');
      await q(sb.rpc('editar_prestamo', { p_prestamo: pr.id, p_fecha_desembolso: fd.value, p_fecha_primer_pago: fp.value }));
      toast('Fechas actualizadas'); close(); ctx.refresh();
    }) } }, 'Guardar cambios')));
}
