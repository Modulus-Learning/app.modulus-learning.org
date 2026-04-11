'use client'

import { useEffect, useRef } from 'react'

export function DeepLinkingReturnForm({ jwt, return_url }: { jwt: string; return_url: string }) {
  const formRef = useRef<HTMLFormElement | null>(null)

  useEffect(() => {
    formRef.current?.submit()
  }, [])

  return (
    <div className="flex flex-col mb-12 items-center">
      <div className="w-full bg-white rounded-lg shadow border md:mt-0 sm:max-w-[520px] p-8">
        <p>
          You should be automatically redirected back to your LMS shortly; if not, please click the
          button below.
        </p>
        <form ref={formRef} action={return_url} method="POST">
          <input type="hidden" name="JWT" value={jwt} />
          <input type="submit" name="go" value="Submit" />
        </form>
      </div>
    </div>
  )
}
