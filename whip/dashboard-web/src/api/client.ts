import type { Message, Peer, Task, Topic } from './types'

export class AuthError extends Error {
  constructor() {
    super('Unauthorized')
    this.name = 'AuthError'
  }
}

export class WhipAPIClient {
  private baseURL: string
  private token: string

  constructor(baseURL: string, token: string) {
    this.baseURL = baseURL.replace(/\/$/, '')
    this.token = token
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseURL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token}`,
        ...options?.headers,
      },
    })

    if (response.status === 401) {
      throw new AuthError()
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`HTTP ${response.status}: ${text}`)
    }

    return response.json() as Promise<T>
  }

  // IRC

  async getPeers(): Promise<Peer[]> {
    return this.request<Peer[]>('/api/peers')
  }

  async sendMessage(to: string, content: string): Promise<void> {
    const body = {
      from: 'user',
      to,
      content: `${content}\n\n---\n[From web dashboard. Reply via: claude-irc msg user "..."]`,
    }
    await this.request<unknown>('/api/messages', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  }

  async getInbox(name: string, all?: boolean): Promise<Message[]> {
    const params = all ? '?all=true' : ''
    return this.request<Message[]>(`/api/inbox/${encodeURIComponent(name)}${params}`)
  }

  async markRead(name: string): Promise<void> {
    await this.request<unknown>(`/api/inbox/${encodeURIComponent(name)}/read`, {
      method: 'POST',
    })
  }

  async clearInbox(name: string): Promise<void> {
    await this.request<unknown>(`/api/inbox/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    })
  }

  async getTopics(name: string): Promise<Topic[]> {
    return this.request<Topic[]>(`/api/topics/${encodeURIComponent(name)}`)
  }

  async getTopic(name: string, index: number): Promise<Topic> {
    return this.request<Topic>(`/api/topics/${encodeURIComponent(name)}/${index}`)
  }

  // Tasks

  async getTasks(): Promise<Task[]> {
    return this.request<Task[]>('/api/tasks')
  }

  async getTask(id: string): Promise<Task> {
    return this.request<Task>(`/api/tasks/${encodeURIComponent(id)}`)
  }

  // Health check

  async ping(): Promise<boolean> {
    try {
      await this.request<unknown>('/api/peers')
      return true
    } catch {
      return false
    }
  }
}

export function parseConnectURL(input: string): { baseURL: string; token: string } | null {
  try {
    const url = new URL(input)
    const token = url.searchParams.get('token')
    if (!token) return null
    url.search = ''
    return { baseURL: url.toString(), token }
  } catch {
    return null
  }
}
