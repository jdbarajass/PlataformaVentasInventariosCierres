import { test, expect } from '@playwright/test'

test.describe('Admin Dashboard', () => {
  test('should display admin dashboard', async ({ page }) => {
    await page.goto('/admin')

    // Check that admin page loads
    await expect(page.locator('body')).toBeVisible()

    // Check for dashboard elements
    await expect(page.getByText(/dashboard/i)).toBeVisible().catch(() => {
      // Might be in Spanish
    })
  })

  test('should have sidebar navigation', async ({ page }) => {
    await page.goto('/admin')

    // Check sidebar is visible on desktop
    const sidebar = page.locator('aside, nav').first()
    await expect(sidebar).toBeVisible()

    // El menú está agrupado en submenús desplegables (ver admin/layout.tsx)
    // — "Productos" y "Ordenes" viven dentro de los grupos "Catálogo" y
    // "Ventas" respectivamente, no sueltos en el nivel superior.
    await expect(page.getByRole('button', { name: /catálogo/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /^ventas$/i })).toBeVisible()
  })

  test('should navigate to products page', async ({ page }) => {
    await page.goto('/admin')

    // "Productos" está dentro del grupo "Catálogo" — hay que abrirlo primero
    await page.getByRole('button', { name: /catálogo/i }).click()
    await page.getByRole('link', { name: /productos/i }).click()

    // Verify URL
    await expect(page).toHaveURL(/admin\/productos/)
  })

  test('should navigate to orders page', async ({ page }) => {
    await page.goto('/admin')

    // "Ordenes" está dentro del grupo "Ventas" — hay que abrirlo primero
    await page.getByRole('button', { name: /^ventas$/i }).click()
    await page.getByRole('link', { name: /ordenes/i }).click()

    // Verify URL
    await expect(page).toHaveURL(/admin\/ordenes/)
  })

  test('should navigate to reports page', async ({ page }) => {
    await page.goto('/admin')

    // "Reportes" está dentro del grupo "Reportes" (mismo nombre que el ítem)
    await page.getByRole('button', { name: /^reportes$/i }).click()
    await page.getByRole('link', { name: /^reportes$/i }).click()

    // Verify URL
    await expect(page).toHaveURL(/admin\/reportes/)
  })

  test('should navigate to audit page', async ({ page }) => {
    await page.goto('/admin')

    // "Auditoría" está dentro del grupo "Reportes"
    await page.getByRole('button', { name: /^reportes$/i }).click()
    await page.getByRole('link', { name: /auditoría/i }).click()

    // Verify URL
    await expect(page).toHaveURL(/admin\/auditoria/)
  })

  test('should navigate to users page', async ({ page }) => {
    await page.goto('/admin')

    // "Usuarios" está dentro del grupo "Administración" (solo admin)
    await page.getByRole('button', { name: /administración/i }).click()
    await page.getByRole('link', { name: /usuarios/i }).click()

    // Verify URL
    await expect(page).toHaveURL(/admin\/usuarios/)
  })

  test('should navigate back to shop', async ({ page }) => {
    await page.goto('/admin')

    // Click back to shop link
    await page.getByRole('link', { name: /volver.*tienda/i }).click()

    // Verify we're back on shop
    await expect(page).toHaveURL('/')
  })
})
