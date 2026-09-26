/**
 * ホスト用リンク `#/host/<key>`（F10）。キーは URL のフラグメントに置くので、ブラウザはサーバーへ送らない。
 * 受け取った端末は localStorage に保存し、アドレスバーからは消す（画面側で history.replaceState）。
 * キーの作成・交換は scripts/host-key.mjs と docs/SQL_MIGRATION_F10.md。
 */
export const HOST_KEY_PATTERN = /^[A-Za-z0-9_-]{32,128}$/
const HOST_LINK = /^#\/host\/([A-Za-z0-9_-]{32,128})\/?$/

/** `#/host/<key>` のキー。形が違えば null（サーバーへ送る前に弾く）。 */
export function parseHostLink(hash: string): string | null {
  return HOST_LINK.exec(hash)?.[1] ?? null
}

export function hostLinkHash(key: string) {
  if (!HOST_KEY_PATTERN.test(key)) throw new Error('Invalid host key')
  return `#/host/${key}`
}

/** この端末だけに保存するホスト用キー。 */
export interface HostKeyStore {
  get(): string | null
  set(key: string | null): void
}

export const HOST_KEY_STORAGE = 'lastpiece_host_key'

/** localStorage が使えない（プライベートモード・ブロック）ときは保存しないだけで、動作は続ける。 */
export function browserHostKeyStore(storage: () => Storage | undefined = () => globalThis.localStorage): HostKeyStore {
  return {
    get() {
      try {
        const key = storage()?.getItem(HOST_KEY_STORAGE) ?? null
        return key !== null && HOST_KEY_PATTERN.test(key) ? key : null
      } catch { return null }
    },
    set(key) {
      try {
        if (key === null) storage()?.removeItem(HOST_KEY_STORAGE)
        else storage()?.setItem(HOST_KEY_STORAGE, key)
      } catch { /* 保存できなくても、この操作はそのまま続ける。 */ }
    },
  }
}
