// @vitest-environment node
import {afterEach,describe,expect,it,vi} from 'vitest'
import {CopyObjectCommand,GetObjectCommand,HeadObjectCommand,S3Client} from '@aws-sdk/client-s3'
import {createPhotoStorage} from '../../backend/database/photo-storage'
import {createBriefStorage} from '../../backend/production/storage'

const organizationId='11dbfa8a-a7fb-43aa-8b2d-dcb544d07042'
const id='dd7fa0de-a020-4220-82d6-d4d8f6144488'
const bucket='studio-stack-photos-dev'
const absent=()=>Object.assign(new Error('Staging object expired'),{name:'NoSuchKey'})
const photo={id,organizationId,stagingKey:`staging/${organizationId}/${id}.jpg`,contentType:'image/jpeg' as const,inputSize:501}
const photoKey=`photos/${organizationId}/${id}.jpg`
const brief={key:`briefs/${organizationId}/${id}/${id}`,size:500,contentType:'application/pdf'}
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs()})

describe('LOGIC-018 private finalization recovery',()=>{
  it('recovers a finalized photo after staging expires',async()=>{
    const send=vi.spyOn(S3Client.prototype,'send').mockImplementation(async command=>{
      if(command instanceof HeadObjectCommand&&command.input.Key===photoKey)return {
        ContentLength:400,ContentType:'image/jpeg',ETag:'final-photo',Metadata:{width:'80',height:'60',sha256:'a'.repeat(64)}
      }
      throw absent()
    })
    await expect(createPhotoStorage({region:'us-east-2',bucket}).finalize(photo)).resolves.toEqual({
      key:photoKey,size:400,width:80,height:60,sha256:'a'.repeat(64)
    })
    expect(send.mock.calls.some(([c])=>c instanceof GetObjectCommand)).toBe(false)
  })

  it('recovers a verified attachment without another copy',async()=>{
    vi.stubEnv('STUDIOSTACK_ENV','dev');vi.stubEnv('S3_PHOTOS_BUCKET',bucket)
    const send=vi.spyOn(S3Client.prototype,'send').mockImplementation(async command=>{
      if(command instanceof HeadObjectCommand&&command.input.Key===brief.key)return {ContentLength:brief.size,ContentType:brief.contentType,ETag:'final',ContentDisposition:'attachment'}
      throw absent()
    })
    await expect(createBriefStorage().verify(brief)).resolves.toBeUndefined()
    expect(send.mock.calls.some(([c])=>c instanceof CopyObjectCommand)).toBe(false)
  })
})
