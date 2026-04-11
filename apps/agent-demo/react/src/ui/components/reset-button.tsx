import { Button } from '@infonomic/uikit/react'

import { useModulus } from './modulus-provider'

export const ResetButton: React.FC = () => {
  const { modulus } = useModulus()

  const resetAgent = () => {
    modulus.setPageState({})
  }

  return (
    <Button type="button" size="sm" variant="filled" intent="success" onClick={resetAgent}>
      Reset page state
    </Button>
  )
}
