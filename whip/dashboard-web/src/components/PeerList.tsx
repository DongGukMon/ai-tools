import type { Peer } from '../api/types'

interface PeerListProps {
  peers: Peer[]
  selectedPeer: string | null
  unreadCounts: Record<string, number>
  onSelectPeer: (name: string) => void
}

export function sortPeers(peers: Peer[]): Peer[] {
  const filtered = peers.filter(p => p.name !== 'user')
  const masters = filtered.filter(p => p.name.startsWith('whip-master'))
  const rest = filtered.filter(p => !p.name.startsWith('whip-master'))
  masters.sort((a, b) => {
    if (a.name === 'whip-master') return -1
    if (b.name === 'whip-master') return 1
    return a.name.localeCompare(b.name)
  })
  rest.sort((a, b) => a.name.localeCompare(b.name))
  return [...masters, ...rest]
}

export function PeerList({ peers, selectedPeer, unreadCounts, onSelectPeer }: PeerListProps) {
  const sorted = sortPeers(peers)

  return (
    <div className="w-full md:w-64 shrink-0 flex flex-col border-r-0 md:border-r border-gray-200 dark:border-slate-700">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-slate-700">
        <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          Peers
        </h2>
      </div>
      <div className="flex-1 overflow-y-auto">
        {sorted.length === 0 && (
          <p className="px-4 py-8 text-sm text-gray-400 dark:text-gray-500 text-center">
            No peers found
          </p>
        )}
        {sorted.map(peer => {
          const isSelected = peer.name === selectedPeer
          const unread = unreadCounts[peer.name] || 0
          return (
            <button
              key={peer.name}
              onClick={() => onSelectPeer(peer.name)}
              className={`w-full px-4 py-2.5 flex items-center gap-3 text-left transition-colors ${
                isSelected
                  ? 'bg-[#8B5CF6]/10 dark:bg-[#8B5CF6]/20'
                  : 'hover:bg-gray-100 dark:hover:bg-slate-800'
              }`}
            >
              <span
                className={`text-xs ${
                  peer.online
                    ? 'text-emerald-500'
                    : 'text-gray-300 dark:text-gray-600'
                }`}
              >
                {peer.online ? '\u25CF' : '\u25CB'}
              </span>
              <span
                className={`flex-1 text-sm truncate ${
                  isSelected
                    ? 'font-medium text-[#8B5CF6] dark:text-[#A78BFA]'
                    : peer.online
                      ? 'text-gray-900 dark:text-gray-100'
                      : 'text-gray-400 dark:text-gray-500'
                }`}
              >
                {peer.name}
              </span>
              {unread > 0 && (
                <span className="min-w-5 h-5 flex items-center justify-center rounded-full bg-red-500 text-white text-xs font-medium px-1.5">
                  {unread}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
