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

  // Alinear a la semana calendario actual (lunes → domingo), no a "últimos 7 días".
  // Así el índice 0 SIEMPRE es lunes real y el índice de "hoy" SIEMPRE corresponde
  // a la fecha real de hoy, sin importar qué día de la semana sea.
  const hoy = new Date()
  const dow = hoy.getDay() // 0=domingo..6=sábado
  const diffLunes = dow === 0 ? 6 : dow - 1
  const lunes = new Date(hoy)
  lunes.setDate(hoy.getDate() - diffLunes)
  const domingo = new Date(lunes)
  domingo.setDate(lunes.getDate() + 6)

  const { data, error } = await supabase
    .from('estadisticas_diarias')
    .select('fecha, total_sesiones, minutos_enfocados, meta_diaria_pct')
    .eq('usuario_id', cuenta.id)
    .gte('fecha', lunes.toISOString().split('T')[0])
    .lte('fecha', domingo.toISOString().split('T')[0])
    .order('fecha', { ascending: true })

  if (error) return { data: [], error }

  // Rellenar los 7 días de la semana (lunes a domingo) aunque no tengan registro,
  // para que la web nunca desalinee las etiquetas Lun..Dom con la fecha real.
  const porFecha = new Map((data ?? []).map(d => [d.fecha, d]))
  const semana = []
  for (let i = 0; i < 7; i++) {
    const f = new Date(lunes)
    f.setDate(lunes.getDate() + i)
    const fechaISO = f.toISOString().split('T')[0]
    const registro = porFecha.get(fechaISO)
    semana.push({
      fecha: fechaISO,
      total_sesiones: registro?.total_sesiones ?? 0,
      minutos_enfocados: registro?.minutos_enfocados ?? 0,
      meta_diaria_pct: registro?.meta_diaria_pct ?? 0
    })
  }
  return { data: semana, error: null }
}

// Últimos 30 días para el gráfico "Progreso de estudio"
// Devuelve [{ fecha, sesiones, minutos }, ...] en orden ascendente (más antiguo -> hoy)
export async function getProgreso30() {
  const cuenta = await usuarioActual()
  if (!cuenta) return { data: [], error: null }
  const desde = new Date()
  desde.setDate(desde.getDate() - 29)
  const { data, error } = await supabase
    .from('estadisticas_diarias')
    .select('fecha, total_sesiones, minutos_enfocados')
    .eq('usuario_id', cuenta.id)
    .gte('fecha', desde.toISOString().split('T')[0])
    .order('fecha', { ascending: true })

  if (error) return { data: [], error }

  // Rellenar días sin registro con 0, para que el gráfico siempre tenga 30 puntos
  const porFecha = new Map((data ?? []).map(d => [d.fecha, d]))
  const dias = []
  for (let i = 29; i >= 0; i--) {
    const f = new Date()
    f.setDate(f.getDate() - i)
    const fechaISO = f.toISOString().split('T')[0]
    const registro = porFecha.get(fechaISO)
    dias.push({
      fecha: fechaISO,
      sesiones: registro?.total_sesiones ?? 0,
      minutos: registro?.minutos_enfocados ?? 0
    })
  }
  return { data: dias, error: null }
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

// ── Misiones completadas (para el resumen del sidebar) ────────
export async function getMisionesCompletadas() {
  const cuenta = await usuarioActual()
  if (!cuenta) return { data: [], error: null }
  const { data, error } = await supabase
    .from('usuario_misiones')
    .select('completada_en, misiones(nombre, icono)')
    .eq('usuario_id', cuenta.id)
    .eq('completada', true)
    .order('completada_en', { ascending: false })
  return { data: data ?? [], error }
}
