// import babel from '@rollup/plugin-babel'
import commonjs from '@rollup/plugin-commonjs'
import image from '@rollup/plugin-image'
import resolve from '@rollup/plugin-node-resolve'
import terser from '@rollup/plugin-terser'
import del from 'rollup-plugin-delete'
import { dts } from 'rollup-plugin-dts'
import postcss from 'rollup-plugin-postcss'
import { swc } from 'rollup-plugin-swc3'

/** @type {import('rollup').RollupOptions} */
const config = [
  {
    input: 'src/browser/main.ts',
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
    ],
    watch: {
      clearScreen: false,
    },
    plugins: [swc(), resolve({ jsnext: true, preferBuiltins: true, browser: true }), commonjs()],
  },
  {
    input: 'src/browser/main.ts',
    output: [
      {
        file: 'dist/browser/modulus-agent.min.js',
        format: 'iife',
        name: 'ModulusAgent',
      },
      {
        file: 'dist/browser/modulus-agent.min.mjs',
        format: 'es',
      },
    ],
    watch: {
      clearScreen: false,
    },
    plugins: [
      swc(),
      resolve({ jsnext: true, preferBuiltins: true, browser: true }),
      commonjs(),
      terser(),
    ],
  },
  {
    input: 'src/core/index.ts',
    output: {
      dir: 'dist',
      format: 'es',
      entryFileNames: '[name].js',
      preserveModules: true,
      preserveModulesRoot: 'src',
      sourcemap: true,
    },
    watch: {
      clearScreen: false,
    },
    external: (id) => !/^@\/|[./]/.test(id),
    plugins: [del({ targets: 'dist/core/*' }), swc()],
  },
  {
    input: 'src/core/index.ts',
    output: {
      dir: 'dist',
      format: 'es',
      entryFileNames: '[name].d.ts',
      preserveModules: true,
      preserveModulesRoot: 'src',
      // sourcemap: true,
    },
    watch: {
      clearScreen: false,
    },
    external: (id) => !/^@\/|[./]/.test(id),
    plugins: [swc(), dts({ respectExternal: true })],
  },
  {
    input: 'src/ui-vanilla/index.ts',
    output: {
      dir: 'dist',
      format: 'es',
      entryFileNames: '[name].js',
      preserveModules: true,
      preserveModulesRoot: 'src',
      sourcemap: true,
    },
    watch: {
      clearScreen: false,
    },
    external: (id) => !/^@\/|[./]/.test(id),
    plugins: [del({ targets: 'dist/ui-vanilla/*' }), image(), swc()],
  },
  {
    input: 'src/ui-vanilla/index.ts',
    output: {
      dir: 'dist',
      format: 'es',
      entryFileNames: '[name].d.ts',
      preserveModules: true,
      preserveModulesRoot: 'src',
    },
    watch: {
      clearScreen: false,
    },
    external: (id) => !/^@\/|[./]/.test(id),
    plugins: [image(), swc(), dts({ respectExternal: true })],
  },
]

export default config
