import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

const SUPABASE_URL  = 'https://hiyceghgbunqektkswcg.supabase.co'
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhpeWNlZ2hnYnVucWVrdGtzd2NnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNzU2NjIsImV4cCI6MjA5NTc1MTY2Mn0.t2ERNDgC-SEQzS75YBj3ZSolgLveZJAgr6cLaETM_iE'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON)

// ── Autenticación ─────────────────────────────────────────────

export async function registrar(nombre, email, password) {
  const { data, error } = await supabase.auth.signUp({
    email, password,
    options: { data: { nombre } }
  })
  return { usuario: data?.user ?? null, error }
}

export async function iniciarSesion(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  return { usuario: data?.user ?? null, sesion: data?.session ?? null, error }
}

export async function cerrarSesion() {
  return await supabase.auth.signOut()
}

export async function usuarioActual() {
  const { data } = await supabase.auth.getUser()
  return data?.user ?? null
}

export function onCambioAuth(callback) {
  supabase.auth.onAuthStateChange((_evento, sesion) => {
    callback(sesion?.user ?? null)
  })
}

// ── Perfil ────────────────────────────────────────────────────

export async function getPerfil() {
  const cuenta = await usuarioActual()
  if (!cuenta) return { data: null, error: 'No autenticado' }
  const { data, error } = await supabase
    .from('usuarios').select('*').eq('id', cuenta.id).single()
  return { data, error }
}

// ── Mascota ───────────────────────────────────────────────────

export async function getMascota() {
  const cuenta = await usuarioActual()
  if (!cuenta) return { data: null, error: 'No autenticado' }
  const { data, error } = await supabase
    .from('mascotas').select('*').eq('usuario_id', cuenta.id).single()
  return { data, error }
}

export async function renombrarMascota(nuevoNombre) {
  const cuenta = await usuarioActual()
  if (!cuenta) return { error: 'No autenticado' }
  const { data, error } = await supabase
    .from('mascotas').update({ nombre: nuevoNombre })
    .eq('usuario_id', cuenta.id).select().single()
  return { data, error }
}

// Suscripción realtime a cambios de la mascota (sprite automático vía trigger)
export function suscribirMascota(usuarioId, callback) {
  return supabase.channel('mascota-' + usuarioId)
    .on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'mascotas',
      filter: `usuario_id=eq.${usuarioId}`
    }, payload => callback(payload.new))
    .subscribe()
}

// ── Estado del dispositivo (Cofre + Arcade via MQTT) ──────────
// El broker MQTT envía datos al backend, que los escribe en esta tabla.
// La web hace subscribe via Supabase Realtime para ver actualizaciones en vivo.

export async function getEstadoDispositivo() {
  const cuenta = await usuarioActual()
  if (!cuenta) return { data: null, error: 'No autenticado' }
  const { data, error } = await supabase
    .from('estado_dispositivo').select('*').eq('usuario_id', cuenta.id).maybeSingle()
  return { data, error }
}

// Suscripción realtime al estado del dispositivo
export function suscribirEstadoDispositivo(usuarioId, callback) {
  return supabase.channel('dispositivo-' + usuarioId)
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'estado_dispositivo',
      filter: `usuario_id=eq.${usuarioId}`
    }, payload => callback(payload.new))
    .subscribe()
}

// Para pruebas manuales o demo: actualizar estado desde la web
export async function actualizarEstadoDispositivo(campos) {
  const cuenta = await usuarioActual()
  if (!cuenta) return { error: 'No autenticado' }
  const { data, error } = await supabase
    .from('estado_dispositivo')
    .upsert({
      usuario_id: cuenta.id,
      ...campos,
      ultima_actualizacion: new Date().toISOString()
    }, { onConflict: 'usuario_id' })
    .select().single()
  return { data, error }
}

// ── Sesiones en Supabase ──────────────────────────────────────

export async function getSesionesHoy() {
  const cuenta = await usuarioActual()
  if (!cuenta) return { data: [], error: null }
  const hoy = new Date().toISOString().split('T')[0]
  const { data, error } = await supabase
    .from('sesiones').select('*')
    .eq('usuario_id', cuenta.id)
    .gte('iniciada_en', hoy)
    .order('iniciada_en', { ascending: false })
  return { data: data ?? [], error }
}

export async function getHistorialSesiones(limite = 8) {
  const cuenta = await usuarioActual()
  if (!cuenta) return { data: [], error: null }
  const { data, error } = await supabase
    .from('sesiones').select('*')
    .eq('usuario_id', cuenta.id)
    .order('iniciada_en', { ascending: false })
    .limit(limite)
  return { data: data ?? [], error }
}

// ── Dashboard (Supabase) ──────────────────────────────────────

export async function getResumenDashboard() {
  const cuenta = await usuarioActual()
  if (!cuenta) return { data: null, error: 'No autenticado' }
  const { data, error } = await supabase
    .rpc('get_resumen_dashboard', { p_usuario_id: cuenta.id })
  return { data: data?.[0] ?? null, error }
}

export async function getEstadisticasSemana() {
  const cuenta = await usuarioActual()
  if (!cuenta) return { data: [], error: null }
  const desde = new Date()
  desde.setDate(desde.getDate() - 6)
  const { data, error } = await supabase
    .from('estadisticas_diarias')
    .select('fecha, total_sesiones, minutos_enfocados, meta_diaria_pct')
    .eq('usuario_id', cuenta.id)
    .gte('fecha', desde.toISOString().split('T')[0])
    .order('fecha', { ascending: true })
  return { data: data ?? [], error }
}

export async function getHeatmap() {
  const cuenta = await usuarioActual()
  if (!cuenta) return { data: [], error: null }
  const hace7dias = new Date()
  hace7dias.setDate(hace7dias.getDate() - 6)
  const { data, error } = await supabase
    .from('actividad_heatmap')
    .select('dia_semana, franja_hora, intensidad, sesiones_count')
    .eq('usuario_id', cuenta.id)
    .gte('fecha', hace7dias.toISOString().split('T')[0])
  return { data: data ?? [], error }
}

export async function getRacha() {
  const cuenta = await usuarioActual()
  if (!cuenta) return { data: null, error: null }
  const { data, error } = await supabase
    .from('rachas')
    .select('racha_actual, racha_maxima, ultimo_dia')
    .eq('usuario_id', cuenta.id).single()
  return { data, error }
}
