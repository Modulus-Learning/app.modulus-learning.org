import type { ModulusAgent } from '@modulus-learning/agent'

export const setupDebugPanel = (agent: ModulusAgent) => {
  const card = document.getElementById('user-data-card')
  const data = document.getElementById('user-data')
  if (card == null || data == null) return

  const updateCurrentUser = () => {
    const user = agent.user()
    if (user != null) {
      card.classList.remove('hidden')
      data.innerText = JSON.stringify({ user }, null, 2)
    } else {
      card.classList.add('hidden')
      data.innerText = ''
    }
  }

  updateCurrentUser()
  agent.onReady(updateCurrentUser)
}
