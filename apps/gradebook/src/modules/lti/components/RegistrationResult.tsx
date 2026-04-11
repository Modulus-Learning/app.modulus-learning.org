'use client'

// This message must be posted at the end of the dynamic registration process.
// The platform admin's browser will be displaying our dynamic registration page
// inside an iframe (or a separate browser tab), and this message tells the
// parent context that dynamic registration is finished -- that the iframe/tab
// can be closed.
const closeWindow = () =>
  (window.opener || window.parent).postMessage({ subject: 'org.imsglobal.lti.close' }, '*')

// TODO: This is just a placeholder, and ought to be spruced up.
export function RegistrationResults({ success, data }: { success: boolean; data: any }) {
  return (
    <div>
      {success ? <h1>Registration succeeded!</h1> : <h1>Registration failed...</h1>}
      <pre>{JSON.stringify(data, null, 2)}</pre>
      <button type="button" onClick={closeWindow}>
        Close
      </button>
    </div>
  )
}
