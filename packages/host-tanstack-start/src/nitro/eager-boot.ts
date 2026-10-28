import { definePlugin } from 'nitro'

// Boot the app at process start rather than on the first request, by fetching
// the status route once. Spike version of apps/gradebook/src/nitro/eager-boot.ts.
export default definePlugin((nitroApp) => {
  setImmediate(async () => {
    try {
      const response = await nitroApp.fetch(new Request('http://localhost/routes/spike-status'))
      console.log(`modulus eager boot: ${response.status} ${await response.text()}`)
    } catch (error) {
      console.error('modulus eager boot failed:', error)
    }
  })
})
