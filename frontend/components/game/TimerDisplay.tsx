"use client"

import { useEffect, useState } from "react"

interface TimerDisplayProps {
  ends_at: string
}

export default function TimerDisplay({ ends_at }: TimerDisplayProps) {
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    const calc = () => {
      const diff = Math.max(
        0,
        Math.floor((new Date(ends_at).getTime() - Date.now()) / 1000),
      )
      setSeconds(diff)
    }
    calc()
    const id = setInterval(calc, 1000)
    return () => clearInterval(id)
  }, [ends_at])

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0")
  const ss = String(seconds % 60).padStart(2, "0")
  const urgent = seconds > 0 && seconds < 60

  return (
    <span
      className={`font-mono text-sm font-semibold ${
        urgent ? "text-red-400 animate-pulse" : "text-gray-300"
      }`}
    >
      {mm}:{ss}
    </span>
  )
}
