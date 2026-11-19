import {cleanup,render,screen,within} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {afterEach,expect,it,vi} from 'vitest'
import BriefSection from './BriefSection'
import {attachmentCategories,emptyBrief,visibleSections,type AttachmentCategory,type ProductionBrief} from '../../types/production'

afterEach(cleanup)
it('keeps every existing attachment accessible in its matching section on a read-only brief',async()=>{
 const data=emptyBrief(),download=vi.fn(),submit=vi.fn(),categories=Object.keys(attachmentCategories) as AttachmentCategory[]
 const brief:ProductionBrief={id:'brief',organizationId:'org',ownerId:'author',ownerName:'Author',status:'submitted',version:1,submission:1,data,shootStartsAt:null,shootEndsAt:null,createdAt:'2026-11-18',updatedAt:'2026-11-18',events:[],attachments:categories.map(category=>({id:category,name:`${category}.pdf`,category,contentType:'application/pdf',size:100,status:'ready',uploadedBy:'author'}))}
 const uploads={brief,editable:false,disabled:false,preview:true,onDownload:download,onUpload:vi.fn(),onRemove:vi.fn(),onComplete:vi.fn()}
 render(<form onSubmit={e=>{e.preventDefault();submit()}}>{visibleSections(data).map(section=><BriefSection key={section.title} section={section} data={data} editable={false} busy={false} uploads={uploads} onChange={vi.fn()}/>)}</form>)
 const user=userEvent.setup()
 for(const category of categories){
  const group=screen.getByRole('region',{name:attachmentCategories[category]})
  const expected=category==='creative_brief'?'brief-project-overview':['shot_list','release','location_agreement','consent'].includes(category)?'brief-paperwork':'brief-creative-direction'
  expect(group.closest('fieldset')).toHaveAttribute('id',expected)
  const button=within(group).getByRole('button',{name:'Download'});expect(button).toBeEnabled();await user.click(button)
 }
 expect(download).toHaveBeenCalledTimes(categories.length);expect(submit).not.toHaveBeenCalled()
 expect(screen.getByLabelText('Brand guidelines link')).toBeDisabled()
 expect(screen.queryByRole('button',{name:/Upload /})).not.toBeInTheDocument()
})
