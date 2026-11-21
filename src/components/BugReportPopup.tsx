import { useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Popup from './Popup';
import {useAppSession} from '../context/AppSessionContext';
import {createDatabaseApiClient,DatabaseApiClientError} from '../api/database';
import {errorText} from '../api/errorText';
import {authConfiguration} from '../auth/cognito';
import type {ApiBugReport,FeedbackKind} from '../types/database-api';
import { IoIosCloseCircle, IoIosBug, IoIosBulb } from "react-icons/io";
import {createPreviewDatabaseApi} from '../preview/database';
import { db, collection, addDoc, serverTimestamp } from '../data/localStore';

const copy = {
  bug: { Icon: IoIosBug, trigger: 'Report a bug', heading: 'Report a bug', history: 'Your submitted reports', empty: 'No reports yet.', titlePlaceholder: 'What happened?', submit: 'Submit report', success: 'Report submitted', previewThanks: 'This is a local preview, so the report was saved in this browser only and no one was notified.', thanks: 'Thank you for your feedback. Our team has been notified and will look into this issue.', failure: 'Failed to submit bug report. Please try again later.', collection: 'bugReports' },
  feature: { Icon: IoIosBulb, trigger: 'Request a feature', heading: 'Request a feature', history: 'Your submitted requests', empty: 'No requests yet.', titlePlaceholder: 'What would you like?', submit: 'Submit request', success: 'Request submitted', previewThanks: 'This is a local preview, so the request was saved in this browser only and no one was notified.', thanks: 'Thank you for the idea. Our team will review it when planning what to build next.', failure: 'Failed to submit feature request. Please try again later.', collection: 'featureRequests' },
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
        if(!organizationId||session.mode!=='preview'&&!session.getAccessToken)throw new Error('Organization unavailable')
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
      setError(known ? `${text.failure.replace(/ Please try again later\.$/, '')} ${errorText(err)}` : text.failure);
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

  const reset = () => {
    historyGeneration.current++;setHistoryLoading(false);
    setSubmitted(false);
    setHistory([]);setHistoryError('');
    setError(null);
    setMissing('');
    setTitle("");
    setDescription("");
  };
  // Escape, the overlay, Cancel, Close and the X all start the next report from a fresh form.
  const handleClose = (close: () => void) => { reset(); close(); };

  return (
    <Popup
      trigger={
        showTrigger ? <button className="flex items-center space-x-2 text-white hover:text-[var(--accent-light)] transition-colors font-medium">
          <text.Icon className="w-5 h-5" />
          <span>{text.trigger}</span>
        </button> : undefined
      }
      modal
      nested
      open={open}
      onOpen={() => onOpenChange?.(true)}
      onClose={() => { reset(); onOpenChange?.(false) }}
      contentStyle={{
        backgroundColor: "var(--paper-light)",
        color: "var(--ink)",
        borderRadius: "var(--radius-lg, 12px)",
        border: "1px solid var(--line)",
        boxShadow: "0 18px 48px rgba(20, 12, 36, 0.18)",
        width: "calc(100% - 32px)",
        maxWidth: "500px",
      }}
      overlayStyle={{
        backgroundColor: "rgba(20, 12, 36, 0.42)",
        zIndex: 2000,
      }}
    >
      {(close) => (
        <div className="modal relative">
          <button type="button" aria-label="Close dialog" className="absolute top-3 right-3 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full text-[var(--muted)] hover:text-[var(--accent)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]" onClick={() => handleClose(close)}>
            <IoIosCloseCircle aria-hidden="true" className="w-7 h-7" />
          </button>

          <div className="content p-6">
            {!submitted && !error ? (
              <>
                <h1 className="font-bold text-xl pb-4 pr-10 border-b border-[var(--line)] mb-4">
                  {text.heading}
                </h1>

                {(session.mode==='authenticated'||session.mode==='preview')&&<details onToggle={e=>{if(e.currentTarget.open)void loadHistory()}}><summary>{text.history}</summary>{historyLoading&&<p role="status">Loading reports…</p>}{historyError&&<p role="alert">{historyError}</p>}{!historyLoading&&!historyError&&!history.length&&<p>{text.empty}</p>}<ul>{history.map(report=><li key={report.id}><strong>{report.title}</strong><p>{report.description}</p><small>{new Date(report.createdAt).toLocaleDateString()} · {report.pagePath}</small></li>)}</ul></details>}
                <div className="space-y-4">
                  <div>
                    <label className="block font-semibold mb-1" htmlFor={`${fieldId}-title`}>Title</label>
                    <input
                      id={`${fieldId}-title`}
                      type="text"
                      placeholder={text.titlePlaceholder} maxLength={160}
                      className="border border-[var(--line-strong)] focus:border-[var(--accent)] focus:outline-2 focus:outline-[var(--accent)] p-2 rounded-md w-full bg-white"
                      value={title}
                      onChange={(e) => { setTitle(e.target.value); setMissing(''); }}
                    />
                  </div>

                  <div>
                    <label className="block font-semibold mb-1" htmlFor={`${fieldId}-description`}>Description</label>
                    <textarea
                      id={`${fieldId}-description`}
                      placeholder="Provide more details..." maxLength={4000}
                      rows={4}
                      className="border border-[var(--line-strong)] focus:border-[var(--accent)] focus:outline-2 focus:outline-[var(--accent)] p-2 rounded-md w-full bg-white resize-none"
                      value={description}
                      onChange={(e) => { setDescription(e.target.value); setMissing(''); }}
                    />
                  </div>
                </div>

                {missing && <p role="alert" className="pt-4 text-sm font-semibold text-[var(--danger)]">{missing}</p>}
                <div className="actions flex justify-end space-x-3 pt-6 font-bold">
                  <button
                    className="px-6 py-2 bg-gray-300 rounded-md cursor-pointer hover:bg-gray-400"
                    onClick={() => handleClose(close)}
                  >
                    Cancel
                  </button>
                  <button
                    className={`px-6 py-2 rounded-md font-bold transition-colors ${
                      isSubmitting
                        ? "bg-gray-400 cursor-not-allowed text-gray-700"
                        : "bg-[var(--accent-light)] hover:bg-[var(--accent)] hover:text-white cursor-pointer"
                    }`}
                    onClick={() => !isSubmitting && handleSubmit()}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? "Submitting..." : text.submit}
                  </button>
                </div>
              </>
            ) : (
              <div className="py-8 text-center space-y-4">
                {submitted ? (
                  <>
                    <div className="flex justify-center text-green-600">
                      <text.Icon className="w-16 h-16" />
                    </div>
                    <h2 className="text-2xl font-bold" role="status" tabIndex={-1} ref={resultHeading}>{text.success}</h2>
                    <p className="text-gray-700">
                      {session.mode === 'authenticated' ? text.thanks : text.previewThanks}
                    </p>
                  </>
                ) : (
                  <>
                    <div className="flex justify-center text-red-600">
                      <text.Icon className="w-16 h-16" />
                    </div>
                    <div role="alert">
                      <h2 className="text-2xl font-bold" tabIndex={-1} ref={resultHeading}>Submission failed</h2>
                      <p className="text-gray-700">{error}</p>
                    </div>
                    <button
                      className="px-6 py-2 bg-[var(--accent-light)] rounded-md font-bold hover:bg-[var(--accent)] hover:text-white transition-colors mt-4"
                      onClick={() => setError(null)}
                    >
                      Try again
                    </button>
                  </>
                )}

                <div className="pt-4">
                  <button
                    className="px-8 py-2 bg-gray-300 rounded-md font-bold hover:bg-gray-400 transition-colors"
                    onClick={() => handleClose(close)}
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Popup>
  );
}

export default BugReportPopup;
