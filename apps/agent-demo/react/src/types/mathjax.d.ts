export {}

declare global {
  interface Window {
    MathJax?: {
      startup?: {
        promise?: Promise<unknown>
      }
      typesetClear?: (elements?: unknown[]) => void
      typesetPromise?: (elements?: unknown[]) => Promise<unknown>
      typeset?: (elements?: unknown[]) => void
    }
  }
}
