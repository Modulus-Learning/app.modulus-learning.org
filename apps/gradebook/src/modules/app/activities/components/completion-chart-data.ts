export interface LearnerActivityDatum {
  week: string
  date: string
  students: number
}

export interface LearnerActivityStatistics {
  totalStudents: number
  maxWeek: LearnerActivityDatum
  earlyCompleters: number
  lateCompleters: number
  earlyPercentage: number
  latePercentage: number
  peakPercentage: number
}

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
})

export const LEARNER_ACTIVITY_TITLE = 'Learner Activity — Illustrative Sample'

export const LEARNER_ACTIVITY_DESCRIPTION =
  'Illustrative distribution of 5,000 sample students across 12 weeks from January 1 to March 25, 2023. This is not activity-specific completion data.'

export function generateIllustrativeLearnerActivityData(): LearnerActivityDatum[] {
  const weeks = 12
  const totalStudents = 5000
  const peak = 5
  const spread = 2.5
  const distribution: LearnerActivityDatum[] = []
  let remainingStudents = totalStudents

  for (let index = 0; index < weeks; index++) {
    const distanceFromPeak = Math.abs(index - peak)
    const probability = Math.exp(-distanceFromPeak / spread) / (spread * Math.sqrt(2 * Math.PI))
    const students =
      index === weeks - 1
        ? remainingStudents
        : Math.min(Math.round(totalStudents * probability * 0.8), remainingStudents)

    remainingStudents -= students

    const startDate = new Date(Date.UTC(2023, 0, 1 + index * 7))
    const endDate = new Date(Date.UTC(2023, 0, 7 + index * 7))

    distribution.push({
      week: `Week ${index + 1}`,
      date: `${dateFormatter.format(startDate)}–${dateFormatter.format(endDate)}`,
      students,
    })
  }

  return distribution
}

export function getLearnerActivityStatistics(
  data: LearnerActivityDatum[]
): LearnerActivityStatistics {
  if (data.length === 0) {
    throw new Error('Illustrative learner activity data must contain at least one row.')
  }

  const totalStudents = data.reduce((sum, item) => sum + item.students, 0)
  const maxWeek = data.reduce((maximum, item) =>
    item.students > maximum.students ? item : maximum
  )
  const earlyCompleters = data.slice(0, 4).reduce((sum, item) => sum + item.students, 0)
  const lateCompleters = data.slice(-4).reduce((sum, item) => sum + item.students, 0)

  return {
    totalStudents,
    maxWeek,
    earlyCompleters,
    lateCompleters,
    earlyPercentage: Math.round((earlyCompleters / totalStudents) * 100),
    latePercentage: Math.round((lateCompleters / totalStudents) * 100),
    peakPercentage: Math.round((maxWeek.students / totalStudents) * 100),
  }
}

export function summarizeIllustrativeLearnerActivity(
  statistics: LearnerActivityStatistics
): string {
  return `The illustrative sample peaks in ${statistics.maxWeek.week} with ${statistics.maxWeek.students.toLocaleString('en-US')} students (${statistics.peakPercentage}% of the sample). ${statistics.earlyPercentage}% are in the first four weeks and ${statistics.latePercentage}% are in the final four weeks.`
}
