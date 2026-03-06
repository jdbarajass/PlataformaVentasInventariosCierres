import { test, expect } from '@playwright/test'

test.describe('Public Information Pages', () => {
  test('should load FAQ page', async ({ page }) => {
    await page.goto('/faq')

    await expect(page).toHaveTitle(/FAQ.*YJBMOTOCOM/)
    await expect(page.locator('h1')).toContainText(/preguntas frecuentes/i)

    // Check for accordion items
    const accordionItems = page.locator('[data-radix-collection-item]')
    const count = await accordionItems.count()
    expect(count).toBeGreaterThan(0)
  })

  test('should load Privacy Policy page', async ({ page }) => {
    await page.goto('/privacidad')

    await expect(page).toHaveTitle(/Privacidad.*YJBMOTOCOM/)
    await expect(page.locator('h1')).toContainText(/política de privacidad/i)

    // Check for privacy content
    await expect(page.getByText(/protección de datos/i)).toBeVisible()
  })

  test('should load Terms page', async ({ page }) => {
    await page.goto('/terminos')

    await expect(page).toHaveTitle(/Términos.*YJBMOTOCOM/)
    await expect(page.locator('h1')).toContainText(/términos y condiciones/i)
  })

  test('should load Shipping page', async ({ page }) => {
    await page.goto('/envios')

    await expect(page).toHaveTitle(/Envíos.*YJBMOTOCOM/)
    await expect(page.locator('h1')).toContainText(/envíos/i)

    // Check for shipping information
    await expect(page.getByText(/colombia/i)).toBeVisible()
  })

  test('should load Returns page', async ({ page }) => {
    await page.goto('/devoluciones')

    await expect(page).toHaveTitle(/Devoluciones.*YJBMOTOCOM/)
    await expect(page.locator('h1')).toContainText(/devoluciones/i)

    // Check for returns policy
    await expect(page.getByText(/garantía/i)).toBeVisible()
  })

  test('should load Contact page', async ({ page }) => {
    await page.goto('/contacto')

    await expect(page).toHaveTitle(/Contacto.*YJBMOTOCOM/)

    // Check for contact information
    await expect(page.getByText(/321 411 1371/i)).toBeVisible()
    await expect(page.getByText(/yjbmotocom@gmail.com/i)).toBeVisible()
  })

  test('should expand FAQ accordion items', async ({ page }) => {
    await page.goto('/faq')

    // Find first accordion trigger
    const firstAccordion = page.locator('[data-radix-collection-item]').first()
    const trigger = firstAccordion.locator('[data-state]')

    if (await trigger.isVisible()) {
      // Should be collapsed initially
      const initialState = await trigger.getAttribute('data-state')
      expect(initialState).toBe('closed')

      // Click to expand
      await trigger.click()
      await page.waitForTimeout(300)

      // Should be expanded
      const expandedState = await trigger.getAttribute('data-state')
      expect(expandedState).toBe('open')
    }
  })
})
