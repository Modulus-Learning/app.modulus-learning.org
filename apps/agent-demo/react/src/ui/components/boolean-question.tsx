import type { PropsWithChildren } from 'react'
import { useSyncExternalStore } from 'react'

import cx from 'classnames'

import { useModulus } from './modulus-provider'

type BooleanQuestionState = { complete: boolean; selected?: boolean }
const defaultState: BooleanQuestionState = { complete: false }

type BooleanQuestionProps = PropsWithChildren<{
  questionId: string
  marker?: string
  title: string
  answer: boolean
  pointValue: number
  totalPoints: number
}>

export const BooleanQuestion: React.FC<BooleanQuestionProps> = ({
  questionId,
  marker,
  title,
  children,
  answer,
  pointValue,
  totalPoints,
}) => {
  const { modulus } = useModulus()

  const modulusIsReady = useSyncExternalStore(
    (cb) => modulus.on('ready', cb),
    () => modulus.isReady()
  )

  const { complete, selected } = useSyncExternalStore<BooleanQuestionState>(
    (cb) => modulus.on('pagestate-changed', cb),
    () => modulus.pageState()?.questions?.[questionId] ?? defaultState
  )

  const handleSelect = (value: boolean) => () => {
    const oldPageState = modulus.pageState()

    const complete = value === answer

    const score = complete ? (oldPageState.score ?? 0) + pointValue : oldPageState.score

    const newPageState = {
      ...oldPageState,
      score,
      questions: {
        ...oldPageState.questions,
        [questionId]: {
          complete,
          selected: value,
        },
      },
    }

    if (complete) {
      modulus.setProgress(newPageState.score / totalPoints)
    }

    modulus.setPageState(newPageState)
  }

  return (
    <div className="p-3 flex flex-col gap-2">
      <span className="text-green-500 text-base font-mono mr-2">{marker}</span>
      <h3 className="text-2xl">{title}</h3>
      <div>{children}</div>
      <div className="flex flex-row items-center gap-2">
        {[true, false].map((value) => (
          <button
            key={String(value)}
            type="button"
            className={cx('border border-gray-400 rounded px-4 py-1 min-w-20 cursor-pointer', {
              'bg-green-700 text-white': selected === value && value === answer,
              'bg-red-700 text-white': selected === value && value !== answer,
              'bg-gray-400': complete && selected !== value,
            })}
            disabled={complete || !modulusIsReady}
            onClick={handleSelect(value)}
          >
            {value ? 'Yes' : 'No'}
          </button>
        ))}
      </div>
    </div>
  )
}
