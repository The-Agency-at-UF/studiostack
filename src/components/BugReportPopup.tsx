import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { closeWithExit } from './workspace/closeWithExit';
import {useAppSession} from '../context/AppSessionContext';
import {createDatabaseApiClient,DatabaseApiClientError} from '../api/database';
import {errorText} from '../api/errorText';
import {authConfiguration} from '../auth/cognito';
import type {ApiBugReport,FeedbackKind} from '../types/database-api';
import { HiOutlineBugAnt, HiOutlineLightBulb, HiOutlineXMark, HiOutlineCheckCircle, HiOutlineExclamationCircle } from "react-icons/hi2";
import {createPreviewDatabaseApi} from '../preview/database';
import { db, collection, addDoc, serverTimestamp } from '../data/localStore';
import { dateLabel } from '../format'

const copy = {
  bug: { Icon: HiOutlineBugAnt, trigger: 'Report a bug', heading: 'Report a bug', history: 'Your submitted reports', empty: 'No reports yet.', titlePlaceholder: 'What happened?', submit: 'Submit report', success: 'Report submitted', previewThanks: 'This is a local preview, so the report was saved in this browser only and no one was notified.', thanks: 'Thank you for your feedback. Our team has been notified and will look into this issue.', failure: 'Failed to submit bug report. Please try again later.', collection: 'bugReports' },
  feature: { Icon: HiOutlineLightBulb, trigger: 'Request a feature', heading: 'Request a feature', history: 'Your submitted requests', empty: 'No requests yet.', titlePlaceholder: 'What would you like?', submit: 'Submit request', success: 'Request submitted', previewThanks: 'This is a local preview, so the request was saved in this browser only and no one was notified.', thanks: 'Thank you for the idea. Our team will review it when planning what to build next.', failure: 'Failed to submit feature request. Please try again later.', collection: 'featureRequests' },
} as const

