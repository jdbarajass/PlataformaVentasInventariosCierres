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
