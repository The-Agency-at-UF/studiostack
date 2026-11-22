import type {DeviceLocation} from '../types/campus'
/** Why the browser gave no location: the person (or the browser's settings) refused, it can't locate, or it has no location support. */
export type LocationFailure='denied'|'unavailable'|'unsupported'
export class LocationError extends Error {constructor(message:string,public readonly reason:LocationFailure='unavailable'){super(message)}}
/** Asks the browser for a fresh, precise fix. Browsers only allow this over HTTPS or localhost. */
export function currentLocation(timeout=15000):Promise<DeviceLocation>{
  if(typeof navigator==='undefined'||!navigator.geolocation)return Promise.reject(new LocationError('This browser can’t share its location. Use a phone or browser with location services to check equipment out or in.','unsupported'))
  return new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(
    ({coords})=>resolve({latitude:coords.latitude,longitude:coords.longitude,accuracy:coords.accuracy}),
    error=>reject(error.code===error.PERMISSION_DENIED
      ?new LocationError('Location access is off for StudioStack, so we can’t confirm you’re on campus.','denied')
      :new LocationError('Your location couldn’t be determined. Move near a window or turn on location services, then try again.','unavailable')),
    {enableHighAccuracy:true,timeout,maximumAge:60000}))
}
