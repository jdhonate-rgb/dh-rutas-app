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
export const nombreDe = (id) => { const p = S.profiles.find((x) => x.id === id); return p ? p.nombre : ''; };
export const cfgNum = (k, d = 0) => (S.cfg[k] != null && S.cfg[k] !== '' ? Number(S.cfg[k]) : d);

// Datos de apoyo que casi todas las pantallas necesitan
export async function cargarApoyo() {
  const [cfg, profiles, rutas] = await Promise.all([
    q(sb.from('configuracion').select('clave,valor')),
    q(sb.from('profiles').select('id,nombre,email,telefono,rol,estado,ver_cuentas,cuenta_recaudo_id')),
    q(sb.from('rutas').select('id,nombre,zona,descripcion,cobrador_id,estado').order('nombre'))
  ]);
  S.cfg = Object.fromEntries(cfg.map((r) => [r.clave, r.valor]));
  S.profiles = profiles;
  S.rutas = rutas;
  try { S.cuentas = await q(sb.from('cuentas').select('id,codigo,nombre,tipo,activa').eq('activa', true).order('nombre')); }
  catch { S.cuentas = []; }
}
