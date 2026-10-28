// @vitest-environment node
import {describe,expect,it} from 'vitest'
import {changeMember,changeOrganization,changeTeam,inviteMember} from '../../backend/accounts/validation'
const requestId='11111111-1111-4111-8111-111111111111',version=1
describe('account administration inputs',()=>{
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
