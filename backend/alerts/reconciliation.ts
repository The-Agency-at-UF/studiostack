import {inTransaction,type DatabaseClient} from '../database/client'
import {setOrganization} from '../database/leased-outbox'
import {object} from '../database/api-validation'
import {reconcileAlerts} from './records'

/** A single scheduled sweep advances a bounded number of pages independently of mail claims. */
export async function reconcileAlertsTask(client:DatabaseClient,input:unknown){
  object(input,[])
  return inTransaction(client,async()=>{
    await client.query('INSERT INTO app.alert_reconciliation_cursor(singleton) VALUES(true) ON CONFLICT DO NOTHING')
    const {rows:[cursor]}=await client.query(`SELECT organization_id,reservation_after,brief_after
      FROM app.alert_reconciliation_cursor WHERE singleton FOR UPDATE SKIP LOCKED`)
    if(!cursor)return {created:0}
    let org=cursor.organization_id as string|null
    let reservationAfter=cursor.reservation_after as string|null
    let briefAfter=cursor.brief_after as string|null
    let created=0
    for(let page=0;page<10;page++){
      const {rows:[current]}=await client.query<{id:string}>(`SELECT id FROM app.organizations
        WHERE ($1::uuid IS NULL OR id>$1 OR ($2 AND id=$1)) ORDER BY id LIMIT 1`,[org,reservationAfter!==null||briefAfter!==null])
      if(!current){org=null;reservationAfter=null;briefAfter=null;break}
      if(current.id!==org){reservationAfter=null;briefAfter=null}
      org=current.id
      await setOrganization(client,org)
      const batch=await reconcileAlerts(client,org,reservationAfter,briefAfter,50)
      created+=batch.created
      reservationAfter=batch.done?null:batch.reservationAfter
      briefAfter=batch.done?null:batch.briefAfter
    }
    await client.query(`UPDATE app.alert_reconciliation_cursor SET organization_id=$1,reservation_after=$2,brief_after=$3 WHERE singleton`,
      [org,reservationAfter,briefAfter])
    return {created}
  })
}
