// Test fixture for the product journeys (H2).
// Avatars come from DiceBear, a live service. Every product test context blocks
// it, so the pages show the initials fallback and no request leaves the machine.
import { test as base, expect } from '@playwright/test'

export const blockAvatars = (context) =>
  context.route('https://api.dicebear.com/**', (route) => route.abort())

export const test = base.extend({
  context: async ({ context }, use) => {
    await blockAvatars(context)
    await use(context)
  },
})

export { expect }
