import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import { modulus, modulusNitroOptions } from '@modulus-learning/host-tanstack-start/vite'
import tailwindcss from '@tailwindcss/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    modulus(),
    nitro(modulusNitroOptions({ preset: 'node' })),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})
