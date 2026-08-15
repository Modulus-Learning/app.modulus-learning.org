import { defineConfig } from 'rolldown'
import { dts } from 'rolldown-plugin-dts'

const watch = {
  clearScreen: false,
}

const external = (id) => !id.startsWith('.') && !id.startsWith('/') && !id.startsWith('@/')

const libraryInput = {
  'core/index': 'src/core/index.ts',
  'ui-vanilla/index': 'src/ui-vanilla/index.ts',
}

const declarations = () =>
  dts({
    emitDtsOnly: true,
    generator: 'oxc',
    tsconfig: './tsconfig.json',
  })

export default defineConfig([
  {
    input: 'src/browser/main.ts',
    platform: 'browser',
    tsconfig: './tsconfig.json',
    output: [
      {
        file: 'dist/browser/modulus-agent.js',
        format: 'iife',
        name: 'ModulusAgent',
      },
      {
        file: 'dist/browser/modulus-agent.mjs',
        format: 'es',
      },
      {
        file: 'dist/browser/modulus-agent.min.js',
        format: 'iife',
        minify: true,
        name: 'ModulusAgent',
      },
      {
        file: 'dist/browser/modulus-agent.min.mjs',
        format: 'es',
        minify: true,
      },
    ],
    watch,
  },
  {
    input: libraryInput,
    external,
    moduleTypes: {
      '.svg': 'dataurl',
    },
    platform: 'browser',
    tsconfig: './tsconfig.json',
    output: {
      dir: 'dist',
      entryFileNames: '[name].js',
      format: 'es',
      preserveModules: true,
      preserveModulesRoot: 'src',
      sourcemap: true,
    },
    watch,
  },
  {
    input: libraryInput,
    external,
    moduleTypes: {
      '.svg': 'dataurl',
    },
    platform: 'browser',
    plugins: [declarations()],
    tsconfig: './tsconfig.json',
    output: {
      dir: 'dist',
      entryFileNames: '[name].js',
      format: 'es',
      preserveModules: true,
      preserveModulesRoot: 'src',
    },
    watch,
  },
])
