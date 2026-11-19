import type {AttachmentCategory} from '../types/production'
export const validBriefFile=(file:File,category:AttachmentCategory)=>file.size>0&&file.size<=20*1024*1024&&(category==='creative_brief'?file.type==='application/pdf':category==='creative_assets'?['image/png','image/jpeg'].includes(file.type):['application/pdf','image/jpeg','image/png','image/webp'].includes(file.type))
