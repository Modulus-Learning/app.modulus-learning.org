import { MESSAGES, resolveSlug } from '@/modules/agent/error-messages'

/**
 * The /agent/error page body. Only a known slug selects copy; anything else
 * (unknown, repeated, or a rejected value) renders the generic server error,
 * and the raw query value never becomes page content or a link.
 */
export function AgentErrorView({ code }: { code: string | string[] | undefined }) {
  const { title, message } = MESSAGES[resolveSlug(code)]
  return (
    <div className="flex justify-center mt-[12vh] sm:mt-[18vh] bg-gray-50 not-dark">
      <div className="max-w-md w-full p-8 bg-white rounded-lg shadow border">
        <h1 className="text-xl font-semibold mb-4">{title}</h1>
        <p className="text-gray-600">{message}</p>
      </div>
    </div>
  )
}
