// Creates a host key for the shared room (F10). Run it on your own machine:
//   node scripts/host-key.mjs "owner 2026-09" [https://example.github.io/app/]
// It prints the key (hand it to the owner privately; never commit, paste in a PR or chat log) and an SQL insert
// that carries only a random salt and the SHA-256 of salt+key. Run that SQL in the Supabase SQL editor.
// The raw key never reaches the database. See docs/SQL_MIGRATION_F10.md for rotation.
import { createHash, randomBytes } from 'node:crypto'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

/** 256 random bits, URL-safe (43 characters of base64url). */
export function createHostKey() {
  return randomBytes(32).toString('base64url')
}

/** The stored record: a per-key salt and sha256(salt || utf8(key)), both hex. Matches lp_host_key_check. */
export function hostKeyRecord(key, salt = randomBytes(16)) {
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(key)) throw new Error('Host key must be 32-128 URL-safe characters')
  const hash = createHash('sha256').update(salt).update(key, 'utf8').digest()
  return { salt: salt.toString('hex'), hash: hash.toString('hex') }
}

export function hostKeySql(label, record) {
  if (typeof label !== 'string' || [...label].length > 60) throw new Error('Label must be at most 60 characters')
  if (!/^[0-9a-f]{32,}$/.test(record.salt) || !/^[0-9a-f]{64}$/.test(record.hash)) throw new Error('Invalid record')
  const quoted = `'${label.replaceAll("'", "''")}'`
  return `insert into public.lp_host_keys(label,salt,hash) values(${quoted},'\\x${record.salt}','\\x${record.hash}') returning id;`
}

/** The host link. The key is in the fragment, which browsers do not send to servers. */
export function hostLink(base, key) {
  const url = new URL(base)
  url.hash = `/host/${key}`
  return url.href
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [label = '', base] = process.argv.slice(2)
  const key = createHostKey()
  const sql = hostKeySql(label, hostKeyRecord(key))
  console.log('Host key (give it to the owner privately; do not commit or paste it anywhere public):')
  console.log(key)
  if (base) console.log(`Host link: ${hostLink(base, key)}`)
  console.log('\nRun in the Supabase SQL editor (salt and hash only, no key):')
  console.log(sql)
}
