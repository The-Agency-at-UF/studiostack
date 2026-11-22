import type {ApiPage} from '../types/database-api'

/** Sends a request relative to one organization-scoped API prefix. */
export type Send = <T>(path: string, method?: string, body?: unknown) => Promise<T>
/** Query string for the next page of up to 100 records after a keyset cursor. */
export const pageQuery = (after?: string) => '?' + new URLSearchParams({ limit: '100', ...(after ? { after } : {}) })


export async function allPages<T>(load:(after?:string)=>Promise<ApiPage<T>>):Promise<T[]>{
  const items:T[]=[]
  const seen=new Set<string>()
  let after:string|undefined
  do{
    const page=await load(after)
    items.push(...page.items)
    after=page.nextCursor??undefined
    if(after){
      if(seen.has(after))throw new Error('API pagination did not advance')
      seen.add(after)
    }
  }while(after)
  return items
}
