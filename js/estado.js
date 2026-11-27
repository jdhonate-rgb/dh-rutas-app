// Tarjeta digital del préstamo: se dibuja en un canvas y se envía al cliente (WhatsApp / compartir / descargar).
import { toast, fail, money, telDigits, hoyCO } from './lib.js';
import { S } from './state.js';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const fcorta = (iso) => { if (!iso) return ''; const [y, m, d] = String(iso).slice(0, 10).split('-'); return d + '/' + m + '/' + y.slice(2); };

// Pagos reales (los que registró el cobrador), en orden cronológico, con el saldo que queda tras cada uno
export function pagosEstado(pr, pagos) {
  let resta = Number(pr.total_a_cobrar || 0);
  return pagos.filter((p) => p.estado_pago === 'VIGENTE')
    .sort((x, y) => String(x.hora_pago).localeCompare(String(y.hora_pago)))
    .map((p) => { resta -= Number(p.valor || 0); return { fecha: p.fecha_pago, abono: Number(p.valor || 0), saldo: Math.max(resta, 0) }; });
}

export function dibujarTarjeta(pr, cli, cuotas, pagos) {
  const pg = pagosEstado(pr, pagos);
  const nf = Math.max(cuotas.length, pg.length);
  const W = 900, PAD = 36, RH = 40, top = 430;
  const H = top + 70 + nf * RH + 130;
  const cv = document.createElement('canvas');
  cv.width = W * 2; cv.height = H * 2;
  const g = cv.getContext('2d');
  g.scale(2, 2);
  const F = (s, w) => (w || '') + ' ' + s + 'px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const txt = (t, x, y, o = {}) => { g.font = F(o.s || 24, o.w); g.fillStyle = o.c || '#1b2330'; g.textAlign = o.a || 'left'; g.fillText(String(t), x, y); };
  const line = (x1, y1, x2, y2, c = '#c9d1dc', w = 1.5) => { g.strokeStyle = c; g.lineWidth = w; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); };

  g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#0f3d66'; g.fillRect(0, 0, W, 110);
  txt((S.cfg.EMPRESA_NOMBRE || 'Estado del crédito').toUpperCase(), W / 2, 66, { s: 38, w: '800', c: '#fff', a: 'center' });
  txt('ESTADO DE SU CRÉDITO', W / 2, 96, { s: 18, w: '600', c: '#bcd3ea', a: 'center' });

  const [y0, m0, d0] = String(pr.fecha_desembolso || '').slice(0, 10).split('-');
  const pagado = pg.reduce((a, f) => a + f.abono, 0);
  const saldo = Math.max(Number(pr.total_a_cobrar || 0) - pagado, 0);
  const col = (lbl, val, x, y, w) => { txt(lbl, x, y, { s: 17, c: '#6b7787', w: '600' }); txt(val, x, y + 32, { s: 28, w: '800' }); };
  col('VALOR PRESTADO', money(pr.valor_prestado), PAD, 160);
  col('TOTAL A PAGAR', money(pr.total_a_cobrar), W / 2 + 10, 160);
  line(PAD, 215, W - PAD, 215);
  col('SEÑOR(A)', cli.nombre_completo || '', PAD, 250);
  col('CUOTA ' + String(pr.modalidad || '').toUpperCase(), money(pr.valor_cuota), W / 2 + 10, 250);
  line(PAD, 305, W - PAD, 305);
  col('FECHA DE INICIO', d0 ? d0 + ' de ' + MESES[Number(m0) - 1] + ' de ' + y0 : '', PAD, 340);
  col('SALDO PENDIENTE', money(saldo), W / 2 + 10, 340);
  const npend = cuotas.filter((c) => c.estado !== 'PAGADA').length;
  txt(pr.cuotas_pagadas + ' de ' + pr.numero_cuotas + ' cuotas pagadas · ' + npend + (npend === 1 ? ' pendiente' : ' pendientes'), PAD, 410, { s: 20, w: '700', c: '#0f3d66' });

  // Tabla
  const cx = [PAD, PAD + 56, PAD + 186, PAD + 425, PAD + 555];
  let y = top;
  g.fillStyle = '#eaf1f8'; g.fillRect(PAD - 8, y, W - 2 * PAD + 16, 46);
  ['N.º', 'F. CUOTA', 'PENDIENTE', 'F. PAGO', 'ABONO'].forEach((t, i) => txt(t, cx[i], y + 31, { s: 18, w: '800' }));
  txt('SALDO', W - PAD, y + 31, { s: 18, w: '800', a: 'right' });
  y += 46;
  for (let i = 0; i < nf; i++) {
    if (i % 2) { g.fillStyle = '#f7f9fc'; g.fillRect(PAD - 8, y, W - 2 * PAD + 16, RH); }
    const c = cuotas[i], p = pg[i];
    if (c) {
      const pend = Math.max(Number(c.saldo_cuota || 0), 0);
      txt(c.numero, cx[0], y + 28, { s: 20, c: '#6b7787' });
      txt(fcorta(c.fecha_programada), cx[1], y + 28, { s: 20 });
      txt(pend > 0 ? money(pend) : 'Pagada', cx[2], y + 28, { s: 20, w: pend > 0 ? '700' : '', c: pend > 0 ? '#b42318' : '#12703a' });
    }
    if (p) {
      txt(fcorta(p.fecha), cx[3], y + 28, { s: 20 });
      txt(money(p.abono), cx[4], y + 28, { s: 20, w: '700', c: '#12703a' });
      txt(money(p.saldo), W - PAD, y + 28, { s: 20, a: 'right' });
    }
    y += RH;
  }
  line(PAD + 405, top + 46, PAD + 430, y, '#c9d1dc', 1.5);
  line(PAD - 8, y, W - PAD + 8, y, '#0f3d66', 2);
  y += 52;
  txt('SIN CANCELAR SU CRÉDITO NO HAY OTRO CRÉDITO', W / 2, y, { s: 21, w: '800', c: '#b42318', a: 'center' });
  txt('Generado el ' + fcorta(hoyCO()) + ' · Gracias por su pago puntual', W / 2, y + 36, { s: 16, c: '#6b7787', a: 'center' });
  return cv;
}

