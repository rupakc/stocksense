import { request } from '@playwright/test'

const AUTH_FILE = 'e2e/.auth-token.json'

async function globalSetup() {
  const ctx = await request.newContext({ baseURL: 'http://localhost:8000' })
  try {
    const resp = await ctx.post('/api/auth/login', {
      data: { username: 'stocker', password: 'stockmulti@123' },
    })
    if (!resp.ok()) {
      console.warn(`Login returned ${resp.status()} — tests will attempt to use existing auth`)
      return
    }
    const { access_token } = await resp.json()
    const fs = await import('fs')
    fs.writeFileSync(AUTH_FILE, JSON.stringify({ token: access_token, username: 'stocker' }))
  } finally {
    await ctx.dispose()
  }
}

export default globalSetup
