import { createContext, useContext, useState } from 'react'

interface CourseLayoutContextValue {
  showResetButton: boolean
  setShowResetButton: (show: boolean) => void
}

const CourseLayoutContext = createContext<CourseLayoutContextValue | null>(null)

interface Props {
  children: React.ReactNode
}

export function CourseLayoutProvider({ children }: Props) {
  const [showResetButton, setShowResetButton] = useState(false)

  return (
    <CourseLayoutContext.Provider value={{ showResetButton, setShowResetButton }}>
      {children}
    </CourseLayoutContext.Provider>
  )
}

export function useCourseLayout() {
  const ctx = useContext(CourseLayoutContext)
  if (!ctx) {
    throw new Error('useCourseLayout must be used within a CourseLayoutProvider')
  }
  return ctx
}
