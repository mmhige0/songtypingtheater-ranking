import ts from 'typescript'
import { readFile } from 'node:fs/promises'
export async function resolve(specifier, context, nextResolve) {
  try { return await nextResolve(specifier, context) }
  catch (error) {
    if (specifier.startsWith('.') && !specifier.match(/\.[a-z]+$/i)) return nextResolve(specifier + '.ts', context)
    throw error
  }
}
export async function load(url, context, nextLoad) {
  if (!url.endsWith('.ts')) return nextLoad(url, context)
  const source = await readFile(new URL(url), 'utf8')
  return { format: 'module', shortCircuit: true, source: ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText }
}
