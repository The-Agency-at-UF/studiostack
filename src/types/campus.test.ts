// @vitest-environment node
import {describe,expect,it} from 'vitest'
import {agencyCampus,campusProximity,campusProximityMessage,distanceMeters} from './campus'
const at=(latitude:number,longitude:number,accuracy=20)=>({latitude,longitude,accuracy})
describe('Campus proximity',()=>{
 it('measures great-circle distance in meters',()=>{expect(distanceMeters(agencyCampus,agencyCampus)).toBe(0);expect(distanceMeters(at(29.6481,-82.3479),at(29.6571,-82.3479))).toBeCloseTo(1001,-1)})
 it('allows devices at The Agency and elsewhere on main campus',()=>{expect(campusProximity(at(agencyCampus.latitude,agencyCampus.longitude))).toEqual({allowed:true,distanceMeters:0});expect(campusProximity(at(29.6436,-82.3549)).allowed).toBe(true)})
 it('refuses devices off campus with a distance in miles',()=>{const result=campusProximity(at(29.6516,-82.3248));expect(result).toMatchObject({allowed:false,reason:'too_far'});if(!result.allowed)expect(campusProximityMessage(result)).toMatch(/The Agency at UF\. You appear to be 1\.4 miles away/)})
 it('refuses fixes too imprecise to place the device on campus',()=>{const result=campusProximity(at(agencyCampus.latitude,agencyCampus.longitude,5000));expect(result).toMatchObject({allowed:false,reason:'imprecise'});if(!result.allowed)expect(campusProximityMessage(result)).toContain('precise location')})
})
