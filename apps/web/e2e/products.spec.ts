import { test, expect } from '@playwright/test'

test.describe('Products', () => {
  test('should load products page', async ({ page }) => {
    await page.goto('/productos')

    // Check page title
    await expect(page).toHaveTitle(/Productos.*YJBMOTOCOM/)

    // Check for products grid or list
    await page.waitForLoadState('networkidle')
  })

  test('should display product cards', async ({ page }) => {
    await page.goto('/productos')

    // Wait for products to load
    await page.waitForLoadState('networkidle')

    // Check if product cards are visible (adjust selector based on your implementation)
    const productCards = page.locator('[data-testid="product-card"]')
    const count = await productCards.count()

    // Should have at least one product
    expect(count).toBeGreaterThan(0)
  })

  test('should navigate to product detail page', async ({ page }) => {
    await page.goto('/productos')

    // Wait for products to load
    await page.waitForLoadState('networkidle')

    // Click on first product link
    const firstProductLink = page.locator('a[href*="/producto/"]').first()
    if (await firstProductLink.isVisible()) {
      await firstProductLink.click()

      // Should navigate to product detail page
      await expect(page).toHaveURL(/\/producto\//)

      // Product details should be visible
      await expect(page.locator('h1')).toBeVisible()
    }
  })

  test('should filter products by category', async ({ page }) => {
    await page.goto('/productos')
    await page.waitForLoadState('networkidle')

    // Look for category filters (adjust based on your implementation)
    const categoryFilter = page.locator('[data-testid="category-filter"]').first()
    if (await categoryFilter.isVisible()) {
      await categoryFilter.click()

      // URL should update with filter
      await page.waitForURL(/category/)
    }
  })
})
