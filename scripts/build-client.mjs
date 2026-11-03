import { mkdir, writeFile } from 'node:fs/promises'
import { build } from 'esbuild'

const result = await build({
  entryPoints: ['src/client/index.ts'],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  minify: true,
  external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
  legalComments: 'eof',
})

const code = result.outputFiles[0].text
const wrapped = `window.__ModuleLoader__.load({ id: "dsh-session-filter", factory: (require) => {\nvar module = { exports: {} };\nvar exports = module.exports;\n${code}\nreturn module.exports;\n}});\n`
await mkdir('client', { recursive: true })
await writeFile('client/client.js', wrapped, 'utf8')
console.log(`Built client/client.js (${Buffer.byteLength(wrapped)} bytes)`)
