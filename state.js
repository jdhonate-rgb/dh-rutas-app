import { CONFIG } from './config.js';

export const S = { profile: null, cfg: {}, profiles: [], cuentas: [], rutas: [] };

export const sb = window.supabase.createClient(CONFIG.url, CONFIG.key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
});

// Devuelve los datos o lanza el error de Supabase (los mensajes de las funciones ya vienen en español)
export async function q(p) {
  const { data, error } = await p;
  if (error) throw error;
  return data;
}

export const isStaff = () => ['ADMINISTRADOR', 'SUPERVISOR'].includes(S.profile && S.profile.rol);
export const isAdmin = () => !!S.profile && S.profile.rol === 'ADMINISTRADOR';
export const esCob = (p) => p.rol === 'COBRADOR' || !!p.es_cobrador;   // cobrador, o supervisor que también cobra su ruta
export const nombreDe = (id) => { const p = S.profiles.find((x) => x.id === id); return p ? p.nombre : ''; };
export const cfgNum = (k, d = 0) => (S.cfg[k] != null && S.cfg[k] !== '' ? Number(S.cfg[k]) : d);

// Datos de apoyo que casi todas las pantallas necesitan
export async function cargarApoyo() {
  const [cfg, profiles, rutas] = await Promise.all([
    q(sb.from('configuracion').select('clave,valor')),
    q(sb.from('profiles').select('id,nombre,email,telefono,rol,estado,ver_cuentas,cuenta_recaudo_id,cuentas_permitidas,puede_desembolsar,puede_crear_prestamos,puede_auditar,puede_abrir_cajas,puede_ver_resumen,puede_registrar_gastos,puede_crear_clientes,papeleria_editable,es_cobrador,ruta_solo_propia')),
    q(sb.from('rutas').select('id,nombre,zona,descripcion,cobrador_id,estado').order('nombre'))
  ]);
  S.cfg = Object.fromEntries(cfg.map((r) => [r.clave, r.valor]));
  S.profiles = profiles;
  S.rutas = rutas;
  try {
    S.cuentas = isStaff() || (S.profile && S.profile.ver_cuentas)
      ? await q(sb.from('cuentas').select('id,codigo,nombre,tipo,activa').eq('activa', true).order('nombre'))
      : await q(sb.rpc('mis_cuentas_cobro'));   // cobrador sin permiso de cuentas: solo su cuenta de recaudo
  } catch { S.cuentas = []; }
  // cuentas en las que este usuario puede registrar cobros (y desembolsos, si es dueño): las que el administrador le habilitó
  try {
    S.cuentasCobro = isStaff()
      ? S.cuentas.filter((c) => c.tipo !== 'EFECTIVO' && c.tipo !== 'PAPELERIA')
      : (await q(sb.rpc('mis_cuentas_cobro'))).map((c) => ({ ...c, activa: true }));
  } catch { S.cuentasCobro = []; }
}
