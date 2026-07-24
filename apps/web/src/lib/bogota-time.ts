// Colombia no tiene horario de verano — UTC-5 todo el año, así que el
// desfase es siempre fijo. Estos helpers usan explícitamente
// 'America/Bogota' en vez de confiar en la zona horaria del sistema
// operativo del navegador, para evitar el bug histórico del software local
// donde la hora mostrada no siempre coincidía con la hora real de Colombia
// (dependía de la configuración del equipo). Usado por Préstamos y
// Registrar Venta — ver docs/UNIFICACION_YJBMOTOCOM.md secciones 24 y 28.

export const BOGOTA_TZ = 'America/Bogota'

export function bogotaDateStr(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: BOGOTA_TZ }).format(d)
}

export function bogotaTimeStr(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BOGOTA_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const hh = parts.find((p) => p.type === 'hour')?.value ?? '00'
  const mm = parts.find((p) => p.type === 'minute')?.value ?? '00'
  return `${hh}:${mm}`
}

// Combina una fecha (YYYY-MM-DD) y hora (HH:MM) locales de Bogotá en el
// instante UTC correcto, sin depender de la zona horaria del navegador.
export function bogotaToISO(dateStr: string, timeStr: string): string {
  return new Date(`${dateStr}T${timeStr}:00-05:00`).toISOString()
}

// Hora (0-23) de un timestamp ISO, en zona horaria de Bogotá — para agrupar
// por franja horaria (ej. "horas pico") sin depender de Date.getHours(),
// que usa la zona horaria del dispositivo/servidor donde corre el código.
export function bogotaHour(iso: string): number {
  const h = new Intl.DateTimeFormat('en-US', { timeZone: BOGOTA_TZ, hour: '2-digit', hour12: false }).format(new Date(iso))
  return parseInt(h, 10) % 24
}

// Formatea la hora (HH:MM a. m./p. m.) de un timestamp ISO en hora de
// Bogotá, para mostrar "a qué hora se vendió/registró algo" de forma
// consistente sin importar la zona horaria del dispositivo o del servidor
// (las funciones API corren en Vercel, normalmente en UTC).
export function formatBogotaTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-CO', { timeZone: BOGOTA_TZ, hour: '2-digit', minute: '2-digit' })
}

// Límites UTC (ISO) del día de Bogotá `dateStr` (YYYY-MM-DD), pensados para
// filtrar TIMESTAMPTZ con `.gte(from).lt(to)` (límite superior EXCLUSIVO).
//
// Bug que corrige: construir el filtro como `${dateStr}T00:00:00` /
// `${dateStr}T23:59:59` (sin offset) y mandarlo tal cual a PostgREST hace
// que Postgres lo interprete en la zona horaria de la SESIÓN del servidor
// (UTC en Supabase por defecto), no en hora de Bogotá. Como Bogotá es
// UTC-5, esa ventana queda corrida 5 horas hacia atrás: se cuelan las
// últimas 5 horas del día ANTERIOR de Bogotá (7pm-medianoche) y se pierden
// las últimas 5 horas del día pedido (que terminan cayendo en la consulta
// del día siguiente). Con `bogotaToISO` el offset -05:00 va explícito en el
// string, así que Postgres ya no tiene que adivinar la zona horaria.
export function bogotaDayRange(dateStr: string): { from: string; to: string } {
  const from = bogotaToISO(dateStr, '00:00')
  const next = new Date(`${dateStr}T00:00:00-05:00`)
  next.setUTCDate(next.getUTCDate() + 1)
  const to = next.toISOString()
  return { from, to }
}
