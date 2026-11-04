import type {DeviceLocation} from '../types/campus'
export class LocationError extends Error {}
/** Asks the browser for a fresh, precise fix. Browsers only allow this over HTTPS or localhost. */
export function currentLocation(timeout=15000):Promise<DeviceLocation>{
  if(typeof navigator==='undefined'||!navigator.geolocation)return Promise.reject(new LocationError('This browser cannot share its location. Use a phone or browser with location services to check equipment out or in.'))
  return new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(
    ({coords})=>resolve({latitude:coords.latitude,longitude:coords.longitude,accuracy:coords.accuracy}),
    error=>reject(new LocationError(error.code===error.PERMISSION_DENIED?'Allow location access for StudioStack to confirm you are on campus, then try again.':'Your location could not be determined. Move near a window or turn on location services, then try again.')),
    {enableHighAccuracy:true,timeout,maximumAge:60000}))
}
