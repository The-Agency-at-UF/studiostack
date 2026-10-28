/** SDK tokens remain in memory and are cleared with the application session. */
const values=new Map<string,string>()
export const volatileAuthStorage={async getItem(key:string){return values.get(key)??null},async setItem(key:string,value:string){values.set(key,value)},async removeItem(key:string){values.delete(key)},async clear(){values.clear()}}
export function clearVolatileAuthState(){values.clear();if(typeof sessionStorage!=='undefined')for(const key of ['username','challengeName','signInSession','expiry'])sessionStorage.removeItem(`CognitoSignInState.${key}`)}
