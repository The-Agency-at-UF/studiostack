import {useRef,useState} from 'react'
import {HiOutlinePlus,HiOutlineArrowUpTray,HiOutlineDocumentText} from 'react-icons/hi2'
import type {ProductionBrief,BriefAttachment,AttachmentCategory} from '../../types/production'
import {attachmentCategories} from '../../types/production'
import {validBriefFile} from '../../production/uploads'

export interface BriefUploadsProps {brief:ProductionBrief;editable:boolean;disabled:boolean;preview:boolean;categories?:AttachmentCategory[];embedded?:boolean;onUpload:(files:File[],category:AttachmentCategory)=>Promise<void>;onDownload:(file:BriefAttachment)=>void;onRemove:(file:BriefAttachment)=>void;onComplete:(file:BriefAttachment)=>void}
export default function BriefUploads({brief,editable,disabled,preview,categories=Object.keys(attachmentCategories) as AttachmentCategory[],embedded=false,onUpload,onDownload,onRemove,onComplete}:BriefUploadsProps) {
 const [error,setError]=useState('')
 const upload=(files:File[],category:AttachmentCategory)=>{if(disabled||!editable||!files.length)return;if(files.some(file=>!validBriefFile(file,category))){setError('Use a supported file up to 20 MiB. Creative briefs require PDF; creative assets require PNG or JPEG.');return}if(brief.attachments.length+files.length>20){setError('A brief supports up to 20 attachments.');return}setError('');void onUpload(files,category).catch(()=>setError('The upload could not be completed. Try again, or remove the pending file.'))}
 return <div className={embedded?'production-embedded-uploads':'production-attachments'}>
 {!embedded&&<><h2>Files & creative assets</h2><p>Up to 20 files per brief, 20 MiB each. Save draft changes before uploading.</p>{preview&&<p>Preview files stay in this browser.</p>}</>}
 {categories.map(category=><UploadCategory key={category} category={category} files={brief.attachments.filter(a=>(a.category??'reference')===category)} editable={editable} disabled={disabled} onUpload={files=>upload(files,category)} onDownload={onDownload} onRemove={onRemove} onComplete={onComplete}/>)}
 {error&&<p role="alert" className="production-file-error">{error}</p>}
 </div>
}
function UploadCategory({category,files,editable,disabled,onUpload,onDownload,onRemove,onComplete}:{category:AttachmentCategory;files:BriefAttachment[];editable:boolean;disabled:boolean;onUpload:(files:File[])=>void;onDownload:(file:BriefAttachment)=>void;onRemove:(file:BriefAttachment)=>void;onComplete:(file:BriefAttachment)=>void}) {
 const input=useRef<HTMLInputElement>(null),[drag,setDrag]=useState(false),name=attachmentCategories[category]
 const formats=category==='creative_brief'?'PDF':category==='creative_assets'?'PNG or JPEG':'PDF, PNG, JPEG or WebP'
 return <section id={`brief-file-${category}`} className="production-file-category" aria-label={name}>
  <div className="production-file-heading"><h4>{name}</h4><span>{formats}</span></div>
  {files.length>0&&<ul className="production-file-list">{files.map(file=><li key={file.id}><HiOutlineDocumentText aria-hidden="true"/><div className="production-file-name"><strong>{file.name}</strong><small>{Math.ceil(file.size/1024)} KB · {file.status==='ready'?'Uploaded':'Pending upload'}</small></div><div className="production-file-actions">{file.status==='ready'?<button type="button" disabled={disabled} onClick={()=>onDownload(file)}>Download</button>:editable&&<button type="button" disabled={disabled} onClick={()=>onComplete(file)}>Finish upload</button>}{editable&&<button type="button" disabled={disabled} onClick={()=>onRemove(file)}>Remove attachment</button>}</div></li>)}</ul>}
  {editable?<div className={`production-dropzone ${drag?'is-dragging':''}`} onDragOver={e=>{e.preventDefault();if(!disabled)setDrag(true)}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);if(!disabled)onUpload(Array.from(e.dataTransfer.files))}}><HiOutlineArrowUpTray aria-hidden="true"/><span>Drop files here</span><button type="button" disabled={disabled} aria-label={`Upload ${name}`} onClick={()=>input.current?.click()}><HiOutlinePlus aria-hidden="true"/>Choose files</button><input ref={input} type="file" multiple hidden disabled={disabled} aria-label={`Choose files for ${name}`} accept={category==='creative_brief'?'application/pdf':category==='creative_assets'?'image/png,image/jpeg':'application/pdf,image/jpeg,image/png,image/webp'} onChange={e=>{const files=Array.from(e.target.files??[]);e.target.value='';onUpload(files)}}/></div>:!files.length&&<p className="production-file-empty">No files attached.</p>}
 </section>
}
