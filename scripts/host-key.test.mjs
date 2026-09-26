import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { expect, test } from 'vitest'
import { createHostKey, hostKeyRecord, hostKeySql, hostLink } from './host-key.mjs'

test('host keys are 256-bit URL-safe strings and only salt and hash leave the machine', () => {
  const key = createHostKey()
  expect(key).toMatch(/^[A-Za-z0-9_-]{43}$/)
  expect(createHostKey()).not.toBe(key)
  const salt = Buffer.alloc(16, 7)
  const record = hostKeyRecord(key, salt)
  expect(record).toEqual({ salt: salt.toString('hex'), hash: createHash('sha256').update(Buffer.concat([salt, Buffer.from(key)])).digest('hex') })
  expect(hostKeyRecord(key).salt).not.toBe(hostKeyRecord(key).salt)
  expect(() => hostKeyRecord('short')).toThrow()
  const sql = hostKeySql("owner's key", record)
  expect(sql).toBe(`insert into public.lp_host_keys(label,salt,hash) values('owner''s key','\\x${record.salt}','\\x${record.hash}') returning id;`)
  expect(sql).not.toContain(key)
  expect(() => hostKeySql('x'.repeat(61), record)).toThrow()
  expect(() => hostKeySql('ok', { salt: "'; drop table x; --", hash: record.hash })).toThrow()
  expect(hostLink('https://example.com/app/?v=1', key)).toBe(`https://example.com/app/?v=1#/host/${key}`)
})

test('the command prints the key once and SQL without it', () => {
  const output = execFileSync(process.execPath, ['scripts/host-key.mjs', 'owner', 'https://example.com/app/'], { encoding: 'utf8' })
  const key = output.split('\n')[1]
  expect(key).toMatch(/^[A-Za-z0-9_-]{43}$/)
  expect(output).toContain(`Host link: https://example.com/app/#/host/${key}`)
  const sql = output.split('\n').find(line => line.startsWith('insert into public.lp_host_keys'))
  expect(sql).toBeDefined()
  expect(sql).not.toContain(key)
})