function BugReportPopup({ userEmail, open, onOpenChange, kind = 'bug', showTrigger = true }: { userEmail: string; open?: boolean; onOpenChange?: (open: boolean) => void; kind?: FeedbackKind; showTrigger?: boolean }) {
  const text = copy[kind]
  const pathname = usePathname(), session=useAppSession();
  const request=useRef<{key:string;id:string}|null>(null),historyGeneration=useRef(0);
  useEffect(()=>{historyGeneration.current++;setHistory([]);setHistoryError('');setHistoryLoading(false)},[session.selectedOrganizationId,session.email]);
  const [history,setHistory]=useState<ApiBugReport[]>([]),[historyError,setHistoryError]=useState(''),[historyLoading,setHistoryLoading]=useState(false)
  const [currentUrl, setCurrentUrl] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState('');
  const fieldId = useId(), resultHeading = useRef<HTMLHeadingElement>(null);
  // Move focus to the outcome so keyboard and screen reader users hear it instead of landing on the page body.
  useEffect(() => { if (submitted || error) resultHeading.current?.focus() }, [submitted, error]);

  useEffect(() => {
    setCurrentUrl(window.location.href);
  }, [pathname]);

  const [ownOpen, setOwnOpen] = useState(false), isOpen = open ?? ownOpen
  const setOpen = (next: boolean) => { if (open === undefined) setOwnOpen(next); onOpenChange?.(next) }
  const handleSubmit = async () => {
    if (!title.trim() || !description.trim()) {
      setMissing(!title.trim() && !description.trim() ? 'Add a title and a description.' : !title.trim() ? 'Add a title.' : 'Add a description.');
      return;
    }
    setMissing('');

    setIsSubmitting(true);
    setError(null);
    try {
      const reportData = {
        title,
        description,
        userEmail,
        url: currentUrl,
        timestamp: serverTimestamp(),
        status: "Open",
      };

      if(session.mode==='authenticated'||session.mode==='preview'){
        const organizationId=session.selectedOrganizationId??session.organizations?.[0]?.id
        if(!organizationId||session.mode!=='preview'&&!session.getAccessToken)throw new Error('Choose an organization in your account before sending feedback.')
        const payload={kind,title:title.trim(),description:description.trim(),pagePath:pathname||'/'},key=JSON.stringify(payload)
        if(request.current?.key!==key)request.current={key,id:crypto.randomUUID()}
        await (session.mode==='preview'?createPreviewDatabaseApi(session.previewPersonId):createDatabaseApiClient({baseUrl:authConfiguration().apiUrl,getAccessToken:session.getAccessToken!})).submitBugReport(organizationId,{...payload,requestId:request.current.id})
        request.current=null
      }else await addDoc(collection(db, text.collection), reportData);
      setSubmitted(true);

      // Reset fields
      setTitle("");
      setDescription("");
    } catch (err) {
      // Name the cause when it is the service or the connection; other details stay private.
      const known = err instanceof DatabaseApiClientError || (err instanceof TypeError && /fetch|network/i.test(err.message));
      setError(known ? `${text.failure.replace(/ Please try again later\.$/, '')} ${errorText(err)}` : err instanceof Error && err.message.startsWith('Choose an organization') ? err.message : text.failure);
    } finally {
      setIsSubmitting(false);
    }
  };

  async function loadHistory(){
    const organizationId=session.selectedOrganizationId??session.organizations?.[0]?.id
    if(!organizationId||session.mode!=='preview'&&!session.getAccessToken)return
    const generation=historyGeneration.current;setHistoryLoading(true);setHistoryError('')
    try{const api=session.mode==='preview'?createPreviewDatabaseApi(session.previewPersonId):createDatabaseApiClient({baseUrl:authConfiguration().apiUrl,getAccessToken:session.getAccessToken!}),items:ApiBugReport[]=[];let after:string|undefined;do{const result=await api.bugReports(organizationId,{limit:100,after},kind);items.push(...result.items);after=result.nextCursor??undefined}while(after);if(generation===historyGeneration.current)setHistory(items)}catch{if(generation===historyGeneration.current)setHistoryError('Could not load your reports. Try again.')}finally{if(generation===historyGeneration.current)setHistoryLoading(false)}
  }

  // Closing (Escape, the backdrop, Close or the X) keeps an unsent draft for next time; only a sent report or Discard clears it.
  const clearDraft = () => { setTitle(""); setDescription(""); setMissing(''); request.current = null };
  const reset = () => {
    historyGeneration.current++;setHistoryLoading(false);
    setSubmitted(false);
    setHistory([]);setHistoryError('');
    setError(null);
    setMissing('');
  };
  const close = () => { if (submitted) clearDraft(); reset(); setOpen(false); };

  return <>
    {showTrigger && <button type="button" className="ws-feedback-trigger" onClick={() => setOpen(true)}><text.Icon aria-hidden="true" /><span>{text.trigger}</span></button>}
    {isOpen && <FeedbackDialog labelledBy={`${fieldId}-heading`} onClose={close}>
      <button type="button" aria-label="Close dialog" className="ws-feedback-close" onClick={close}><HiOutlineXMark aria-hidden="true" /></button>
      {!submitted && !error ? <form className="ws-feedback-form" noValidate onSubmit={e => { e.preventDefault(); if (!isSubmitting) void handleSubmit() }}>
        <h2 id={`${fieldId}-heading`}>{text.heading}</h2>
        {(session.mode==='authenticated'||session.mode==='preview')&&<details className="ws-feedback-history" onToggle={e=>{if(e.currentTarget.open)void loadHistory()}}><summary>{text.history}</summary>{historyLoading&&<p role="status">Loading reports…</p>}{historyError&&<p role="alert">{historyError} <button type="button" className="ws-button ws-button-link" onClick={()=>void loadHistory()}>Try again</button></p>}{!historyLoading&&!historyError&&!history.length&&<p>{text.empty}</p>}<ul>{history.map(report=><li key={report.id}><strong>{report.title}</strong><p>{report.description}</p><small>{dateLabel(report.createdAt)} · {report.pagePath}</small></li>)}</ul></details>}
        <label className="ws-field" htmlFor={`${fieldId}-title`}>Title<span className="ws-sr-only"> (required)</span>
          <input id={`${fieldId}-title`} type="text" placeholder={text.titlePlaceholder} maxLength={160} required aria-invalid={missing.includes('title') || undefined} aria-describedby={missing.includes('title') ? `${fieldId}-missing` : undefined} value={title} onChange={(e) => { setTitle(e.target.value); setMissing(''); }} />
        </label>
        <label className="ws-field" htmlFor={`${fieldId}-description`}>Description<span className="ws-sr-only"> (required)</span>
          <textarea id={`${fieldId}-description`} placeholder="Provide more details..." maxLength={4000} rows={4} required aria-invalid={missing.includes('description') || undefined} aria-describedby={missing.includes('description') ? `${fieldId}-missing` : undefined} value={description} onChange={(e) => { setDescription(e.target.value); setMissing(''); }} />
        </label>
        {missing && <p id={`${fieldId}-missing`} role="alert" className="ws-feedback-missing">{missing}</p>}
        <div className="ws-confirm-actions ws-feedback-actions">
          {(title || description) && <button type="button" className="ws-feedback-discard" onClick={clearDraft}>Discard draft</button>}
          <button type="button" onClick={close}>Close</button>
          <button type="submit" className="ws-confirm-primary" disabled={isSubmitting}>{isSubmitting ? "Submitting…" : text.submit}</button>
        </div>
      </form> : <div className="ws-feedback-result">
        {submitted ? <>
          <HiOutlineCheckCircle aria-hidden="true" className="ws-feedback-icon is-success" />
          <h2 id={`${fieldId}-heading`} role="status" tabIndex={-1} ref={resultHeading}>{text.success}</h2>
          <p>{session.mode === 'authenticated' ? text.thanks : text.previewThanks}</p>
        </> : <>
          <HiOutlineExclamationCircle aria-hidden="true" className="ws-feedback-icon is-error" />
          <div role="alert"><h2 id={`${fieldId}-heading`} tabIndex={-1} ref={resultHeading}>Submission failed</h2><p>{error}</p></div>
        </>}
        <div className="ws-confirm-actions ws-feedback-actions">
          {!submitted && <button type="button" className="ws-confirm-primary" onClick={() => setError(null)}>Try again</button>}
          <button type="button" onClick={close}>Close</button>
        </div>
      </div>}
    </FeedbackDialog>}
  </>;
}

/**
 * The shared native modal: focus moves in, Tab stays inside, Escape and the backdrop close it, and focus goes back
 * to the control that opened it (or the account menu button, when that menu has already closed).
 */
function FeedbackDialog({ labelledBy, onClose, children }: { labelledBy: string; onClose: () => void; children: import('react').ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const closeRef = useRef(onClose); closeRef.current = onClose
  useEffect(() => {
    const element = dialog.current!
    const opener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null
    if (typeof element.showModal === 'function') element.showModal()
    element.querySelector<HTMLElement>('input,textarea,button:not(.ws-feedback-close)')?.focus()
    return () => {
      if (element.open) element.close()
      const target = opener?.isConnected ? opener : document.querySelector<HTMLElement>('.account-trigger')
      target?.focus()
    }
  }, [])
  const dismiss = () => closeWithExit(dialog.current, () => closeRef.current())
  return createPortal(<dialog ref={dialog} className="ws-confirm-dialog ws-feedback" aria-labelledby={labelledBy} onCancel={event => { event.preventDefault(); dismiss() }} onClick={event => { if (event.target === event.currentTarget) dismiss() }}>{children}</dialog>, document.body)
}

export default BugReportPopup;
