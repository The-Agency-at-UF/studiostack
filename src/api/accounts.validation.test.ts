// @vitest-environment node
import {describe,expect,it} from 'vitest'
import {changeMember,changeOrganization,changeTeam,inviteMember} from '../../backend/accounts/validation'
import {directoryRequest} from '../../backend/accounts/directory'
const requestId='11111111-1111-4111-8111-111111111111',version=1
describe('account administration inputs',()=>{
  it('bounds IAM directory attestations to the configured pool and invitation organization',()=>{
    const identity={issuer:'https://cognito-idp.us-east-2.amazonaws.com/us-east-2_test',subject:requestId,email:'a@example.org'}
    expect(directoryRequest({action:'accept',identity,organizationId:requestId,invitationId:requestId},'us-east-2_test')).toMatchObject({organizationId:requestId})
    expect(()=>directoryRequest({action:'accept',identity,invitationId:requestId},'us-east-2_test')).toThrow()
    expect(()=>directoryRequest({action:'list',identity:{...identity,issuer:'https://wrong.example'}},'us-east-2_test')).toThrow()
    expect(()=>directoryRequest({action:'list',identity:{...identity,isAdmin:true}},'us-east-2_test')).toThrow()
  })
  it('normalizes invitation email and excludes owner invitations',()=>{
    expect(inviteMember({email:' PERSON@Example.org ',displayName:'Person',role:'member',requestId}).email).toBe('person@example.org')
    expect(()=>inviteMember({email:'a@example.org',displayName:'A',role:'owner',requestId})).toThrow()
  })
  it('rejects injected privileges and invalid versions',()=>{
    expect(()=>changeMember({role:'admin',status:'active',version,requestId,organizationId:requestId})).toThrow()
    expect(()=>changeMember({role:'admin',status:'active',version:0,requestId})).toThrow()
    expect(()=>changeMember({role:'member',status:'invited',version,requestId})).toThrow()
  })
  it('deduplicates valid team members and bounds policies',()=>{
    expect(changeTeam({name:'Production',archived:false,memberIds:[requestId,requestId],version,requestId}).memberIds).toEqual([requestId])
    expect(()=>changeTeam({name:'Production',archived:false,memberIds:['bad'],version,requestId})).toThrow()
    expect(()=>changeOrganization({name:'Studio',reservationDays:91,version,requestId})).toThrow()
  })
})
