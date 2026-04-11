interface LessonProgressBarProps {
  value: number
  className?: string
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

export const LessonSummaryProgressBar: React.FC<LessonProgressBarProps> = ({
  value,
  className,
}) => {
  const clamped = clamp01(value)
  const width = `${clamped * 100}%`

  return (
    <div className={`w-full bg-canvas-700 rounded-full h-2 ${className ?? ''}`}>
      {clamped > 0 && <div className="h-3 rounded-sm bg-green-500" style={{ width }} />}
    </div>
  )
}
