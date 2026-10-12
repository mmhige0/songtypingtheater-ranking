import process from 'node:process'
import console from 'node:console'
import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

async function main() {
  for (const name of ['GITHUB_TOKEN', 'GITHUB_REPOSITORY', 'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID']) {
    if (!process.env[name]) throw new Error(`Missing ${name}.`)
  }
  const repository = process.env.GITHUB_REPOSITORY
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error('Invalid repository.')
  // Re-check live visibility: refuse to export if the repository became public.
  const response = await globalThis.fetch(`https://api.github.com/repos/${repository}`, {
    headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' },
    signal: globalThis.AbortSignal.timeout(30_000),
  })
  if (!response.ok || (await response.json()).private !== true) {
    throw new Error('Backup requires a confirmed private repository.')
  }
  const temporary = await mkdtemp(join(tmpdir(), 'ranking-backup-'))
  try {
    const sqlPath = join(temporary, 'database.sql')
    const exported = spawnSync(resolve('node_modules/.bin/wrangler'), ['d1', 'export', 'DB', '--remote', '--output', sqlPath], {
      stdio: 'ignore', timeout: 10 * 60 * 1000,
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
    })
    if (exported.status !== 0) throw new Error('D1 export failed. Check credentials and D1 Edit permission.')
    const validation = spawnSync('python3', ['scripts/validate.py', sqlPath], { stdio: 'ignore', timeout: 120_000 })
    if (validation.status !== 0) throw new Error('Backup restore validation failed; no artifact was created.')
    await mkdir('backups', { recursive: true })
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const name = `ranking-${timestamp}.sql.gz`
    await writeFile(join('backups', name), gzipSync(await readFile(sqlPath)), { flag: 'wx', mode: 0o600 })
    console.log(`Backup validated and compressed: ${name}`)
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(/^(Missing |Invalid repository|Backup requires|D1 export failed|Backup restore validation failed)/.test(error.message)
    ? error.message : 'Backup failed; sensitive error details are suppressed.')
  process.exitCode = 1
})
