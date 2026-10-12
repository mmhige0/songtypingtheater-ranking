import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { decrypt, encrypt, readKey } from './crypto.js'

async function main() {
  // Fail before exporting if the encryption key is missing or invalid.
  const key = readKey(process.env.BACKUP_ENCRYPTION_KEY)
  const [command, input, output] = process.argv.slice(2)
  if (command === 'decrypt' && input && output) {
    const sql = decrypt(await readFile(input), key)
    await writeFile(output, sql, { flag: 'wx', mode: 0o600 })
    console.log('Backup decrypted. Validate it in a separate database before restoring production.')
    return
  }
  if (command !== 'create' || input || output) throw new Error('Usage: backup create | backup decrypt <input.enc> <output.sql>')
  for (const name of ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID']) {
    if (!process.env[name]) throw new Error(`Missing ${name}.`)
  }

  const temporary = await mkdtemp(join(tmpdir(), 'ranking-backup-'))
  try {
    const sqlPath = join(temporary, 'database.sql')
    const exported = spawnSync(resolve('node_modules/.bin/wrangler'), ['d1', 'export', 'DB', '--remote', '--output', sqlPath], {
      stdio: 'ignore', timeout: 10 * 60 * 1000,
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
    })
    // Wrangler output can contain signed download URLs; never print it in public logs.
    if (exported.status !== 0) throw new Error('D1 export failed. Check Cloudflare credentials and D1 Edit permission.')
    const validation = spawnSync('python3', ['scripts/backup/validate.py', sqlPath], { stdio: 'ignore', timeout: 120_000 })
    if (validation.status !== 0) throw new Error('Backup restore validation failed; no artifact was created.')

    const encrypted = encrypt(await readFile(sqlPath), key)
    await mkdir('backups/encrypted', { recursive: true })
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const name = `ranking-${timestamp}.sql.gz.enc`
    await writeFile(join('backups/encrypted', name), encrypted, { flag: 'wx', mode: 0o600 })
    console.log(`Backup validated and encrypted: ${name}`)
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}

main().catch((error: unknown) => {
  // Do not expose SQL, player details or crypto error internals.
  console.error(error instanceof Error && /^(BACKUP_|Missing |Usage: |D1 export failed|Backup restore validation failed)/.test(error.message)
    ? error.message : 'Backup operation failed. Check the file and encryption key; sensitive details are suppressed.')
  process.exitCode = 1
})
