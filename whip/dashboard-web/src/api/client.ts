import type { Message, Peer, Task } from './types'
import { MockWhipClient } from './client.debug.ts'

export class AuthError extends Error {
  constructor() {
    super('Unauthorized')
    this.name = 'AuthError'
  }
}

export class ConnectionError extends Error {
  constructor() {
    super('Connection lost')
    this.name = 'ConnectionError'
  }
}

export type RemoteConnectTarget = { mode: 'remote'; baseURL: string; token: string }
export type DevConnectTarget = { mode: 'dev' }
export type ConnectTarget = RemoteConnectTarget | DevConnectTarget

export interface WhipClient {
  getPeers(signal?: AbortSignal): Promise<Peer[]>
  sendMessage(to: string, content: string): Promise<void>
  getInbox(name: string, all?: boolean, signal?: AbortSignal): Promise<Message[]>
  markRead(name: string): Promise<void>
  clearInbox(name: string): Promise<void>
  getMasterCapture(): Promise<{ content: string }>
  sendMasterKeys(keys: string): Promise<void>
  getMasterStatus(): Promise<{ session: string; alive: boolean }>
  getTasks(signal?: AbortSignal): Promise<Task[]>
  getTask(id: string): Promise<Task>
  ping(): Promise<boolean>
}

export class WhipAPIClient implements WhipClient {
  private baseURL: string
  private token: string

  constructor(baseURL: string, token: string) {
    this.baseURL = baseURL.replace(/\/$/, '')
    this.token = token
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    let response: Response
    try {
      response = await fetch(`${this.baseURL}${path}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
          ...options?.headers,
        },
      })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw err
      }
      throw new ConnectionError()
    }

    if (response.status === 401) {
      throw new AuthError()
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`HTTP ${response.status}: ${text}`)
    }

    return response.json() as Promise<T>
  }

  async getPeers(signal?: AbortSignal): Promise<Peer[]> {
    return this.request<Peer[]>('/api/peers', { signal })
  }

  async sendMessage(to: string, content: string): Promise<void> {
    const body = { from: 'user', to, content }
    await this.request<unknown>('/api/messages', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  }

  async getInbox(name: string, all?: boolean, signal?: AbortSignal): Promise<Message[]> {
    const params = all ? '?all=true' : ''
    return this.request<Message[]>(`/api/messages/${encodeURIComponent(name)}${params}`, { signal })
  }

  async markRead(name: string): Promise<void> {
    await this.request<unknown>(`/api/messages/${encodeURIComponent(name)}/read`, {
      method: 'POST',
    })
  }

  async clearInbox(name: string): Promise<void> {
    await this.request<unknown>(`/api/messages/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    })
  }

  async getMasterCapture(): Promise<{ content: string }> {
    return this.request<{ content: string }>('/api/master/capture')
  }

  async sendMasterKeys(keys: string): Promise<void> {
    await this.request<unknown>('/api/master/keys', {
      method: 'POST',
      body: JSON.stringify({ keys }),
    })
  }

  async getMasterStatus(): Promise<{ session: string; alive: boolean }> {
    return this.request<{ session: string; alive: boolean }>('/api/master/status')
  }

  async getTasks(signal?: AbortSignal): Promise<Task[]> {
    return this.request<Task[]>('/api/tasks', { signal })
  }

  async getTask(id: string): Promise<Task> {
    return this.request<Task>(`/api/tasks/${encodeURIComponent(id)}`)
  }

  async ping(): Promise<boolean> {
    try {
      await this.request<unknown>('/api/peers')
      return true
    } catch {
      return false
    }
  }
}

export function createClient(target: ConnectTarget): WhipClient {
  if (target.mode === 'dev') {
    return new MockWhipClient()
  }
  return new WhipAPIClient(target.baseURL, target.token)
}

export function buildConnectURL(baseURL: string, token: string): string {
  const normalizedBaseURL = baseURL.replace(/[?#].*$/, '')
  return `${normalizedBaseURL}#token=${encodeURIComponent(token)}`
}

export function formatConnectTarget(target: ConnectTarget): string {
  if (target.mode === 'dev') {
    return 'dev'
  }
  return buildConnectURL(target.baseURL, target.token)
}

function parseDevMode(raw: string): DevConnectTarget | null {
  const normalized = raw.trim().toLowerCase()
  if (normalized === 'dev' || normalized === '#dev' || normalized === 'mock' || normalized === 'demo') {
    return { mode: 'dev' }
  }

  try {
    const url = new URL(raw)
    const hashParams = new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : url.hash)
    const mode = hashParams.get('mode') ?? url.searchParams.get('mode')
    const devFlag = hashParams.get('dev') ?? url.searchParams.get('dev')
    if (mode === 'dev' || devFlag === '1' || devFlag === 'true') {
      return { mode: 'dev' }
    }
  } catch {
    return null
  }

  return null
}

export function parseConnectURL(input: string): ConnectTarget | null {
  const devTarget = parseDevMode(input)
  if (devTarget) {
    return devTarget
  }

  try {
    const url = new URL(input)
    const rawHash = url.hash.slice(1)
    const raw = rawHash.startsWith('http://') || rawHash.startsWith('https://') ? rawHash : input
    const connectURL = new URL(raw)
    const hashToken = new URLSearchParams(connectURL.hash.startsWith('#') ? connectURL.hash.slice(1) : connectURL.hash).get('token')
    const token = hashToken ?? connectURL.searchParams.get('token')
    if (!token) return null
    connectURL.search = ''
    connectURL.hash = ''
    return { mode: 'remote', baseURL: connectURL.toString(), token }
  } catch {
    return null
  }
}
