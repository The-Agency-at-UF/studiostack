/** Browser-only records. No credentials, network client, or production identifiers. */
const memory = new Map<string, string>()
export function readPreview<T>(key:string,initial:()=>T):T {
  let raw:string|null|undefined
  try { raw=globalThis.localStorage?.getItem(key) } catch { raw=memory.get(key) }
  if(typeof globalThis.localStorage?.getItem!=='function')raw=memory.get(key)
  if(raw)try{return JSON.parse(raw) as T}catch{/* Preserve the old value; a write replaces it only after a successful action. */}
  return initial()
}
export function writePreview(key:string,value:unknown){
 const json=JSON.stringify(value)
 if(typeof globalThis.localStorage?.setItem!=='function'){memory.set(key,json);return}
 // Surface quota errors instead of telling the user an unsaved action succeeded.
 globalThis.localStorage.setItem(key,json)
}
