// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { decisionEmail, deliverNotifications, verifiedRecipient } from '../../backend/production/notifications'
import type { NotificationJob } from '../../backend/production/outbox'
const job: NotificationJob = { id:'delivery-id', organizationId:'org-id', briefId:'brief-id', recipientSubject:'subject',recipientIssuer:'https://cognito.example.org', leaseToken:'lease', payload:{ projectName:'Campus\r\nBcc: injected@example.org',client:'Example',decision:'changes_requested',comment:'Please clarify the shoot scope.',section:'Deliverables',version:3,deliveryDate:'2026-11-20',shootStartsAt:null,shootEndsAt:null,reviewer:'Jordan' } }
const resolveRecipient = async () => 'fixture@example.org'
const approved = {allowed:true,payload:job.payload}
describe('durable decision delivery', () => {
  const subject='b79fb870-3358-45d9-a1aa-8047ddce0711',pool='us-east-2_example'
  const recipientJob={...job,recipientSubject:subject,recipientIssuer:`https://cognito-idp.us-east-2.amazonaws.com/${pool}`}
  const attributes=[{Name:'sub',Value:subject},{Name:'email',Value:'current@example.org'},{Name:'email_verified',Value:'true'}]
  it('resolves a username from its stable subject and reads the current verified email',async()=>{
    const find=vi.fn().mockResolvedValue([{Username:'different-username',Attributes:[{Name:'sub',Value:subject}]}]),get=vi.fn().mockResolvedValue({Enabled:true,UserAttributes:attributes})
    expect(await verifiedRecipient(recipientJob,pool,{find,get})).toBe('current@example.org')
    expect(find).toHaveBeenCalledWith(subject);expect(get).toHaveBeenCalledWith('different-username')
  })
  it.each([{Enabled:false,UserAttributes:attributes},{Enabled:true,UserAttributes:attributes.filter(a=>a.Name!=='email_verified')},{Enabled:true,UserAttributes:attributes.map(a=>a.Name==='sub'?{...a,Value:'other'}:a)}])('rejects disabled, unverified or mismatched current identities',async user=>{
    const find=vi.fn().mockResolvedValue([{Username:'user',Attributes:[{Name:'sub',Value:subject}]}])
    await expect(verifiedRecipient(recipientJob,pool,{find,get:async()=>user})).rejects.toMatchObject({name:'UnverifiedRecipient'})
  })
  it('rejects ambiguous directory matches before reading or sending',async()=>{
    const user={Username:'user',Attributes:[{Name:'sub',Value:subject}]},get=vi.fn()
    await expect(verifiedRecipient(recipientJob,pool,{find:async()=>[user,user],get})).rejects.toMatchObject({name:'UnverifiedRecipient'})
    expect(get).not.toHaveBeenCalled()
  })
  it('creates plain-text decision details and a direct brief link without header injection', () => {
    const email = decisionEmail(job,'https://studio.example.org')
    expect(email.subject).not.toMatch(/[\r\n]/)
    expect(email.text).toContain('Reviewer: Jordan')
    expect(email.text).toContain('Please clarify the shoot scope.')
    expect(email.text).toContain('https://studio.example.org/production/?organization=org-id&brief=brief-id')
  })
  it('acknowledges a successful send with its exact lease', async () => {
    const store = vi.fn().mockResolvedValueOnce({jobs:[job]}).mockResolvedValueOnce(approved).mockResolvedValue({updated:true}), send = vi.fn().mockResolvedValue(undefined)
    expect(await deliverNotifications({store,send,resolveRecipient})).toEqual({claimed:1,sent:1,failed:0,skipped:0})
    expect(store).toHaveBeenLastCalledWith({action:'ack',organizationId:job.organizationId,id:job.id,leaseToken:job.leaseToken,outcome:'sent'})
  })
  it('LOGIC-003: skips a decision when current authorization is denied', async () => {
    const store = vi.fn().mockResolvedValueOnce({jobs:[job]}).mockResolvedValue({allowed:false,updated:true})
    const send = vi.fn()
    await deliverNotifications({store,send,resolveRecipient})
    expect(send).not.toHaveBeenCalled()
    expect(store).toHaveBeenLastCalledWith(expect.objectContaining({action:'ack',outcome:'skipped'}))
  })
  it.each([['TooManyRequestsException','retry'],['MessageRejected','failed'],['TimeoutError','uncertain']])('records %s as %s', async (name,outcome) => {
    const store = vi.fn().mockResolvedValueOnce({jobs:[job]}).mockResolvedValueOnce(approved).mockResolvedValue({updated:true}), send = vi.fn().mockRejectedValue(Object.assign(new Error('synthetic'),{name}))
    await deliverNotifications({store,send,resolveRecipient})
    expect(store).toHaveBeenLastCalledWith(expect.objectContaining({outcome}))
    expect(send).toHaveBeenCalledTimes(1)
  })
  it('does not silently claim success if acknowledgement fails', async () => {
    const store = vi.fn().mockResolvedValueOnce({jobs:[job]}).mockResolvedValueOnce(approved).mockResolvedValue({updated:false})
    await expect(deliverNotifications({store,send:async()=>{},resolveRecipient})).rejects.toThrow('acknowledgement')
  })
  it('LOGIC-015: one acknowledgment failure leaves later jobs free to finish', async () => {
    const next={...job,id:'second-job',leaseToken:'second-lease'}
    const store=vi.fn(async request=>{
      if(request.action==='claim')return {jobs:[job,next]}
      if(request.action==='authorize')return approved
      return {updated:request.id===next.id}
    })
    const send=vi.fn()
    await expect(deliverNotifications({store,send,resolveRecipient})).rejects.toThrow('acknowledgement')
    expect(send.mock.calls.map(([delivery])=>delivery.id)).toEqual([job.id,next.id])
  })
})
