import {describe,it,expect,vi} from 'vitest'
import {alertEmail,deliverAppAlerts} from '../../backend/alerts/delivery'
const job={id:'id',organizationId:'org',recipientIssuer:'issuer',recipientSubject:'sub',title:'Return overdue',message:'Return gear.',targetPath:'/check-in-out/?reservation=id',leaseToken:'lease'}
describe('Equipment email delivery',()=>{
 it('skips sending when membership or email preference changed after claim',async()=>{const store=vi.fn().mockResolvedValueOnce({jobs:[job]}).mockResolvedValueOnce({allowed:false}).mockResolvedValueOnce({updated:true}),send=vi.fn();expect(await deliverAppAlerts({store,prepare:async()=>send})).toEqual({claimed:1,sent:0,failed:0,skipped:1});expect(send).not.toHaveBeenCalled();expect(store).toHaveBeenLastCalledWith(expect.objectContaining({outcome:'skipped'}))})
 it.each([['ThrottlingException','retry'],['MessageRejected','failed'],['TimeoutError','uncertain']])('handles %s without blindly resending',async(name,outcome)=>{const store=vi.fn().mockResolvedValueOnce({jobs:[job]}).mockResolvedValueOnce({allowed:true}).mockResolvedValueOnce({updated:true}),send=vi.fn().mockRejectedValue(Object.assign(new Error('redacted'),{name}));await deliverAppAlerts({store,prepare:async()=>send});expect(store).toHaveBeenLastCalledWith(expect.objectContaining({outcome}));expect(send).toHaveBeenCalledTimes(1)})
 it('requires a successful lease acknowledgement',async()=>{const store=vi.fn().mockResolvedValueOnce({jobs:[job]}).mockResolvedValueOnce({allowed:true}).mockResolvedValueOnce({updated:false});await expect(deliverAppAlerts({store,prepare:async()=>async()=>{}})).rejects.toThrow('acknowledgement')})
 it('renders text-only email with the app link and preference destination',()=>{expect(alertEmail(job,'https://studio.test')).toMatchObject({subject:'StudioStack: Return overdue',text:expect.stringContaining('https://studio.test/check-in-out/?reservation=id')})})
})

it('LOGIC-015: retries a transient directory error without crossing the alert send boundary',async()=>{
 const store=vi.fn().mockResolvedValueOnce({jobs:[job]}).mockResolvedValue({updated:true})
 const prepare=vi.fn().mockRejectedValue(new Error('Directory temporarily unavailable'))
 await deliverAppAlerts({store,prepare})
 expect(prepare).toHaveBeenCalledOnce()
 expect(store).not.toHaveBeenCalledWith(expect.objectContaining({action:'authorize'}))
 expect(store).toHaveBeenLastCalledWith(expect.objectContaining({action:'ack',outcome:'retry'}))
})
