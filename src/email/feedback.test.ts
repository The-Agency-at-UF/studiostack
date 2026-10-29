// @vitest-environment node
import {describe,it,expect,vi} from 'vitest'
import {emailHash,snsFeedback,assertRecipientAllowed,feedbackRequest} from '../../backend/email/feedback'
const topic='arn:aws:sns:us-east-2:423563856930:studiostack-dev-email-feedback',id='11111111-1111-4111-8111-111111111111'
function event(body:unknown){return {Records:[{EventSource:'aws:sns',Sns:{TopicArn:topic,MessageId:id,Message:JSON.stringify(body)}}]}}
describe('Private SES feedback processing',()=>{
 it('stores normalized hashes and job IDs without raw recipient content',()=>{const result=snsFeedback(event({eventType:'Bounce',bounce:{bounceType:'Permanent',bouncedRecipients:[{emailAddress:'Test@Example.com'}]},mail:{tags:{StudioStackDelivery:[id]}}}),topic);expect(result).toEqual([{action:'record',id,kind:'bounce',hashes:[emailHash('test@example.com')],deliveryId:id}]);expect(JSON.stringify(result)).not.toContain('Test@Example.com')})
 it('ignores transient bounces and unrelated delivery events',()=>{expect(snsFeedback(event({eventType:'Bounce',bounce:{bounceType:'Transient'}}),topic)).toEqual([]);expect(snsFeedback(event({eventType:'Delivery'}),topic)).toEqual([])})
 it('handles complaints and a single-recipient destination fallback',()=>{expect(snsFeedback(event({eventType:'Complaint',complaint:{},mail:{destination:['owner@example.com']}}),topic)[0]).toMatchObject({kind:'complaint',hashes:[emailHash('owner@example.com')]})})
 it('rejects a different SNS topic',()=>{expect(()=>snsFeedback(event({eventType:'Complaint'}),topic+'other')).toThrow('source')})
 it('rejects malformed input without exposing its contents in the error',()=>{const e=event({});e.Records[0].Sns.Message='private recipient';expect(()=>snsFeedback(e,topic)).toThrow('Invalid feedback JSON')})
 it('requires hashes on the private storage API and deduplicates normalized receipts',()=>{expect(()=>feedbackRequest({action:'check',emailHash:'raw@example.com'})).toThrow('hash');expect(feedbackRequest({action:'record',id,kind:'bounce',hashes:['a'.repeat(64),'a'.repeat(64)]})).toMatchObject({hashes:['a'.repeat(64)]})})
 it('refuses a suppressed recipient before handing off to the sender',async()=>{const store=vi.fn().mockResolvedValue({allowed:false});await expect(assertRecipientAllowed('User@Example.com',store)).rejects.toMatchObject({name:'UnverifiedRecipient'});expect(store).toHaveBeenCalledWith({action:'check',emailHash:emailHash('user@example.com')})})
})
