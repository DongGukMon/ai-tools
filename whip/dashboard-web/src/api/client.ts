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

export type RemoteAuthMode = 'token' | 'device'

export type RemoteTokenConnectTarget = {
  mode: 'remote'
  credential: 'token'
  baseURL: string
  token: string
}

export type RemoteSessionConnectTarget = {
  mode: 'remote'
  credential: 'session'
  baseURL: string
  sessionId: string
  sessionSecret: string
}

export type RemoteBaseConnectTarget = {
  mode: 'remote'
  credential: 'none'
  baseURL: string
  authHint?: RemoteAuthMode
}

export type DevConnectTarget = { mode: 'dev' }

export type ConnectTarget =
  | RemoteTokenConnectTarget
  | RemoteSessionConnectTarget
  | RemoteBaseConnectTarget
  | DevConnectTarget

export type StoredConnectTarget =
  | RemoteTokenConnectTarget
  | RemoteSessionConnectTarget
  | DevConnectTarget

export interface AuthConfig {
  mode: RemoteAuthMode
  workspace: string
  challenge_ttl_seconds?: number
  session_ttl_seconds?: number
  session_refresh_ttl_seconds?: number
}

export interface AuthChallenge {
  challenge_id: string
  created_at: string
  expires_at: string
  device_label?: string
}

interface AuthExchangeResponse {
  session_id: string
  session_secret: string
}

export type TaskListMode = 'active' | 'archived'

export interface WhipClient {
  getPeers(signal?: AbortSignal): Promise<Peer[]>
  sendMessage(to: string, content: string): Promise<void>
  getInbox(name: string, all?: boolean, signal?: AbortSignal): Promise<Message[]>
  markRead(name: string): Promise<void>
  clearInbox(name: string): Promise<void>
  getMasterCapture(): Promise<{ content: string }>
  sendMasterKeys(keys: string): Promise<void>
  getMasterStatus(): Promise<{ session: string; alive: boolean }>
  getTasks(mode: TaskListMode, signal?: AbortSignal): Promise<Task[]>
  getTask(id: string): Promise<Task>
  ping(): Promise<boolean>
}

function normalizeBaseURL(raw: string): string {
  const url = new URL(raw)
  url.search = ''
  url.hash = ''
  return url.toString()
}

function remoteAuthHeader(target: RemoteTokenConnectTarget | RemoteSessionConnectTarget): string {
  if (target.credential === 'token') {
    return `Bearer ${target.token}`
  }
  return `WhipSession ${target.sessionId}.${target.sessionSecret}`
}

async function requestJSON<T>(
  baseURL: string,
  path: string,
  options?: RequestInit,
  authHeader?: string,
): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${baseURL.replace(/\/$/, '')}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader ? { Authorization: authHeader } : {}),
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

export class WhipAPIClient implements WhipClient {
  private target: RemoteTokenConnectTarget | RemoteSessionConnectTarget

  constructor(target: RemoteTokenConnectTarget | RemoteSessionConnectTarget) {
    this.target = {
      ...target,
      baseURL: normalizeBaseURL(target.baseURL),
    }
  }

  private request<T>(path: string, options?: RequestInit): Promise<T> {
    return requestJSON<T>(this.target.baseURL, path, options, remoteAuthHeader(this.target))
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

  async getTasks(mode: TaskListMode, signal?: AbortSignal): Promise<Task[]> {
    const params = mode === 'archived' ? '?archive=true' : ''
    return this.request<Task[]>(`/api/tasks${params}`, { signal })
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

export function isStoredConnectTarget(target: ConnectTarget): target is StoredConnectTarget {
  return target.mode === 'dev' || (target.mode === 'remote' && target.credential !== 'none')
}

export function createClient(target: StoredConnectTarget): WhipClient {
  if (target.mode === 'dev') {
    return new MockWhipClient()
  }
  return new WhipAPIClient(target)
}

export function buildConnectURL(baseURL: string, token: string): string {
  return `${normalizeBaseURL(baseURL)}#token=${encodeURIComponent(token)}`
}

export function buildDeviceConnectURL(baseURL: string): string {
  return `${normalizeBaseURL(baseURL)}#mode=device`
}

export function formatConnectTarget(target: ConnectTarget): string {
  if (target.mode === 'dev') {
    return 'dev'
  }
  if (target.credential === 'token') {
    return buildConnectURL(target.baseURL, target.token)
  }
  if (target.credential === 'session') {
    return buildDeviceConnectURL(target.baseURL)
  }
  if (target.authHint === 'device') {
    return buildDeviceConnectURL(target.baseURL)
  }
  return normalizeBaseURL(target.baseURL)
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
    const outerURL = new URL(input)
    const rawHash = outerURL.hash.slice(1)
    const raw = rawHash.startsWith('http://') || rawHash.startsWith('https://') ? rawHash : input
    const connectURL = new URL(raw)
    const hashParams = new URLSearchParams(connectURL.hash.startsWith('#') ? connectURL.hash.slice(1) : connectURL.hash)
    const token = hashParams.get('token') ?? connectURL.searchParams.get('token')
    if (token) {
      return {
        mode: 'remote',
        credential: 'token',
        baseURL: normalizeBaseURL(connectURL.toString()),
        token,
      }
    }

    const authHint = (hashParams.get('mode') ?? connectURL.searchParams.get('mode')) === 'device'
      ? 'device'
      : undefined

    return {
      mode: 'remote',
      credential: 'none',
      baseURL: normalizeBaseURL(connectURL.toString()),
      authHint,
    }
  } catch {
    return null
  }
}

export async function fetchAuthConfig(baseURL: string): Promise<AuthConfig> {
  return requestJSON<AuthConfig>(normalizeBaseURL(baseURL), '/api/auth/config')
}

export async function createAuthChallenge(baseURL: string, deviceLabel: string): Promise<AuthChallenge> {
  return requestJSON<AuthChallenge>(normalizeBaseURL(baseURL), '/api/auth/challenges', {
    method: 'POST',
    body: JSON.stringify({ device_label: deviceLabel }),
  })
}

export async function exchangeAuthChallenge(
  baseURL: string,
  challengeID: string,
  otp: string,
  deviceLabel: string,
): Promise<RemoteSessionConnectTarget> {
  const response = await requestJSON<AuthExchangeResponse>(normalizeBaseURL(baseURL), '/api/auth/exchange', {
    method: 'POST',
    body: JSON.stringify({
      challenge_id: challengeID,
      otp,
      device_label: deviceLabel,
    }),
  })

  return {
    mode: 'remote',
    credential: 'session',
    baseURL: normalizeBaseURL(baseURL),
    sessionId: response.session_id,
    sessionSecret: response.session_secret,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function coerceStoredConnectTarget(value: unknown): StoredConnectTarget | null {
  if (!isRecord(value)) {
    return null
  }

  if (value.mode === 'dev') {
    return { mode: 'dev' }
  }

  if (value.mode !== 'remote' || typeof value.baseURL !== 'string') {
    return null
  }

  const baseURL = (() => {
    try {
      return normalizeBaseURL(value.baseURL)
    } catch {
      return null
    }
  })()
  if (!baseURL) {
    return null
  }

  if (value.credential === 'session' && typeof value.sessionId === 'string' && typeof value.sessionSecret === 'string') {
    return {
      mode: 'remote',
      credential: 'session',
      baseURL,
      sessionId: value.sessionId,
      sessionSecret: value.sessionSecret,
    }
  }

  if (typeof value.token === 'string') {
    return {
      mode: 'remote',
      credential: 'token',
      baseURL,
      token: value.token,
    }
  }

  return null
}
