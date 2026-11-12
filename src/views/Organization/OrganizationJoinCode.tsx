'use client'

import { useEffect, useRef, useState } from 'react'
import type { AccountClient } from '../../api/accounts'
import type { JoinCode } from '../../types/accounts'
import { Notice } from '../../components/workspace/WorkspaceUI'

export default function OrganizationJoinCode({ api, name }: { api: AccountClient; name: string }) {
  const [code, setCode] = useState<JoinCode | null>(null)
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [error, setError] = useState(''), [copied, setCopied] = useState(false), [confirm, setConfirm] = useState(false)
  const current = useRef(true)
  // Preserve the request ID after a network failure so retry cannot create another code.
  const request = useRef<string | null>(null)
  useEffect(() => {
    current.current = true
    async function load() {
      const codes: JoinCode[] = []
      let after: string | undefined
      do { const page = await api.joinCodes(after); codes.push(...page.items); after = page.nextCursor ?? undefined } while (after)
      if (current.current) setCode(codes.find(item => item.code && !item.revokedAt) ?? null)
    }
    load().catch(() => { if (current.current) { setLoadFailed(true); setError('The join code could not be loaded. Refresh to try again.') } })
      .finally(() => { if (current.current) setLoading(false) })
    return () => { current.current = false }
  }, [api])
  async function create() {
    if (busy) return
    setBusy(true); setError(''); setCopied(false)
    request.current ??= crypto.randomUUID()
    try {
      const created = await api.createJoinCode({ label: `${name} join code`.slice(0, 80), reusable: true, ...(code ? { replaces: code.id } : {}), requestId: request.current })
      if (current.current) { setCode(created); setConfirm(false); request.current = null }
    } catch { if (current.current) setError('The join code could not be saved. Try again, or refresh if another admin changed it.') }
    finally { if (current.current) setBusy(false) }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(code!.code!); if (current.current) setCopied(true) }
    catch { if (current.current) setError('Copy failed. Select the code and copy it manually.') }
  }
  return <section className="org-directory-card org-directory-join-code" aria-labelledby="org-join-code-title">
    <div className="org-directory-join-row">
      <div className="org-directory-join-value">
        <h2 id="org-join-code-title">Join code</h2>
        {loading ? <p role="status">Loading join code…</p> : code?.code && <code aria-label="Organization join code">{code.code}</code>}
      </div>
      {!loading && (code?.code ? <div className="org-directory-code-actions">
        <button className="ws-button" type="button" onClick={() => void copy()}>{copied ? 'Copied' : 'Copy code'}</button>
        <button className="ws-button" type="button" disabled={busy} onClick={() => setConfirm(true)}>Replace code</button>
      </div> : <button className="ws-button ws-button-primary" type="button" disabled={busy || loadFailed} onClick={() => void create()}>{busy ? 'Creating…' : 'Create reusable code'}</button>)}
      <p className="org-directory-join-help">Anyone with this code and a verified email joins {name} as a member. It stays valid until replaced.</p>
    </div>
    <span className="org-directory-copy-status ws-sr-only" role="status">{copied ? 'Join code copied.' : ''}</span>
    {error && <Notice kind="error">{error}</Notice>}
    {confirm && <div className="org-directory-code-confirm"><p>Replacing this code stops the old code from working. Existing members keep their access.</p>
      <div className="org-directory-code-actions"><button type="button" className="ws-button ws-button-primary" disabled={busy} onClick={() => void create()}>{busy ? 'Replacing…' : 'Replace join code'}</button>
        <button type="button" className="ws-button" disabled={busy} onClick={() => setConfirm(false)}>Cancel</button></div>
    </div>}
  </section>
}
