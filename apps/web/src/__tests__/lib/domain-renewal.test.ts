import { describe, it, expect } from 'vitest'
import { diasParaRenovacion, debeAvisarRenovacion } from '@/lib/domain-renewal'

describe('aviso de renovación del dominio', () => {
  it('cuenta los días hasta la renovación de este año', () => {
    expect(diasParaRenovacion('2027-03-14', '03-19')).toBe(5)
    expect(diasParaRenovacion('2027-03-19', '03-19')).toBe(0)
  })

  it('pasada la fecha, cuenta hasta la del año siguiente', () => {
    expect(diasParaRenovacion('2027-03-20', '03-19')).toBe(365)
    expect(diasParaRenovacion('2026-11-26', '03-19')).toBe(113)
  })

  it('avisa solo desde 5 días antes hasta el día de la renovación', () => {
    expect(debeAvisarRenovacion('2027-03-13', '03-19')).toBe(false)
    expect(debeAvisarRenovacion('2027-03-14', '03-19')).toBe(true)
    expect(debeAvisarRenovacion('2027-03-19', '03-19')).toBe(true)
    expect(debeAvisarRenovacion('2027-03-20', '03-19')).toBe(false)
  })

  it('funciona al cruzar el año', () => {
    expect(diasParaRenovacion('2026-12-30', '01-02')).toBe(3)
  })
})
