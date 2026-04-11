import type { ModulusAgent } from '@modulus-learning/agent'

export const setupProgressIndicator = (agent: ModulusAgent) => {
  const progress = document.querySelector<HTMLDivElement>('#progress-indicator')
  const remoteProgress = document.querySelector<HTMLDivElement>('#remote-progress-indicator')

  if (progress == null || remoteProgress == null) return

  const remoteProgressValue = () => (agent.user() ? agent.submittedProgress() : agent.progress())

  const updateIndicator = () => {
    progress.style.width = `${agent.progress() * 100}%`
    remoteProgress.style.width = `${remoteProgressValue() * 100}%`
  }

  agent.onReady(() => {
    updateIndicator()
    agent.on('progress-changed', updateIndicator)
    agent.on('progress-submitted', updateIndicator)
  })
}
