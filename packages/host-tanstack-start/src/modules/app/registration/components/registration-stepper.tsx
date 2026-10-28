function Completed() {
  return (
    <svg
      role="presentation"
      className="shrink-0 size-3"
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

export function Stepper({ step, complete }: { step: number; complete?: boolean }) {
  return (
    <ul className="relative flex flex-row gap-x-2">
      <li className="shrink basis-0 flex-1 group">
        <div className="min-w-7 min-h-7 w-full inline-flex items-center text-xs align-middle">
          <span className="size-7 flex justify-center items-center shrink-0 bg-gray-100 font-medium text-gray-800 rounded-full dark:bg-neutral-700 dark:text-white">
            {step > 1 || complete === true ? <Completed /> : 1}
          </span>

          <div className="ms-2 w-full h-px flex-1 bg-gray-200 group-last:hidden dark:bg-neutral-700" />
        </div>
        <div className="mt-3">
          <span className="block text-sm font-medium text-gray-800 dark:text-white">Details</span>
        </div>
      </li>

      <li className="shrink basis-0 flex-1 group">
        <div className="min-w-7 min-h-7 w-full inline-flex items-center text-xs align-middle">
          <span className="size-7 flex justify-center items-center shrink-0 bg-gray-100 font-medium text-gray-800 rounded-full dark:bg-neutral-700 dark:text-white">
            {step > 2 || complete === true ? <Completed /> : 2}
          </span>
          <div className="ms-2 w-full h-px flex-1 bg-gray-200 group-last:hidden dark:bg-neutral-700" />
        </div>
        <div className="mt-3">
          <span className="block text-sm font-medium text-gray-800 dark:text-white">
            Verify Email
          </span>
        </div>
      </li>

      <li className="shrink basis-0 flex-1 group">
        <div className="min-w-7 min-h-7 w-full inline-flex items-center text-xs align-middle">
          <span className="size-7 flex justify-center items-center shrink-0 bg-gray-100 font-medium text-gray-800 rounded-full dark:bg-neutral-700 dark:text-white">
            {step > 3 || complete === true ? <Completed /> : 3}
          </span>
          <div className="ms-2 w-full h-px flex-1 bg-gray-200 group-last:hidden dark:bg-neutral-700" />
        </div>
        <div className="mt-3">
          <span className="block text-sm font-medium text-gray-800 dark:text-white">Password</span>
        </div>
      </li>
    </ul>
  )
}
