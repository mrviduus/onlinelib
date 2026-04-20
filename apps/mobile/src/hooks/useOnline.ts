import { useEffect, useState } from 'react'
import NetInfo from '@react-native-community/netinfo'

export function useOnline(): boolean {
  const [online, setOnline] = useState<boolean | null>(null)

  useEffect(() => {
    const apply = (state: { isConnected: boolean | null; isInternetReachable: boolean | null }) => {
      const reachable = state.isInternetReachable
      setOnline(reachable === null ? !!state.isConnected : reachable)
    }
    NetInfo.fetch().then(apply)
    const unsubscribe = NetInfo.addEventListener(apply)
    return unsubscribe
  }, [])

  return online !== false
}
