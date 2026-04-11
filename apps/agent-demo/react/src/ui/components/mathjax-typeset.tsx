import type { PropsWithChildren } from 'react'
import { useEffect, useRef } from 'react'

type MathJaxTypesetProps = PropsWithChildren<{
  /**
   * A dependency list that triggers a re-typeset.
   *
   * Tip: pass something stable like `[text]` if you render dynamic math.
   */
  deps?: readonly unknown[]
  className?: string
}>

export const MathJaxTypeset = ({ children, deps = [], className }: MathJaxTypesetProps) => {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false

    const node = containerRef.current
    if (!node) return

    const typesetNode = async () => {
      const mathJax = window.MathJax
      if (!mathJax) return

      if (mathJax.startup?.promise) {
        await mathJax.startup.promise
      }

      if (cancelled) return

      if (typeof mathJax.typesetClear === 'function') {
        mathJax.typesetClear([node])
      }

      if (typeof mathJax.typesetPromise === 'function') {
        await mathJax.typesetPromise([node])
      } else if (typeof mathJax.typeset === 'function') {
        mathJax.typeset([node])
      }
    }

    const ensureAndTypeset = async () => {
      if (window.MathJax) {
        await typesetNode()
        return
      }

      const script = document.getElementById('MathJax-script') as HTMLScriptElement | null
      if (script) {
        await new Promise<void>((resolve) => {
          const onDone = () => resolve()

          // If MathJax is already available, don't wait.
          if (window.MathJax) {
            resolve()
            return
          }

          script.addEventListener('load', onDone, { once: true })
          script.addEventListener('error', onDone, { once: true })
        })
      }

      if (cancelled) return
      await typesetNode()
    }

    void ensureAndTypeset()

    return () => {
      cancelled = true
    }
  }, [...deps])

  return (
    <div ref={containerRef} className={className}>
      {children}
    </div>
  )
}
