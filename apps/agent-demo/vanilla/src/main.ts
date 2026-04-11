import { ModulusAgent } from '@modulus-learning/agent'
import { setupModulusAvatar } from '@modulus-learning/agent/ui/vanilla'

import { setupDebugPanel } from './debug-panel'
import { setupMultipleChoiceQuestions } from './multiple-choice'
import { setupProgressIndicator } from './progress-indicator'
import { setupResetButton } from './reset-button'

const agent = new ModulusAgent()

const title = document.getElementById('assignment-title')
if (title !== null) {
  const segments = window.location.pathname.split('/')
  const lastSegment = segments[segments.length - 1]
  const match = lastSegment.match(/assignment(\d+)/)
  if (match != null) {
    title.innerText = `Assignment ${match[1]}`
  }
}

setupProgressIndicator(agent)
setupMultipleChoiceQuestions(agent, 3)
setupDebugPanel(agent)
setupResetButton(agent)

setupModulusAvatar(agent)
