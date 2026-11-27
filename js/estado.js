// Tarjeta digital del préstamo: se dibuja en un canvas y se envía al cliente (WhatsApp / compartir / descargar).
import { toast, fail, money, telDigits, hoyCO } from './lib.js';
import { S } from './state.js';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const fcorta = (iso) => { if (!iso) return ''; const [y, m, d] = String(iso).slice(0, 10).split('-'); return d + '/' + m + '/' + y.slice(2); };

// Filas: una por cuota; abono = lo pagado de esa cuota; saldo = lo que queda de la deuda total
export function filasEstado(pr, cuotas) {
  let resta = Number(pr.total_a_cobrar || 0);
  return cuotas.map((c) => {
    const ab = Number(c.valor_pagado || 0);
    resta -= ab;
    return { n: c.numero, fecha: c.fecha_programada, abono: ab, saldo: Math.max(resta, 0), pagada: c.estado === 'PAGADA' };
  });
}

export function dibujarTarjeta(pr, cli, cuotas) {
  const filas = filasEstado(pr, cuotas);
  const W = 900, PAD = 36, RH = 40, top = 430;
  const H = top + 70 + filas.length * RH + 130;
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
  const pagado = filas.reduce((a, f) => a + f.abono, 0);
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
  txt(pr.cuotas_pagadas + ' de ' + pr.numero_cuotas + ' cuotas pagadas', PAD, 410, { s: 20, w: '700', c: '#0f3d66' });

  // Tabla
  const cx = [PAD, PAD + 90, PAD + 330, PAD + 600];
  let y = top;
  g.fillStyle = '#eaf1f8'; g.fillRect(PAD - 8, y, W - 2 * PAD + 16, 46);
  txt('N.º', cx[0], y + 31, { s: 20, w: '800' }); txt('FECHA', cx[1], y + 31, { s: 20, w: '800' });
  txt('ABONO', cx[2], y + 31, { s: 20, w: '800' }); txt('SALDO', cx[3], y + 31, { s: 20, w: '800' });
  y += 46;
  filas.forEach((f, i) => {
    if (i % 2) { g.fillStyle = '#f7f9fc'; g.fillRect(PAD - 8, y, W - 2 * PAD + 16, RH); }
    txt(f.n, cx[0], y + 28, { s: 21, c: '#6b7787' });
    txt(fcorta(f.fecha), cx[1], y + 28, { s: 21 });
    txt(f.abono > 0 ? money(f.abono) : '—', cx[2], y + 28, { s: 21, w: f.abono > 0 ? '700' : '', c: f.abono > 0 ? '#12703a' : '#9aa5b4' });
    txt(money(f.saldo), cx[3], y + 28, { s: 21 });
    y += RH;
  });
  line(PAD - 8, y, W - PAD + 8, y, '#0f3d66', 2);
  y += 52;
  txt('SIN CANCELAR SU CRÉDITO NO HAY OTRO CRÉDITO', W / 2, y, { s: 21, w: '800', c: '#b42318', a: 'center' });
  txt('Generado el ' + fcorta(hoyCO()) + ' · Gracias por su pago puntual', W / 2, y + 36, { s: 16, c: '#6b7787', a: 'center' });
  return cv;
}

export function textoEstado(pr, cli, cuotas) {
  const filas = filasEstado(pr, cuotas);
  const pagado = filas.reduce((a, f) => a + f.abono, 0);
  const saldo = Math.max(Number(pr.total_a_cobrar || 0) - pagado, 0);
  const emp = S.cfg.EMPRESA_NOMBRE ? S.cfg.EMPRESA_NOMBRE + '\n' : '';
  return emp + 'Hola ' + (cli.nombre_completo || '').split(' ')[0] + ', este es el estado de su crédito:\n' +
    'Valor prestado: ' + money(pr.valor_prestado) + '\nTotal a pagar: ' + money(pr.total_a_cobrar) +
    '\nCuota: ' + money(pr.valor_cuota) + '\nPagado: ' + money(pagado) + '\nSaldo pendiente: ' + money(saldo) +
    '\nCuotas pagadas: ' + pr.cuotas_pagadas + ' de ' + pr.numero_cuotas;
}

export async function enviarEstado(pr, cli, cuotas, btn) {
  if (btn) btn.disabled = true;
  try {
    const cv = dibujarTarjeta(pr, cli, cuotas);
    const blob = await new Promise((ok) => cv.toBlob(ok, 'image/png'));
    if (!blob) throw new Error('No se pudo generar la imagen');
    const nombre = 'estado-' + String(cli.nombre_completo || 'cliente').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.png';
    const file = new File([blob], nombre, { type: 'image/png' });
    const texto = textoEstado(pr, cli, cuotas);
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
