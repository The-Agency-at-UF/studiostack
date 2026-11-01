import {createHash} from 'node:crypto'
/** Crockford base32 without ambiguous letters; I/L read as 1 and O as 0 so spoken codes still match. */
export const joinCodeAlphabet='0123456789ABCDEFGHJKMNPQRSTVWXYZ',joinCodeLength=10
export function normalizeJoinCode(value:string):string|null {
  const code=value.toUpperCase().replace(/[\s-]/g,'').replace(/[IL]/g,'1').replace(/O/g,'0')
  return code.length===joinCodeLength&&[...code].every(c=>joinCodeAlphabet.includes(c))?code:null
}
export const joinCodeHash=(code:string)=>createHash('sha256').update(`studiostack-join:${code}`).digest('hex')
/** The verified email's domain and each parent domain, so user@cise.ufl.edu matches ufl.edu. */
export function emailDomains(email:string):string[] {
  const labels=email.slice(email.lastIndexOf('@')+1).toLowerCase().split('.')
  return labels.slice(0,-1).map((_,i)=>labels.slice(i).join('.'))
}
