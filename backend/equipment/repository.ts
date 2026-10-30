import {reportAlerts} from '../alerts/records'
import {createHash} from 'node:crypto'
import type {DatabaseClient} from '../database/client'
import {ApiError,object,pagination,date} from '../database/api-validation'
import {editReservation,fulfillReservation} from './validation'
import type {EquipmentRequest} from './routes'
import type {EquipmentReservation} from '../../src/types/equipment'
import {reservationColumns,eventColumns} from './columns'
type Context={organizationId:string;user:{id:string};membership:{role:string}}
export async function dispatchEquipment(client:DatabaseClient,request:EquipmentRequest,context:Context,now:()=>number){
  const {organizationId:org,user,membership}=context,admin=['owner','admin'].includes(membership.role)
  if(request.resource==='availability'){
    const q=object(request.query,['startsAt','endsAt','limit','after']),startsAt=date(q.startsAt),endsAt=date(q.endsAt),page=pagination({...(q.limit?{limit:String(q.limit)}:{}),...(q.after?{after:String(q.after)}:{})})
    if(Date.parse(endsAt)<=Date.parse(startsAt)||Date.parse(endsAt)-Date.parse(startsAt)>93*86400000)throw new ApiError(400,'Choose an availability window of up to 93 days')
    const {rows}=await client.query(`SELECT r.id,r.starts_at AS "startsAt",r.ends_at AS "endsAt",r.fulfillment_status AS "fulfillmentStatus",ARRAY(SELECT equipment_id FROM app.reservation_items i WHERE i.organization_id=r.organization_id AND i.reservation_id=r.id) AS "equipmentIds" FROM app.reservations r WHERE r.organization_id=$1 AND r.status='confirmed' AND r.fulfillment_status<>'returned' AND r.starts_at<$3 AND r.ends_at>$2 AND ($4::uuid IS NULL OR r.id>$4) ORDER BY r.id LIMIT $5`,[org,startsAt,endsAt,page.after,page.limit+1]),items=rows.slice(0,page.limit)
    return {items,nextCursor:rows.length>page.limit?items.at(-1)!.id:null}
  }
  const get=async(lock=false)=>{const row=(await client.query(`SELECT ${reservationColumns} FROM app.reservations r WHERE r.organization_id=$1 AND r.id=$2${lock?' FOR UPDATE OF r':''}`,[org,request.reservationId])).rows[0] as EquipmentReservation|undefined;if(!row||!admin&&row.userId!==user.id)throw new ApiError(404,'Reservation not found');return row}
  if(request.resource==='activity'){await get();const page=pagination(request.query),{rows}=await client.query(`SELECT ${eventColumns} FROM app.equipment_events e JOIN app.users u ON u.id=e.actor_id WHERE e.organization_id=$1 AND e.reservation_id=$2 AND ($3::uuid IS NULL OR e.id>$3) ORDER BY e.id LIMIT $4`,[org,request.reservationId,page.after,page.limit+1]),items=rows.slice(0,page.limit);return {items,nextCursor:rows.length>page.limit?items.at(-1)!.id:null}}
  const editing=request.method==='PATCH',input=editing?editReservation(request.body):fulfillReservation(request.body),hash=createHash('sha256').update(JSON.stringify({resource:request.resource,reservationId:request.reservationId,input})).digest('hex')
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`equipment:${org}:${user.id}:${input.requestId}`])
  const r=await get(true),previous=(await client.query('SELECT request_hash FROM app.equipment_events WHERE organization_id=$1 AND actor_id=$2 AND request_id=$3',[org,user.id,input.requestId])).rows[0]
  if(previous){if(previous.request_hash!==hash)throw new ApiError(409,'Request ID was used for another equipment action');return get()}
  if(r.version!==input.version||r.status!=='confirmed'||r.fulfillmentStatus==='returned')throw new ApiError(409,'Refresh the current reservation before changing it')
  const itemIds=editing?[...new Set([...r.equipmentIds,...editReservation(request.body).equipmentIds])].sort():r.equipmentIds
  const inventory=(await client.query('SELECT id,name,status,condition FROM app.inventory WHERE organization_id=$1 AND id=ANY($2::uuid[]) ORDER BY id FOR UPDATE',[org,itemIds])).rows
  let kind='',details:Record<string,unknown>={}
  if(editing){const v=editReservation(request.body),sameStart=new Date(r.startsAt).getTime()===Date.parse(v.startsAt),sameItems=JSON.stringify([...r.equipmentIds].sort())===JSON.stringify(v.equipmentIds)
    if(Date.parse(v.endsAt)<=now()||!sameStart&&Date.parse(v.startsAt)<now()||r.fulfillmentStatus==='checked_out'&&(!sameStart||!sameItems))throw new ApiError(409,'Checked-out reservations can change their end time, but cannot change their start or equipment')
    const days=(await client.query('SELECT reservation_days AS days FROM app.organizations WHERE id=$1',[org])).rows[0].days
    if(Date.parse(v.endsAt)-Date.parse(v.startsAt)>days*86400000)throw new ApiError(400,'Reservation exceeds the organization maximum length')
    if(v.equipmentIds.some(id=>!inventory.some(item=>item.id===id&&item.status==='available')))throw new ApiError(409,'Selected equipment is unavailable')
    const conflicts=await client.query(`SELECT 1 FROM app.reservation_items i JOIN app.reservations r ON r.organization_id=i.organization_id AND r.id=i.reservation_id WHERE i.organization_id=$1 AND i.equipment_id=ANY($2::uuid[]) AND r.id<>$3 AND r.status='confirmed' AND r.fulfillment_status<>'returned' AND r.starts_at<$5 AND r.ends_at>$4 LIMIT 1`,[org,v.equipmentIds,r.id,v.startsAt,v.endsAt]);if(conflicts.rows.length)throw new ApiError(409,'Equipment is reserved for the requested time')
    await client.query('UPDATE app.reservations SET name=$3,starts_at=$4,ends_at=$5,version=version+1 WHERE organization_id=$1 AND id=$2',[org,r.id,v.name,v.startsAt,v.endsAt]);await client.query('DELETE FROM app.reservation_items WHERE organization_id=$1 AND reservation_id=$2',[org,r.id]);await client.query('INSERT INTO app.reservation_items(organization_id,reservation_id,equipment_id) SELECT $1,$2,unnest($3::uuid[])',[org,r.id,v.equipmentIds]);kind='reservation_edited';details={before:{name:r.name,startsAt:r.startsAt,endsAt:r.endsAt,equipmentIds:r.equipmentIds},after:{name:v.name,startsAt:v.startsAt,endsAt:v.endsAt,equipmentIds:v.equipmentIds}}
  }else{const v=fulfillReservation(request.body),returning=request.resource==='return'
    if(JSON.stringify(v.conditions.map(c=>c.equipmentId))!==JSON.stringify([...r.equipmentIds].sort()))throw new ApiError(400,'Record the condition of every reserved item')
    if(returning?r.fulfillmentStatus!=='checked_out':r.fulfillmentStatus!=='reserved'||new Date(r.startsAt).getTime()>now()+15*60000||new Date(r.endsAt).getTime()<=now())throw new ApiError(409,'The reservation is not ready for this checkout or return')
    if(!returning){if(inventory.length!==r.equipmentIds.length||inventory.some(item=>item.status!=='available')||v.conditions.some(c=>c.condition==='damaged'))throw new ApiError(409,'Damaged or out-of-service equipment cannot be checked out');const active=await client.query('SELECT id FROM app.equipment_checkouts WHERE organization_id=$1 AND equipment_id=ANY($2::uuid[]) AND returned_at IS NULL LIMIT 1',[org,r.equipmentIds]);if(active.rows.length)throw new ApiError(409,'Equipment is still checked out on another reservation')}
    const reports:string[]=[]
    for(const c of v.conditions){
      if(returning){const result=await client.query('UPDATE app.equipment_checkouts SET returned_by=$4,returned_at=now(),return_condition=$5,return_notes=$6 WHERE organization_id=$1 AND reservation_id=$2 AND equipment_id=$3 AND returned_at IS NULL RETURNING id',[org,r.id,c.equipmentId,user.id,c.condition,c.notes]);if(result.rows.length!==1)throw new ApiError(409,'Checkout history changed. Refresh before returning equipment')}
      else await client.query('INSERT INTO app.equipment_checkouts(organization_id,reservation_id,equipment_id,checked_out_by,checkout_condition,checkout_notes) VALUES($1,$2,$3,$4,$5,$6)',[org,r.id,c.equipmentId,user.id,c.condition,c.notes])
      await client.query("UPDATE app.inventory SET condition=$3,status=CASE WHEN $3='damaged' THEN 'maintenance' ELSE status END,version=version+1 WHERE organization_id=$1 AND id=$2",[org,c.equipmentId,c.condition])
      if(returning&&c.condition==='damaged'){const item=inventory.find(i=>i.id===c.equipmentId)!;const row=(await client.query("INSERT INTO app.equipment_reports(organization_id,equipment_id,reservation_id,reported_by,title,description,severity) VALUES($1,$2,$3,$4,$5,$6,'high') RETURNING id",[org,c.equipmentId,r.id,user.id,`${item.name} returned damaged`.slice(0,120),c.notes||'Damage recorded during equipment return.'])).rows[0];reports.push(row.id);const reportHash=createHash('sha256').update(JSON.stringify({automaticReport:row.id,returnRequestId:input.requestId})).digest('hex');await client.query("INSERT INTO app.equipment_events(organization_id,actor_id,reservation_id,equipment_id,report_id,kind,details,request_id,request_hash) VALUES($1,$2,$3,$4,$5,'report_created',$6,$5,$7)",[org,user.id,r.id,c.equipmentId,row.id,{title:item.name+' returned damaged',severity:'high',source:'return'},reportHash]);await reportAlerts(client,org,row.id,row.id,user.id)}
    }
    await client.query(`UPDATE app.reservations SET fulfillment_status=$3,${returning?'returned_at':'checked_out_at'}=now(),version=version+1 WHERE organization_id=$1 AND id=$2`,[org,r.id,returning?'returned':'checked_out']);kind=returning?'returned':'checked_out';details={conditions:v.conditions,reportIds:reports}
  }
  await client.query('INSERT INTO app.equipment_events(organization_id,actor_id,reservation_id,kind,details,request_id,request_hash) VALUES($1,$2,$3,$4,$5,$6,$7)',[org,user.id,r.id,kind,details,input.requestId,hash]);return get()
}
