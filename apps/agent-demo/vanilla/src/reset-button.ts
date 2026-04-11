import type { ModulusAgent } from '@modulus-learning/agent'

export const setupResetButton = (agent: ModulusAgent) => {
  const button = document.querySelector<HTMLButtonElement>('#reset-button')

  if (button == null) return

  agent.onReady(() => {
    button.addEventListener('click', () => {
      agent.setPageState({})
    })
  })
}
