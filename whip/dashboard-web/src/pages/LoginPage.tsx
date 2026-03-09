import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  type AuthChallenge,
  type ConnectTarget,
  type RemoteBaseConnectTarget,
  AuthError,
  ConnectionError,
  createAuthChallenge,
  createClient,
  exchangeAuthChallenge,
  fetchAuthConfig,
  formatConnectTarget,
  isStoredConnectTarget,
  parseConnectURL,
} from '../api/client'
import { Seo } from '../components/Seo'
import { clearAuth, getClient, loadAuth, saveAuth } from '../stores/auth'

interface Props {
  onLogin: () => void
}

interface PairingState {
  target: RemoteBaseConnectTarget
  challenge: AuthChallenge
  deviceLabel: string
}

function defaultDeviceLabel(): string {
  if (typeof navigator === 'undefined') {
    return 'browser'
  }
  return navigator.userAgent || 'browser'
}

export function LoginPage({ onLogin }: Props) {
  const [searchParams] = useSearchParams()
  const [url, setUrl] = useState('')
  const [otp, setOtp] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [pairing, setPairing] = useState<PairingState | null>(null)

  async function connectAuthenticatedTarget(target: ConnectTarget): Promise<boolean> {
    if (!isStoredConnectTarget(target)) {
      return false
    }

    const client = createClient(target)
    await client.getPeers()
    saveAuth(target)
    setPairing(null)
    setOtp('')
    onLogin()
    return true
  }

  async function beginPairing(target: RemoteBaseConnectTarget): Promise<void> {
    const authConfig = await fetchAuthConfig(target.baseURL)
    if (authConfig.mode !== 'device') {
      throw new Error('This server is in token mode. Use the tokenized connect URL instead.')
    }

    const deviceLabel = defaultDeviceLabel()
    const challenge = await createAuthChallenge(target.baseURL, deviceLabel)
    setPairing({
      target: {
        ...target,
        authHint: 'device',
      },
      challenge,
      deviceLabel,
    })
    setOtp('')
    setUrl(formatConnectTarget({
      ...target,
      authHint: 'device',
    }))
  }

  async function connectTarget(target: ConnectTarget): Promise<boolean> {
    if (target.mode === 'remote' && target.credential === 'none') {
      await beginPairing(target)
      return false
    }
    return connectAuthenticatedTarget(target)
  }

  useEffect(() => {
    let active = true

    const autoConnect = async () => {
      try {
        const urlParam = searchParams.get('url')
        if (urlParam) {
          if (!active) return
          setUrl(urlParam)
          window.history.replaceState({}, '', window.location.pathname)
          const parsed = parseConnectURL(urlParam)
          if (parsed) {
            try {
              await connectTarget(parsed)
              if (!active) return
              setChecking(false)
              return
            } catch (err) {
              if (!active) return
              if (err instanceof ConnectionError) {
                setError('Cannot connect to server')
              } else if (err instanceof AuthError) {
                setError('Invalid credentials')
              } else if (err instanceof Error) {
                setError(err.message)
              } else {
                setError('Cannot connect to server')
              }
            }
          }
        }

        const client = getClient()
        const auth = loadAuth()
        if (!client || !auth) {
          if (active) {
            setChecking(false)
          }
          return
        }

        try {
          await client.getPeers()
          if (!active) return
          onLogin()
          return
        } catch (err) {
          if (!active) return
          setUrl(formatConnectTarget(auth))
          if (err instanceof ConnectionError) {
            setError('Cannot connect to server')
          } else {
            clearAuth()
          }
        }

        if (active) {
          setChecking(false)
        }
      } finally {
        if (active) {
          setChecking(false)
        }
      }
    }

    void autoConnect()
    return () => {
      active = false
    }
  }, [onLogin, searchParams])

  const handleConnect = async (e: { preventDefault: () => void }) => {
    e.preventDefault()
    setError('')
    setPairing(null)
    setOtp('')

    const parsed = parseConnectURL(url.trim())
    if (!parsed) {
      setError('Invalid URL format. Expected a connect URL, base URL, or dev')
      return
    }

    setLoading(true)
    try {
      const connected = await connectTarget(parsed)
      if (!connected && parsed.mode === 'remote' && parsed.credential === 'none') {
        setError('')
      }
    } catch (err) {
      if (err instanceof AuthError) {
        setError('Invalid credentials')
      } else if (err instanceof ConnectionError) {
        setError('Cannot connect to server')
      } else if (err instanceof Error) {
        setError(err.message)
      } else {
        setError('Cannot connect to server')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleOTPSubmit = async (e: { preventDefault: () => void }) => {
    e.preventDefault()
    if (!pairing) {
      return
    }
    if (!otp.trim()) {
      setError('Enter the OTP shown in the terminal')
      return
    }

    setLoading(true)
    setError('')
    try {
      const sessionTarget = await exchangeAuthChallenge(
        pairing.target.baseURL,
        pairing.challenge.challenge_id,
        otp.trim(),
        pairing.deviceLabel,
      )
      const client = createClient(sessionTarget)
      await client.getPeers()
      saveAuth(sessionTarget)
      setPairing(null)
      setOtp('')
      onLogin()
    } catch (err) {
      if (err instanceof AuthError) {
        setPairing(null)
        setOtp('')
        setError('OTP was invalid or expired. Start pairing again.')
      } else if (err instanceof ConnectionError) {
        setError('Cannot connect to server')
      } else {
        setError('Cannot complete device pairing')
      }
    } finally {
      setLoading(false)
    }
  }

  if (checking) {
    return (
      <>
        <Seo title="Connect to whip dashboard" description="Connect to a running whip remote session." path="/login" noindex />
        <div className="flex items-center justify-center min-h-[60vh]">
          <svg className="animate-spin h-6 w-6 text-[#8B5CF6]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      </>
    )
  }

  return (
    <>
      <Seo title="Connect to whip dashboard" description="Connect to a running whip remote session." path="/login" noindex />
      <div className="flex items-center justify-center min-h-[60vh] px-4">
        <div className="w-full max-w-sm p-8 rounded-xl bg-white dark:bg-[#1E293B] border border-gray-200 dark:border-slate-700 shadow-sm">
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-1">
              <span className="bg-[#8B5CF6] text-white text-xs font-bold px-2 py-0.5 rounded">whip</span>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Connect to your orchestrator</p>
          </div>

          <form onSubmit={handleConnect}>
            <div className="mb-4">
              <label htmlFor="connect-url" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Connect URL
              </label>
              <input
                id="connect-url"
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://xxx.trycloudflare.com#token=abc123 or https://xxx.trycloudflare.com#mode=device"
                disabled={loading}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 text-sm placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-[#8B5CF6] focus:border-transparent transition-colors disabled:opacity-60"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !url.trim()}
              className="w-full py-2 px-4 bg-[#8B5CF6] hover:bg-[#7C3AED] text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Connecting...
                </>
              ) : 'Connect'}
            </button>
          </form>

          {pairing && (
            <form onSubmit={handleOTPSubmit} className="mt-6 border-t border-gray-200 dark:border-slate-700 pt-4">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Enter the OTP shown in the terminal for this device pairing request.
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Expires at {new Date(pairing.challenge.expires_at).toLocaleTimeString()}
              </p>
              <div className="mt-4">
                <label htmlFor="pairing-otp" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  One-time password
                </label>
                <input
                  id="pairing-otp"
                  type="text"
                  inputMode="numeric"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="123456"
                  disabled={loading}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 text-sm placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-[#8B5CF6] focus:border-transparent transition-colors disabled:opacity-60"
                />
              </div>
              <button
                type="submit"
                disabled={loading || !otp.trim()}
                className="mt-4 w-full py-2 px-4 bg-slate-900 hover:bg-slate-700 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Pair device
              </button>
            </form>
          )}

          {error && (
            <p className="mt-4 text-sm text-red-500">{error}</p>
          )}
        </div>
      </div>
    </>
  )
}
