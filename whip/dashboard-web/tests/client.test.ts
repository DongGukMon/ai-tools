import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildConnectURL,
  buildDeviceConnectURL,
  coerceStoredConnectTarget,
  createClient,
  formatConnectTarget,
  parseConnectURL,
} from '../src/api/client.ts'
import { clearAuth, loadAuth, saveAuth } from '../src/stores/auth.ts'

interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

function installLocalStorage(): StorageLike {
  const store = new Map<string, string>()
  const localStorage: StorageLike = {
    getItem(key: string) {
      return store.has(key) ? store.get(key) ?? null : null
    },
    setItem(key: string, value: string) {
      store.set(key, value)
    },
    removeItem(key: string) {
      store.delete(key)
    },
  }

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: localStorage,
  })

  return localStorage
}

test('buildConnectURL uses a fragment token', () => {
  assert.equal(buildConnectURL('https://public.example', 'abc123'), 'https://public.example/#token=abc123')
})

test('buildDeviceConnectURL uses a fragment mode', () => {
  assert.equal(buildDeviceConnectURL('https://public.example'), 'https://public.example/#mode=device')
})

test('parseConnectURL accepts fragment-style token connect URLs', () => {
  assert.deepEqual(parseConnectURL('https://public.example#token=abc123'), {
    mode: 'remote',
    credential: 'token',
    baseURL: 'https://public.example/',
    token: 'abc123',
  })
})

test('parseConnectURL accepts dashboard URLs that carry a token connect URL', () => {
  assert.deepEqual(parseConnectURL('https://whip.bang9.dev#https://public.example#token=abc123'), {
    mode: 'remote',
    credential: 'token',
    baseURL: 'https://public.example/',
    token: 'abc123',
  })
})

test('parseConnectURL keeps legacy query-token URLs working', () => {
  assert.deepEqual(parseConnectURL('https://public.example?token=abc123'), {
    mode: 'remote',
    credential: 'token',
    baseURL: 'https://public.example/',
    token: 'abc123',
  })
})

test('parseConnectURL accepts base URLs for auth-mode discovery', () => {
  assert.deepEqual(parseConnectURL('https://public.example'), {
    mode: 'remote',
    credential: 'none',
    baseURL: 'https://public.example/',
    authHint: undefined,
  })
})

test('parseConnectURL accepts device-mode connect URLs', () => {
  assert.deepEqual(parseConnectURL('https://public.example#mode=device'), {
    mode: 'remote',
    credential: 'none',
    baseURL: 'https://public.example/',
    authHint: 'device',
  })
})

test('parseConnectURL accepts dev mode', () => {
  assert.deepEqual(parseConnectURL('dev'), {
    mode: 'dev',
  })
})

test('formatConnectTarget does not expose stored session secrets', () => {
  assert.equal(formatConnectTarget({
    mode: 'remote',
    credential: 'session',
    baseURL: 'https://public.example/',
    sessionId: 'sess-123',
    sessionSecret: 'secret-456',
  }), 'https://public.example/#mode=device')
})

test('WhipAPIClient uses Bearer auth for token targets', async () => {
  let authHeader = ''
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (_input, init) => {
    authHeader = new Headers(init?.headers).get('Authorization') ?? ''
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as typeof fetch

  try {
    const client = createClient({
      mode: 'remote',
      credential: 'token',
      baseURL: 'https://public.example/',
      token: 'abc123',
    })
    await client.getPeers()
  } finally {
    globalThis.fetch = originalFetch
  }

  assert.equal(authHeader, 'Bearer abc123')
})

test('WhipAPIClient uses WhipSession auth for session targets', async () => {
  let authHeader = ''
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (_input, init) => {
    authHeader = new Headers(init?.headers).get('Authorization') ?? ''
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as typeof fetch

  try {
    const client = createClient({
      mode: 'remote',
      credential: 'session',
      baseURL: 'https://public.example/',
      sessionId: 'sess-123',
      sessionSecret: 'secret-456',
    })
    await client.getPeers()
  } finally {
    globalThis.fetch = originalFetch
  }

  assert.equal(authHeader, 'WhipSession sess-123.secret-456')
})

test('auth store persists and restores device sessions', () => {
  installLocalStorage()
  clearAuth()

  saveAuth({
    mode: 'remote',
    credential: 'session',
    baseURL: 'https://public.example/',
    sessionId: 'sess-123',
    sessionSecret: 'secret-456',
  })

  assert.deepEqual(loadAuth(), {
    mode: 'remote',
    credential: 'session',
    baseURL: 'https://public.example/',
    sessionId: 'sess-123',
    sessionSecret: 'secret-456',
  })
})

test('coerceStoredConnectTarget upgrades legacy saved token auth', () => {
  assert.deepEqual(coerceStoredConnectTarget({
    mode: 'remote',
    baseURL: 'https://public.example/',
    token: 'abc123',
  }), {
    mode: 'remote',
    credential: 'token',
    baseURL: 'https://public.example/',
    token: 'abc123',
  })
})
