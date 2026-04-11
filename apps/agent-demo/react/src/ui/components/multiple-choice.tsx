import { useSyncExternalStore } from 'react'

import cx from 'classnames'

import { useModulus } from './modulus-provider'

type MultipleChoiceState = { complete: boolean; selected?: number }
const defaultState = { complete: false }

interface Props {
  questionId: string
  marker?: string
  title: string
  prompt: string
  options: string[]
  answer: number
  pointValue: number
  totalPoints: number
  orientation?: 'horizontal' | 'vertical'
}

export const MultipleChoice: React.FC<Props> = ({
  questionId,
  marker,
  title,
  prompt,
  options,
  answer,
  pointValue,
  totalPoints,
  orientation = 'horizontal',
}) => {
  const { modulus } = useModulus()

  const modulusIsReady = useSyncExternalStore(
    (cb) => modulus.on('ready', cb),
    () => modulus.isReady()
  )

  const { complete, selected } = useSyncExternalStore<MultipleChoiceState>(
    (cb) => modulus.on('pagestate-changed', cb),
    () => modulus.pageState()?.questions?.[questionId] ?? defaultState
  )

  const setSelectedAnswer = (selected: number) => () => {
    const oldPageState = modulus.pageState()

    // If the user has selected the correct answer, mark the problem as complete.
    const complete = selected === answer

    // Compute an updated page score.
    const score = complete ? (oldPageState.score ?? 0) + pointValue : oldPageState.score

    // Generate updated page state.
    const newPageState = {
      ...oldPageState,
      score,
      questions: {
        ...oldPageState.questions,
        [questionId]: {
          complete,
          selected,
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
      <h3 className="text-3xl">{title}</h3>
      <span>{prompt}</span>
      <div
        className={cx('flex gap-2', {
          'flex-row items-center': orientation === 'horizontal',
          'flex-col items-start': orientation === 'vertical',
        })}
      >
        {options.map((option, ix) => (
          <button
            key={option}
            type="button"
            className={cx('border border-gray-400 rounded px-2 py-1 min-w-20 cursor-pointer', {
              'bg-green-700': ix === selected && ix === answer,
              'bg-red-700': ix === selected && ix !== answer,
              'text-white': ix === selected,
              'bg-gray-400': complete && ix !== selected,
            })}
            disabled={complete || !modulusIsReady}
            onClick={setSelectedAnswer(ix)}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  )
}
