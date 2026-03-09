import type { Analytics } from 'firebase/analytics'
import { siteMeta } from '../content/site'

const firebaseConfig = {
  apiKey: 'AIzaSyArT5vhfAJl5EeYAUrrXwagnie5XJAAJBc',
  authDomain: 'ai-tools-bang9.firebaseapp.com',
  projectId: 'ai-tools-bang9',
  storageBucket: 'ai-tools-bang9.firebasestorage.app',
  messagingSenderId: '955089984529',
  appId: '1:955089984529:web:8fe5a5f544d14517a2e5b0',
  measurementId: 'G-B9MXN0FTLD',
}

interface AnalyticsClient {
  analytics: Analytics
  logEvent: (analytics: Analytics, eventName: string, eventParams?: Record<string, unknown>) => void
}

const localHosts = new Set(['localhost', '127.0.0.1'])
let analyticsClientPromise: Promise<AnalyticsClient | null> | null = null

function shouldDisableAnalytics() {
  if (typeof window === 'undefined') return true
  if (localHosts.has(window.location.hostname)) return true
  if (navigator.doNotTrack === '1') return true
  return false
}

async function getAnalyticsClient() {
  if (analyticsClientPromise) return analyticsClientPromise

  analyticsClientPromise = (async () => {
    if (shouldDisableAnalytics()) return null

    const appLib = await import('firebase/app')
    const analyticsLib = await import('firebase/analytics')
    const supported = await analyticsLib.isSupported()
    if (!supported) return null

    const app = appLib.getApps().length > 0 ? appLib.getApp() : appLib.initializeApp(firebaseConfig)
    return {
      analytics: analyticsLib.getAnalytics(app),
      logEvent: analyticsLib.logEvent,
    }
  })().catch(() => null)

  return analyticsClientPromise
}

export function trackPageView(path: string, title: string, url = new URL(path, siteMeta.origin).toString()) {
  void getAnalyticsClient().then(client => {
    if (!client) return
    client.logEvent(client.analytics, 'page_view', {
      page_title: title,
      page_location: url,
      page_path: path,
    })
  })
}
