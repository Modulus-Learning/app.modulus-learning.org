export interface Logger {
  log(...msgs: unknown[]): Promise<void>
}

// The default logger for the agent.  Emits nothing -- the agent runs inside
// learners' browsers on third-party content pages, so console commentary (and
// any token material in it) is off by default.  Content authors can opt in by
// passing `createConsoleLogger()` / `createDebugLogger()` to the agent.
export const createSilentLogger = (): Logger => {
  return {
    async log() {},
  }
}

export const createConsoleLogger = (): Logger => {
  return {
    async log(...msgs) {
      if (msgs.length > 0) {
        console.log(...msgs)
      }
    },
  }
}

export const createDebugLogger = (): Logger => {
  const stepButton = document.createElement('button')
  stepButton.innerText = 'Next'
  stepButton.disabled = true
  Object.assign(stepButton.style, {
    backgroundColor: 'gray',
    cursor: 'auto',
    border: '1px solid black',
    'border-radius': '10px',
    color: 'black',
    padding: '4px 12px',
    position: 'fixed',
    bottom: '10px',
    left: '10px',
    zIndex: '1000',
  })
  document.body.appendChild(stepButton)

  return {
    log(...msgs) {
      if (msgs.length > 0) {
        console.log(...msgs)
      }

      return new Promise((resolve) => {
        const handler = () => {
          stepButton.disabled = true
          Object.assign(stepButton.style, {
            backgroundColor: 'gray',
            cursor: 'auto',
          })
          stepButton.removeEventListener('click', handler)
          resolve()
        }
        stepButton.disabled = false
        Object.assign(stepButton.style, {
          backgroundColor: 'white',
          cursor: 'pointer',
        })
        stepButton.addEventListener('click', handler)
      })
    },
  }
}
