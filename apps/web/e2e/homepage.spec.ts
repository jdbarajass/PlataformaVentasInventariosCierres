import { test, expect } from '@playwright/test'

test.describe('Homepage', () => {
  test('should load homepage successfully', async ({ page }) => {
    await page.goto('/')

    // Check that the page loads
    await expect(page).toHaveTitle(/YB MOTOCOM/)

    // Check for main navigation elements
    await expect(page.getByRole('navigation')).toBeVisible()
  })

  test('should display hero section', async ({ page }) => {
    await page.goto('/')

    // Hero section should be visible
    const heroSection = page.locator('section').first()
    await expect(heroSection).toBeVisible()
  })

  test('should navigate to products page', async ({ page }) => {
    await page.goto('/')

    // Click on products link (adjust selector based on your actual navigation)
    const productsLink = page.getByRole('link', { name: /productos/i })
    if (await productsLink.isVisible()) {
      await productsLink.click()
      await expect(page).toHaveURL(/\/productos/)
    }
  })

  test('should navigate to categories', async ({ page }) => {
    await page.goto('/')

    // Click on categories link
    const categoriesLink = page.getByRole('link', { name: /categorías/i })
    if (await categoriesLink.isVisible()) {
      await categoriesLink.click()
      await expect(page).toHaveURL(/\/categorias/)
    }
  })

  test('should have working footer links', async ({ page }) => {
    await page.goto('/')

    // Scroll to footer
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))

    // Check for footer presence
    const footer = page.locator('footer')
    await expect(footer).toBeVisible()

    // Check for common footer links
    await expect(footer.getByRole('link', { name: /contacto/i })).toBeVisible()
    await expect(footer.getByRole('link', { name: /privacidad/i })).toBeVisible()
  })
})
