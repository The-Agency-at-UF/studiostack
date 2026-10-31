// @vitest-environment node
import {describe,expect,it} from 'vitest'
import {changeMember,changeOrganization,changeTeam,inviteMember} from '../../backend/accounts/validation'
import {directoryRequest} from '../../backend/accounts/directory'
import {emailDomains,joinCodeHash,normalizeJoinCode} from '../../backend/accounts/join-codes'
import {addDomain,createJoinCode,publicEmailDomains} from '../../backend/accounts/join-methods'
const requestId='11111111-1111-4111-8111-111111111111',version=1
describe('account administration inputs',()=>{
  it('bounds IAM directory attestations to the configured pool and invitation organization',()=>{
    const identity={issuer:'https://cognito-idp.us-east-2.amazonaws.com/us-east-2_test',subject:requestId,email:'a@example.org'}
    expect(directoryRequest({action:'accept',identity,organizationId:requestId,invitationId:requestId},'us-east-2_test')).toMatchObject({organizationId:requestId})
    expect(()=>directoryRequest({action:'accept',identity,invitationId:requestId},'us-east-2_test')).toThrow()
    expect(()=>directoryRequest({action:'list',identity:{...identity,issuer:'https://wrong.example'}},'us-east-2_test')).toThrow()
    expect(()=>directoryRequest({action:'list',identity:{...identity,isAdmin:true}},'us-east-2_test')).toThrow()
  })
  it('requires each onboarding action\'s own fields and drops the rest',()=>{
    const identity={issuer:'https://cognito-idp.us-east-2.amazonaws.com/us-east-2_test',subject:requestId,email:'Person@Example.org'}
    expect(directoryRequest({action:'overview',identity,organizationId:requestId},'us-east-2_test')).toEqual({action:'overview',identity:{...identity,email:'person@example.org'}})
    expect(directoryRequest({action:'join-code',identity,code:'ABCD-EFGH-JK'},'us-east-2_test')).toMatchObject({code:'ABCD-EFGH-JK'})
    expect(()=>directoryRequest({action:'join-code',identity},'us-east-2_test')).toThrow()
    expect(()=>directoryRequest({action:'join-domain',identity},'us-east-2_test')).toThrow()
    expect(()=>directoryRequest({action:'request-access',identity,organizationId:requestId,message:'x'.repeat(501)},'us-east-2_test')).toThrow()
    expect(()=>directoryRequest({action:'withdraw-request',identity,organizationId:requestId},'us-east-2_test')).toThrow()
    expect(()=>directoryRequest({action:'promote',identity},'us-east-2_test')).toThrow()
  })
  it('normalizes join codes and matches verified email domains up to their parents',()=>{
    expect(normalizeJoinCode(' abcd-efgh-jk ')).toBe('ABCDEFGHJK')
    expect(normalizeJoinCode('ilo0-0000-00')).toBe('1100000000')
    expect(normalizeJoinCode('ABCDEFGHJ')).toBeNull();expect(normalizeJoinCode('ABCDEFGHJU')).toBeNull()
    expect(joinCodeHash('ABCDEFGHJK')).toMatch(/^[a-f0-9]{64}$/);expect(joinCodeHash('ABCDEFGHJK')).not.toBe(joinCodeHash('ABCDEFGHJM'))
    expect(emailDomains('a@cise.UFL.edu')).toEqual(['cise.ufl.edu','ufl.edu'])
    expect(emailDomains('a@example.org')).toEqual(['example.org'])
  })
  it('validates join-method administration inputs',()=>{
    expect(addDomain({domain:' @Studio.Example.EDU ',autoJoin:false,requestId})).toEqual({domain:'studio.example.edu',autoJoin:false,requestId})
    for(const domain of ['localhost','studio..edu','https://studio.example.edu'])expect(()=>addDomain({domain,autoJoin:true,requestId})).toThrow()
    expect(()=>addDomain({domain:'studio.example.edu',requestId})).toThrow()
    expect(createJoinCode({label:'Fall crew',requestId})).toEqual({label:'Fall crew',maxUses:null,expiresInDays:null,requestId})
    for(const extra of [{maxUses:0},{maxUses:1.5},{expiresInDays:366},{role:'admin'}])expect(()=>createJoinCode({label:'Crew',requestId,...extra})).toThrow()
    expect(publicEmailDomains.has('gmail.com')).toBe(true);expect(publicEmailDomains.has('ufl.edu')).toBe(false)
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
