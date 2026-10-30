/** Cognito SDK state is namespaced per website; no app data is stored here. */
const prefix='studiostack.cognito.'
const values=new Map<string,string>()
export const volatileAuthStorage={
 async getItem(key:string){try{const storage=globalThis.localStorage;return storage?storage.getItem(prefix+key):values.get(key)??null}catch{return values.get(key)??null}},
 async setItem(key:string,value:string){values.set(key,value);try{globalThis.localStorage?.setItem(prefix+key,value)}catch{/* In-memory fallback */}},
 async removeItem(key:string){values.delete(key);try{globalThis.localStorage?.removeItem(prefix+key)}catch{/* In-memory fallback */}},
 async clear(){clearVolatileAuthState()},
}
export function clearVolatileAuthState(){
 values.clear()
 try{const storage=globalThis.localStorage;for(let i=storage.length-1;i>=0;i--){const key=storage.key(i);if(key?.startsWith(prefix))storage.removeItem(key)}}catch{/* Storage unavailable */}
 if(typeof sessionStorage!=='undefined')for(const key of ['username','challengeName','signInSession','expiry'])sessionStorage.removeItem(`CognitoSignInState.${key}`)
}
