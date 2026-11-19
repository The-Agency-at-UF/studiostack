import {productionReadiness} from '../../src/production/readiness'
import type {ProductionBrief} from '../../src/types/production'
import type {DatabaseClient} from '../database/client'
export async function reportAlerts(client:DatabaseClient,org:string,reportId:string,eventId:string,actorId:string){
 await client.query(`INSERT INTO app.user_alerts(organization_id,recipient_id,kind,title,message,target_path,dedupe_key,email_status)
 SELECT $1,m.user_id,'report_update',left('Report update: '||r.title,160),'An equipment report has new activity. Open it to review the discussion and current status.','/report-summary/?report='||r.id,'report:'||$3,CASE WHEN p.equipment_email THEN 'pending' ELSE 'skipped' END
 FROM app.equipment_reports r JOIN app.organization_memberships m ON m.organization_id=r.organization_id
 LEFT JOIN app.alert_preferences p ON p.organization_id=m.organization_id AND p.user_id=m.user_id
 WHERE r.organization_id=$1 AND r.id=$2 AND m.status='active' AND m.user_id<>$4 AND (m.role IN ('owner','admin') OR m.user_id=r.reported_by OR EXISTS(SELECT 1 FROM app.equipment_events e WHERE e.organization_id=$1 AND e.report_id=r.id AND e.actor_id=m.user_id))
 ON CONFLICT(organization_id,recipient_id,dedupe_key) DO NOTHING`,[org,reportId,eventId,actorId])
}
/** Called by the IAM sweep and when a member opens alerts; inserts are deduplicated. */
export async function reconcileAlerts(client:DatabaseClient,org:string){
 const overdue=await client.query(`INSERT INTO app.user_alerts(organization_id,recipient_id,kind,title,message,target_path,dedupe_key,email_status)
 SELECT $1,m.user_id,'overdue_equipment','Equipment return overdue',left(r.name||' has equipment checked out past its return time.',1000),'/check-in-out/?reservation='||r.id,'overdue:'||r.id||':'||to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD'),CASE WHEN p.equipment_email THEN 'pending' ELSE 'skipped' END
 FROM app.reservations r JOIN app.organization_memberships m ON m.organization_id=r.organization_id
 LEFT JOIN app.alert_preferences p ON p.organization_id=m.organization_id AND p.user_id=m.user_id
 WHERE r.organization_id=$1 AND r.status='confirmed' AND r.fulfillment_status='checked_out' AND r.ends_at<now() AND m.status='active' AND (m.user_id=r.user_id OR m.role IN ('owner','admin'))
 ON CONFLICT(organization_id,recipient_id,dedupe_key) DO NOTHING RETURNING id`,[org])
 const conflicts=await client.query(`INSERT INTO app.user_alerts(organization_id,recipient_id,kind,title,message,target_path,dedupe_key,email_status)
 SELECT DISTINCT $1::uuid,m.user_id,'reservation_conflict','Reserved equipment needs attention',left(i.name||' is out of service or overdue on another checkout. Review '||r.name||' before pickup.',1000),'/reservations/?reservation='||r.id,'conflict:'||r.id||':'||i.id||':'||i.version||':'||coalesce(ec.reservation_id::text,'service'),CASE WHEN p.equipment_email THEN 'pending' ELSE 'skipped' END
 FROM app.reservations r JOIN app.reservation_items ri ON ri.organization_id=r.organization_id AND ri.reservation_id=r.id JOIN app.inventory i ON i.organization_id=ri.organization_id AND i.id=ri.equipment_id
 LEFT JOIN app.equipment_checkouts ec ON ec.organization_id=i.organization_id AND ec.equipment_id=i.id AND ec.returned_at IS NULL AND ec.reservation_id<>r.id AND EXISTS(SELECT 1 FROM app.reservations old WHERE old.organization_id=ec.organization_id AND old.id=ec.reservation_id AND old.ends_at<now())
 JOIN app.organization_memberships m ON m.organization_id=r.organization_id LEFT JOIN app.alert_preferences p ON p.organization_id=m.organization_id AND p.user_id=m.user_id
 WHERE r.organization_id=$1 AND r.status='confirmed' AND r.fulfillment_status='reserved' AND r.ends_at>now() AND (i.status<>'available' OR ec.id IS NOT NULL) AND m.status='active' AND (m.user_id=r.user_id OR m.role IN ('owner','admin'))
 ON CONFLICT(organization_id,recipient_id,dedupe_key) DO NOTHING RETURNING id`,[org])
 const candidates=(await client.query(`SELECT b.id,b.owner_id AS "ownerId",b.status,b.data,b.soft_holds AS "softHolds",b.shoot_starts_at AS "shootStartsAt",b.shoot_ends_at AS "shootEndsAt",coalesce((SELECT jsonb_agg(jsonb_build_object('userId',a.user_id,'crewRequestId',a.crew_request_id)) FROM app.production_assignments a JOIN app.organization_memberships am ON am.organization_id=a.organization_id AND am.user_id=a.user_id WHERE a.organization_id=b.organization_id AND a.brief_id=b.id AND am.status='active'),'[]'::jsonb) AS crew FROM app.production_briefs b WHERE b.organization_id=$1 AND b.deleted_at IS NULL AND b.status IN ('submitted','changes_requested','approved')`,[org])).rows
 let readinessCount=0
 for(const candidate of candidates){
  const b=candidate as ProductionBrief,readiness=productionReadiness(b)
  if(!readiness.flagged)continue
  const result=await client.query(`INSERT INTO app.user_alerts(organization_id,recipient_id,kind,title,message,target_path,dedupe_key)
   SELECT $1,m.user_id,'production_readiness','Shoot readiness needs attention',$3,'/production/?brief='||$2,$4 FROM app.organization_memberships m
   WHERE m.organization_id=$1 AND m.status='active' AND (m.user_id=$5 OR m.role IN ('owner','admin'))
   ON CONFLICT(organization_id,recipient_id,dedupe_key) DO NOTHING RETURNING id`,[org,b.id,`${b.data.projectName}: ${readiness.missing.join(', ')}. Shoot is within 3 days.`.slice(0,1000),`readiness:${b.id}:${new Date().toISOString().slice(0,10)}:${readiness.missing.join(':')}`,b.ownerId])
  readinessCount+=result.rows.length
 }
 return overdue.rows.length+conflicts.rows.length+readinessCount
}