export function textoEstado(pr, cli, cuotas, pagos) {
  const pagado = pagosEstado(pr, pagos).reduce((a, f) => a + f.abono, 0);
  const saldo = Math.max(Number(pr.total_a_cobrar || 0) - pagado, 0);
  const emp = S.cfg.EMPRESA_NOMBRE ? S.cfg.EMPRESA_NOMBRE + '\n' : '';
  return emp + 'Hola ' + (cli.nombre_completo || '').split(' ')[0] + ', este es el estado de su crédito:\n' +
    'Valor prestado: ' + money(pr.valor_prestado) + '\nTotal a pagar: ' + money(pr.total_a_cobrar) +
    '\nCuota: ' + money(pr.valor_cuota) + '\nPagado: ' + money(pagado) + '\nSaldo pendiente: ' + money(saldo) +
    '\nCuotas pagadas: ' + pr.cuotas_pagadas + ' de ' + pr.numero_cuotas;
}

export async function enviarEstado(pr, cli, cuotas, pagos, btn) {
  if (btn) btn.disabled = true;
  try {
    const cv = dibujarTarjeta(pr, cli, cuotas, pagos);
    const blob = await new Promise((ok) => cv.toBlob(ok, 'image/png'));
    if (!blob) throw new Error('No se pudo generar la imagen');
    const nombre = 'estado-' + String(cli.nombre_completo || 'cliente').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.png';
    const file = new File([blob], nombre, { type: 'image/png' });
    const texto = textoEstado(pr, cli, cuotas, pagos);
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], text: texto }); return; }
      catch (e) { if (e && e.name === 'AbortError') return; }
    }
    // Respaldo: descarga la imagen y abre WhatsApp con el resumen en texto
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    const tel = telDigits(cli.telefono);
    toast('Imagen descargada. Se abre WhatsApp con el resumen; adjunta la imagen.');
    window.open('https://wa.me/' + (tel || '') + '?text=' + encodeURIComponent(texto), '_blank', 'noopener');
  } catch (e) { fail(e); }
  finally { if (btn) btn.disabled = false; }
}

