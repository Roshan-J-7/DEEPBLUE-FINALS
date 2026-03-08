import { useEffect, useState } from 'react'
import { ref, onValue } from 'firebase/database'
import { db } from '../firebase'

const CACHE_KEY = 'HA_HARDWARE_DATA'

export interface HardwareData {
  heartRate: number | null
  spo2: number | null
  temperature: number | null
  battery: number | null
  timestamp: number | null
  dateLabel: string | null
  online: boolean
}

const EMPTY: HardwareData = {
  heartRate: null,
  spo2: null,
  temperature: null,
  battery: null,
  timestamp: null,
  dateLabel: null,
  online: false,
}

function readCache(): HardwareData {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? { ...EMPTY, ...JSON.parse(raw), online: false } : EMPTY
  } catch {
    return EMPTY
  }
}

/**
 * Subscribe to hardware sensor data from Firebase Realtime Database.
 * Path: /devices/device1/latest  (contains vitals, timestamp, system)
 *
 * When data arrives → marks online, caches in localStorage.
 * When data is null (hardware off) → returns last cached data with online=false.
 */
const STALE_MS = 60_000 // consider offline if last reading > 60 s ago

export function useHardwareData(): HardwareData {
  const [data, setData] = useState<HardwareData>(readCache)

  useEffect(() => {
    const latestRef = ref(db, 'devices/device1/latest')
    const unsub = onValue(latestRef, (snapshot) => {
      const val = snapshot.val()
      if (val && typeof val === 'object') {
        const vitals = val.vitals ?? {}
        const ts = val.timestamp ?? {}
        const sys = val.system ?? {}
        const epochMs = ts.epoch ? ts.epoch * 1000 : 0
        const isOnline = epochMs > 0 && Date.now() - epochMs < STALE_MS
        const hw: HardwareData = {
          heartRate: vitals.heart_rate ?? vitals.heartRate ?? null,
          spo2: vitals.spo2 ?? vitals.SpO2 ?? null,
          temperature: vitals.temperature ?? vitals.temp ?? null,
          battery: sys.battery ?? null,
          timestamp: epochMs || Date.now(),
          dateLabel: ts.date && ts.time ? `${ts.date} ${ts.time}` : null,
          online: isOnline,
        }
        setData(hw)
        localStorage.setItem(CACHE_KEY, JSON.stringify(hw))
      } else {
        setData(readCache())
      }
    })

    // Re-check staleness every 30 s so the badge flips to Offline
    // even if Firebase doesn't push a new event
    const timer = setInterval(() => {
      setData(prev => {
        if (!prev.online || !prev.timestamp) return prev
        if (Date.now() - prev.timestamp >= STALE_MS) {
          const stale = { ...prev, online: false }
          localStorage.setItem(CACHE_KEY, JSON.stringify(stale))
          return stale
        }
        return prev
      })
    }, 30_000)

    return () => { unsub(); clearInterval(timer) }
  }, [])

  return data
}
