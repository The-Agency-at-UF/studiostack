import {reportAlerts} from '../alerts/records'
import type {DatabaseClient} from '../database/client'
import {ApiError,object,uuid} from '../database/api-validation'
import {createReport,updateReport,notes} from './validation'
import {eventColumns} from './columns'
import type {ReportRequest} from './report-routes'
import {isAdmin,pageOf,requestHash} from '../database/repository-utils'
const columns='id,equipment_id AS "equipmentId",reservation_id AS "reservationId",reported_by AS "reportedBy",title,description,severity,status,resolution,resolved_by AS "resolvedBy",resolved_at AS "resolvedAt",version,created_at AS "createdAt",updated_at AS "updatedAt"'
type Context={organizationId:string;user:{id:string};membership:{role:string}}
export async function dispatchReports(client:DatabaseClient,request:ReportRequest,{organizationId:org,user,membership}:Context){
  const admin=isAdmin(membership.role),get=async(id:string,lock=false)=>{const row=(await client.query('SELECT '+columns+' FROM app.equipment_reports WHERE organization_id=$1 AND id=$2'+(lock?' FOR UPDATE':''),[org,id])).rows[0];if(!row)throw new ApiError(404,'Report not found');return row}
  const event=async(id:string)=>(await client.query('SELECT '+eventColumns+' FROM app.equipment_events e JOIN app.users u ON u.id=e.actor_id WHERE e.organization_id=$1 AND e.id=$2',[org,id])).rows[0]
  if(request.method==='GET'){
    const page=request.page
    if(request.reportId)await get(request.reportId)
    if(request.reportId&&!request.activity)return get(request.reportId)
    const {rows}=request.activity?await client.query('SELECT '+eventColumns+' FROM app.equipment_events e JOIN app.users u ON u.id=e.actor_id WHERE e.organization_id=$1 AND e.report_id=$2 AND ($3::uuid IS NULL OR e.id>$3) ORDER BY e.id LIMIT $4',[org,request.reportId,page.after,page.limit+1]):await client.query('SELECT '+columns+' FROM app.equipment_reports WHERE organization_id=$1 AND ($2::uuid IS NULL OR id>$2) ORDER BY id LIMIT $3',[org,page.after,page.limit+1])
    return pageOf(rows,page.limit)
  }
  if(request.method==='PATCH'&&!admin)throw new ApiError(403,'Only production administrators can resolve reports')
  const input=request.activity?(()=>{const v=object(request.body,['message','requestId']);return {message:notes(v.message,4000,true),requestId:uuid(v.requestId)}})():request.method==='PATCH'?updateReport(request.body):createReport(request.body)
  const hash=requestHash({reportId:request.reportId,method:request.method,activity:request.activity,input})
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['equipment:'+org+':'+user.id+':'+input.requestId])
  const previous=(await client.query('SELECT id,request_hash,report_id FROM app.equipment_events WHERE organization_id=$1 AND actor_id=$2 AND request_id=$3',[org,user.id,input.requestId])).rows[0]
  if(previous){if(previous.request_hash!==hash)throw new ApiError(409,'Request ID was used for another equipment action');return request.activity?event(previous.id):get(previous.report_id)}
  let reportId=request.reportId,kind='',details:Record<string,unknown>={},equipmentId:string|undefined,reservationId:string|null=null
  if(request.activity){const current=await get(reportId!);equipmentId=current.equipmentId;reservationId=current.reservationId;kind='report_comment';details={message:(input as {message:string}).message}}
  else if(request.method==='POST'){
    const v=createReport(request.body),item=(await client.query('SELECT id,status FROM app.inventory WHERE organization_id=$1 AND id=$2 FOR UPDATE',[org,v.equipmentId])).rows[0];if(!item)throw new ApiError(404,'Equipment not found')
    if(v.reservationId){const r=(await client.query('SELECT user_id FROM app.reservations WHERE organization_id=$1 AND id=$2',[org,v.reservationId])).rows[0],linked=await client.query('SELECT 1 FROM app.reservation_items WHERE organization_id=$1 AND reservation_id=$2 AND equipment_id=$3',[org,v.reservationId,v.equipmentId]);if(!r||!admin&&r.user_id!==user.id||!linked.rows.length)throw new ApiError(404,'Linked reservation is unavailable')}
    reportId=(await client.query('INSERT INTO app.equipment_reports(organization_id,equipment_id,reservation_id,reported_by,title,description,severity) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',[org,v.equipmentId,v.reservationId??null,user.id,v.title,v.description,v.severity])).rows[0].id
    equipmentId=v.equipmentId;reservationId=v.reservationId??null;kind='report_created';details={title:v.title,severity:v.severity}
    if(v.severity==='high')await client.query("UPDATE app.inventory SET status=CASE WHEN status='retired' THEN status ELSE 'maintenance' END,version=version+1 WHERE organization_id=$1 AND id=$2",[org,equipmentId])
  }else{
    const v=updateReport(request.body),current=await get(reportId!,true);if(current.version!==v.version)throw new ApiError(409,'Report changed. Refresh before resolving it')
    equipmentId=current.equipmentId;reservationId=current.reservationId
    await client.query('SELECT id FROM app.inventory WHERE organization_id=$1 AND id=$2 FOR UPDATE',[org,equipmentId])
    if(v.restoreService){if(!v.condition||v.condition==='damaged')throw new ApiError(400,'Choose a repaired condition before restoring service');const others=await client.query("SELECT id FROM app.equipment_reports WHERE organization_id=$1 AND equipment_id=$2 AND id<>$3 AND status<>'resolved' AND severity='high' LIMIT 1",[org,equipmentId,reportId]);if(others.rows.length)throw new ApiError(409,'Resolve other high-severity reports before restoring service')}
    await client.query("UPDATE app.equipment_reports SET status=$3,resolution=$4,resolved_by=CASE WHEN $3='resolved' THEN $5::uuid ELSE NULL END,resolved_at=CASE WHEN $3='resolved' THEN now() ELSE NULL END,version=version+1,updated_at=now() WHERE organization_id=$1 AND id=$2",[org,reportId,v.status,v.resolution,user.id])
    if(v.restoreService)await client.query("UPDATE app.inventory SET status='available',condition=$3,version=version+1 WHERE organization_id=$1 AND id=$2",[org,equipmentId,v.condition])
    else if(v.status!=='resolved'&&current.severity==='high')await client.query("UPDATE app.inventory SET status=CASE WHEN status='retired' THEN status ELSE 'maintenance' END,version=version+1 WHERE organization_id=$1 AND id=$2",[org,equipmentId])
    kind='report_updated';details={fromStatus:current.status,status:v.status,resolution:v.resolution,restoreService:v.restoreService,...(v.condition?{condition:v.condition}:{})}
  }
  const added=(await client.query('INSERT INTO app.equipment_events(organization_id,actor_id,reservation_id,equipment_id,report_id,kind,details,request_id,request_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',[org,user.id,reservationId,equipmentId,reportId,kind,details,input.requestId,hash])).rows[0]
  await reportAlerts(client,org,reportId!,added.id,user.id)
  return request.activity?event(added.id):get(reportId!)
}
