import {visibleSections,type BriefData,type AttachmentCategory} from '../../types/production'
import {SectionFields} from './BriefFields'
import BriefUploads,{type BriefUploadsProps} from './BriefUploads'

type Section=ReturnType<typeof visibleSections>[number]
const filesByField:Record<string,AttachmentCategory[]>={summary:['creative_brief'],concept:['storyboard'],references:['reference'],brandLink:['brand_guidelines'],brandElements:['creative_assets']}
/** Keep documents with the questions they support, including on read-only briefs. */
export default function BriefSection({section,data,editable,busy,uploads,onChange,showErrors=false,hideLegend=false}:{showErrors?:boolean;hideLegend?:boolean;section:Section;data:BriefData;editable:boolean;busy:boolean;uploads:BriefUploadsProps;onChange:(key:string,value:string)=>void}) {
 const field=(f:Section['fields'][number])=><SectionFields section={{...section,fields:[f]}} form={data} onField={onChange} disabled={!editable||busy} showErrors={showErrors}/>
 const file=(category:AttachmentCategory)=><BriefUploads {...uploads} categories={[category]} embedded/>
 return <fieldset id={`brief-${section.title.toLowerCase().replaceAll(' ','-')}`} disabled={busy}><legend className={hideLegend?'sr-only':undefined}>{section.title}</legend>
  {section.title==='Paperwork'?<><p className="production-paperwork-note">Complete only the documents this production needs. Official templates are at the top of the brief.</p><div className="production-paperwork-grid">
   <div className="production-paperwork-item">{field(section.fields.find(f=>f.key==='permits')!)}{file('location_agreement')}</div>
   <div className="production-paperwork-item">{field(section.fields.find(f=>f.key==='releases')!)}{field(section.fields.find(f=>f.key==='releaseProvider')!)}{file('release')}</div>
   <div className="production-paperwork-item">{file('shot_list')}</div>
   <div className="production-paperwork-item">{file('consent')}</div>
  </div></>:<SectionFields section={section} form={data} onField={onChange} disabled={!editable||busy} showErrors={showErrors} afterField={key=>filesByField[key]&&<div className="production-wide"><BriefUploads {...uploads} categories={filesByField[key]} embedded/></div>}/>}

 </fieldset>
}
