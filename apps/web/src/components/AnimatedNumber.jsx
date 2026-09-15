import { useEffect, useRef, useState } from 'react'
import { animate } from 'framer-motion'
import { useConnectionQuality } from '../hooks/useConnectionQuality'

export default function AnimatedNumber({ value, format, duration = 0.9, className }) {
  const { isSlow } = useConnectionQuality()
  const [display, setDisplay] = useState(0)
  const prevValue = useRef(0)

  useEffect(() => {
    // animate() is an imperative framer-motion call, not a `motion.*`
    // component — MotionConfig's reducedMotion doesn't reach it, so the
    // slow-connection check has to happen here directly.
    if (isSlow) {
      setDisplay(value)
      prevValue.current = value
      return
    }
    const controls = animate(prevValue.current, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setDisplay(v),
    })
    prevValue.current = value
    return () => controls.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, isSlow])

  return <span className={className}>{format ? format(display) : Math.round(display)}</span>
}
