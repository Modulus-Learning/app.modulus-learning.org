export interface Logger {
  log(...msgs: string[]): Promise<void>
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
