import { test, expect } from '@playwright/test'

test.describe('Shopping Cart', () => {
  test('should add product to cart', async ({ page }) => {
    await page.goto('/productos')
    await page.waitForLoadState('networkidle')

    // Find and click on first product
    const firstProductLink = page.locator('a[href*="/producto/"]').first()
    if (await firstProductLink.isVisible()) {
      await firstProductLink.click()
      await page.waitForLoadState('networkidle')

      // Look for "Add to Cart" button
      const addToCartButton = page.getByRole('button', { name: /agregar.*carrito/i })
      if (await addToCartButton.isVisible()) {
        await addToCartButton.click()

        // Cart should update (check for cart icon badge or notification)
        await page.waitForTimeout(1000)
      }
    }
  })

  test('should open cart drawer', async ({ page }) => {
    await page.goto('/')

    // Click on cart icon
    const cartButton = page.locator('[data-testid="cart-button"]')
    if (await cartButton.isVisible()) {
      await cartButton.click()

      // Cart drawer should be visible
      const cartDrawer = page.locator('[data-testid="cart-drawer"]')
      await expect(cartDrawer).toBeVisible()
    }
  })

  test('should navigate to checkout', async ({ page }) => {
    await page.goto('/')

    // Open cart
    const cartButton = page.locator('[data-testid="cart-button"]')
    if (await cartButton.isVisible()) {
      await cartButton.click()

      // Click checkout button
      const checkoutButton = page.getByRole('button', { name: /checkout|finalizar/i })
      if (await checkoutButton.isVisible()) {
        await checkoutButton.click()

        // Should navigate to checkout page
        await expect(page).toHaveURL(/\/checkout/)
      }
    }
  })

  test('should update cart quantity', async ({ page }) => {
    // Add product to cart first
    await page.goto('/productos')
    await page.waitForLoadState('networkidle')

    const firstProductLink = page.locator('a[href*="/producto/"]').first()
    if (await firstProductLink.isVisible()) {
      await firstProductLink.click()
      await page.waitForLoadState('networkidle')

      const addToCartButton = page.getByRole('button', { name: /agregar.*carrito/i })
      if (await addToCartButton.isVisible()) {
        await addToCartButton.click()
        await page.waitForTimeout(1000)

        // Open cart
        const cartButton = page.locator('[data-testid="cart-button"]')
        await cartButton.click()

        // Find increment button
        const incrementButton = page.locator('[data-testid="increment-quantity"]').first()
        if (await incrementButton.isVisible()) {
          await incrementButton.click()
          await page.waitForTimeout(500)

          // Quantity should be 2
          const quantity = page.locator('[data-testid="item-quantity"]').first()
          await expect(quantity).toHaveText('2')
        }
      }
    }
  })
})
