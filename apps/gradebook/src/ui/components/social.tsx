import Link from 'next/link'

export function Social(): React.JSX.Element {
  return (
    <ul className="m-0 ml-[-0.5em] flex list-none gap-2 p-0 sm:ml-0 sm:mr-[-0.125em] sm:justify-end">
      <li className="">
        <Link
          href="/contact-us"
          className="relative flex h-[34px] w-[34px] items-center justify-center rounded-full border-none bg-primary-300 p-[6px] transition-all duration-200 ease-in-out hover:scale-110 dark:bg-primary-600/70"
          title="Contact"
        >
          <svg
            className="block h-[75%] w-[75%] fill-white text-white"
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
          >
            <title>Contact</title>
            <path d="M12 12.713l-11.985-9.713h23.97l-11.985 9.713zm0 2.574l-12-9.725v15.438h24v-15.438l-12 9.725z" />
          </svg>
        </Link>
      </li>

      <li>
        <a
          href="https://www.facebook.com"
          className="relative flex h-[34px] w-[34px] items-center justify-center rounded-full border-none bg-primary-300 p-[6px] transition-all duration-200 ease-in-out hover:scale-110 dark:bg-primary-600/70"
          title="Facebook"
          target="_blank"
          rel="noopener noreferrer"
        >
          <svg
            className="block h-[75%] w-[75%] fill-white text-white"
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
          >
            <title>Facebook</title>
            <path d="M9 8h-3v4h3v12h5v-12h3.642l.358-4h-4v-1.667c0-.955.192-1.333 1.115-1.333h2.885v-5h-3.808c-3.596 0-5.192 1.583-5.192 4.615v3.385z" />
          </svg>
        </a>
      </li>

      {/* <li>
        <a
          href="https://www.threads.net/@modulus.official"
          className="relative flex h-[34px] w-[34px] items-center justify-center rounded-full border-none bg-primary-300 p-[6px] transition-all duration-200 ease-in-out hover:scale-110 dark:bg-primary-600/70"
          title="Threads"
          target="_blank"
          rel="noopener noreferrer"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="block h-[100%] w-[100%] fill-white text-white"
            width="24"
            height="24"
            viewBox="0 0 24 24"
          >
            <g fill="none" fillRule="evenodd">
              <path d="M24 0v24H0V0h24ZM12.594 23.258l-.012.002l-.071.035l-.02.004l-.014-.004l-.071-.036c-.01-.003-.019 0-.024.006l-.004.01l-.017.428l.005.02l.01.013l.104.074l.015.004l.012-.004l.104-.074l.012-.016l.004-.017l-.017-.427c-.002-.01-.009-.017-.016-.018Zm.264-.113l-.014.002l-.184.093l-.01.01l-.003.011l.018.43l.005.012l.008.008l.201.092c.012.004.023 0 .029-.008l.004-.014l-.034-.614c-.003-.012-.01-.02-.02-.022Zm-.715.002a.023.023 0 0 0-.027.006l-.006.014l-.034.614c0 .012.007.02.017.024l.015-.002l.201-.093l.01-.008l.003-.011l.018-.43l-.003-.012l-.01-.01l-.184-.092Z" />
              <path
                fill="currentColor"
                d="M5.45 4.623C6.997 2.974 9.24 2 12.017 2c4.565 0 7.592 2.631 8.55 6.277a1 1 0 0 1-1.935.508C17.905 6.022 15.676 4 12.016 4c-2.286 0-3.98.789-5.106 1.99c-1.136 1.212-1.769 2.923-1.769 4.885v2.25c0 1.962.633 3.673 1.769 4.884C8.036 19.212 9.73 20 12.016 20c1.655 0 2.968-.384 3.976-1.005c1.015-.625 1.62-1.454 1.79-2.405c.195-1.096-.045-1.848-.458-2.391a3.227 3.227 0 0 0-.814-.741c-.135.749-.376 1.456-.74 2.01c-1.342 2.039-3.908 2.214-5.6 1.539c-.916-.365-1.701-1.364-1.945-2.435a3.018 3.018 0 0 1 .141-1.843c.265-.636.756-1.178 1.455-1.59c.692-.409 1.72-.597 2.739-.625c.614-.017 1.28.024 1.95.133c-.14-.65-.377-1.135-.644-1.384c-.484-.45-1.286-.767-2.09-.762c-.777.006-1.436.305-1.83.935a1 1 0 1 1-1.696-1.06c.837-1.338 2.216-1.865 3.513-1.875c1.27-.009 2.578.472 3.466 1.298c.898.836 1.284 2.207 1.384 3.454c.874.381 1.7.94 2.305 1.737c.781 1.03 1.117 2.358.833 3.951c-.29 1.624-1.315 2.898-2.71 3.757C15.673 21.54 13.985 22 12.016 22c-2.776 0-5.02-.974-6.565-2.623c-1.536-1.638-2.31-3.864-2.31-6.252v-2.25c0-2.388.774-4.614 2.31-6.252ZM14.6 12.7a8.349 8.349 0 0 0-1.986-.186c-.891.024-1.516.193-1.777.347c-.384.227-.55.458-.624.637a1.022 1.022 0 0 0-.038.63c.122.536.525.938.736 1.021c1.126.45 2.535.212 3.188-.78c.235-.358.422-.96.5-1.669Z"
              />
            </g>
          </svg>
        </a>
      </li> */}
      <li>
        <a
          href="https://www.youtube.com"
          className="relative flex h-[34px] w-[34px] items-center justify-center rounded-full border-none bg-primary-300 p-[6px] transition-all duration-200 ease-in-out hover:scale-110 dark:bg-primary-600/70"
          title="YouTube"
          target="_blank"
          rel="noopener noreferrer"
        >
          <svg
            className="block h-[100%] w-[100%] scale-125 fill-white text-white"
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 512 512"
          >
            <title>YouTube</title>
            <path d="M422.6 193.6c-5.3-45.3-23.3-51.6-59-54 -50.8-3.5-164.3-3.5-215.1 0 -35.7 2.4-53.7 8.7-59 54 -4 33.6-4 91.1 0 124.8 5.3 45.3 23.3 51.6 59 54 50.9 3.5 164.3 3.5 215.1 0 35.7-2.4 53.7-8.7 59-54C426.6 284.8 426.6 227.3 422.6 193.6zM222.2 303.4v-94.6l90.7 47.3L222.2 303.4z" />
          </svg>
        </a>
      </li>

      <li>
        <a
          href="https://twitter.com"
          className="relative flex h-[34px] w-[34px] items-center justify-center rounded-full border-none bg-primary-300 p-[6px] transition-all duration-200 ease-in-out hover:scale-110 dark:bg-primary-600/70"
          title="Twitter"
          target="_blank"
          rel="noopener noreferrer"
        >
          <svg
            className="block h-[75%] w-[75%] fill-white text-white"
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
          >
            <title>Twitter</title>
            <path
              fill="currentColor"
              d="M18.205 2.25h3.308l-7.227 8.26l8.502 11.24H16.13l-5.214-6.817L4.95 21.75H1.64l7.73-8.835L1.215 2.25H8.04l4.713 6.231l5.45-6.231Zm-1.161 17.52h1.833L7.045 4.126H5.078L17.044 19.77Z"
            />
          </svg>
        </a>
      </li>

      <li>
        <a
          href="https://www.linkedin.com"
          className="relative flex h-[34px] w-[34px] items-center justify-center rounded-full border-none bg-primary-300 p-[6px] transition-all duration-200 ease-in-out hover:scale-110 dark:bg-primary-600/70"
          title="LinkedIn"
          target="_blank"
          rel="noopener noreferrer"
        >
          <svg
            className="block h-[75%] w-[75%] fill-white text-white"
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
          >
            <title>LinkedIn</title>
            <path d="M4.98 3.5c0 1.381-1.11 2.5-2.48 2.5s-2.48-1.119-2.48-2.5c0-1.38 1.11-2.5 2.48-2.5s2.48 1.12 2.48 2.5zm.02 4.5h-5v16h5v-16zm7.982 0h-4.968v16h4.969v-8.399c0-4.67 6.029-5.052 6.029 0v8.399h4.988v-10.131c0-7.88-8.922-7.593-11.018-3.714v-2.155z" />
          </svg>
        </a>
      </li>
    </ul>
  )
}
