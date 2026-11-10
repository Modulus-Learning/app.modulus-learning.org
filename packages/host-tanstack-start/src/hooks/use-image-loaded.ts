import type { RefObject } from 'react'
import { useEffect, useRef, useState } from 'react'

export const useImageLoaded = (): {
  ref: RefObject<HTMLImageElement | null>
  loading: boolean
  handleImageLoaded: () => void
} => {
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLImageElement>(null)

  const handleImageLoaded = (): void => {
    setLoading(false)
  }

  useEffect(() => {
    const id = setTimeout(() => {
      if (ref?.current?.complete != null && !ref.current.complete && !loading) {
        setLoading(true)
      }
    }, 100)
    return () => {
      clearTimeout(id)
    }
  })

  return { ref, loading, handleImageLoaded }
}
