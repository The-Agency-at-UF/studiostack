export interface AppAlert {id:string;kind:'overdue_equipment'|'report_update'|'reservation_conflict';title:string;message:string;targetPath:string;createdAt:string;readAt:string|null;emailStatus:'skipped'|'pending'|'sending'|'sent'|'failed'|'uncertain'|'suppressed'}
export interface AlertPreferences {equipmentEmail:boolean;version:number}
