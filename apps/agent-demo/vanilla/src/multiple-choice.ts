import type { ModulusAgent } from '@modulus-learning/agent'

type MultipleChoiceState = {
  complete: boolean
  selectedOption?: string
}

const canonicalizeState = (state: any): MultipleChoiceState => {
  const { complete, selectedOption } = state ?? { complete: false }
  return {
    complete: Boolean(complete),
    selectedOption: selectedOption ?? undefined,
  }
}

const setupQuestion = (question: HTMLDivElement, agent: ModulusAgent, totalScore: number) => {
  const questionId = `question-${question.dataset.id}`
  const answer = question.dataset.answer
  const optionButtons = question.querySelectorAll<HTMLButtonElement>('button[data-option]')

  const handleStateChange = ({ complete, selectedOption }: MultipleChoiceState) => {
    for (const button of optionButtons) {
      button.disabled = complete

      const isSelected = button.dataset.option === selectedOption

      button.classList.toggle('bg-green-700', isSelected && complete)
      button.classList.toggle('bg-red-700', isSelected && !complete)
      button.classList.toggle('text-white', isSelected)
      button.classList.toggle('bg-gray-400', !isSelected && complete)
    }
  }

  function handleClick(this: HTMLButtonElement) {
    const selectedOption = this.dataset.option
    const complete = selectedOption === answer
    const state = {
      selectedOption,
      complete,
    }

    const pageState = agent.pageState()

    const newPageState = {
      ...pageState,
      questions: { ...pageState.questions, [questionId]: state },
    }

    if (complete) {
      const score = pageState?.score ?? 0
      const newScore = score + 1
      agent.setProgress(newScore / totalScore)
      newPageState.score = newScore
    }

    agent.setPageState(newPageState)
  }

  for (const button of optionButtons) {
    button.disabled = true
  }

  agent.onReady(() => {
    for (const button of optionButtons) {
      button.addEventListener('click', handleClick)
    }

    let state = canonicalizeState(agent.pageState()?.questions?.[questionId])
    handleStateChange(state)

    agent.on('pagestate-changed', ({ pageState }) => {
      if (state === pageState?.questions?.[questionId]) {
        console.log('Skipping', questionId)
        return
      }
      state = canonicalizeState(pageState?.questions?.[questionId])
      handleStateChange(state)
    })
  })
}

export const setupMultipleChoiceQuestions = (agent: ModulusAgent, totalScore: number) => {
  const questions = document.querySelectorAll<HTMLDivElement>(
    'div[data-question][data-type="multiple-choice"]'
  )

  for (const question of questions) {
    setupQuestion(question, agent, totalScore)
  }
}
