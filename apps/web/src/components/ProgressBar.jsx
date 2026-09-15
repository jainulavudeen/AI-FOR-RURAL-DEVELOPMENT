import { motion } from 'framer-motion'
import { Check } from 'lucide-react'

export default function ProgressBar({ steps, current }) {
  return (
    <div className="w-full">
      <div className="flex items-center">
        {steps.map((label, idx) => {
          const isDone = idx < current
          const isActive = idx === current
          return (
            <div key={label} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-2">
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors duration-300 ${
                    isDone
                      ? 'bg-primary-700 border-primary-700 text-white'
                      : isActive
                        ? 'border-primary-700 text-primary-700 bg-white'
                        : 'border-primary-200 text-primary-300 bg-white'
                  }`}
                >
                  {isDone ? <Check size={16} /> : idx + 1}
                </div>
                <span
                  className={`text-[11px] font-medium whitespace-nowrap ${
                    isActive || isDone ? 'text-primary-800' : 'text-primary-300'
                  }`}
                >
                  {label}
                </span>
              </div>
              {idx < steps.length - 1 && (
                <div className="flex-1 h-[2px] mx-2 mb-5 rounded bg-primary-100 overflow-hidden">
                  <motion.div
                    className="h-full bg-primary-700"
                    initial={false}
                    animate={{ width: idx < current ? '100%' : '0%' }}
                    transition={{ duration: 0.4, ease: 'easeInOut' }}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
