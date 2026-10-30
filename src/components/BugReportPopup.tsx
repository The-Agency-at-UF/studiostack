import React, { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Popup from './Popup';
import {useAppSession} from '../context/AppSessionContext';
import {createDatabaseApiClient} from '../api/database';
import {authConfiguration} from '../auth/cognito';
import type {ApiBugReport} from '../types/database-api';
import { IoIosCloseCircle, IoIosBug } from "react-icons/io";
import { db, collection, addDoc, serverTimestamp } from '../data/localStore';

function BugReportPopup({ userEmail }: { userEmail: string }) {
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

  useEffect(() => {
    setCurrentUrl(window.location.href);
  }, [pathname]);

  const handleSubmit = async () => {
    if (!title.trim() || !description.trim()) {
      alert("Please provide both a title and description.");
      return;
    }

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

      if(session.mode==='authenticated'){
        const organizationId=session.selectedOrganizationId??session.organizations?.[0]?.id
        if(!organizationId||!session.getAccessToken)throw new Error('Organization unavailable')
        const payload={title:title.trim(),description:description.trim(),pagePath:pathname||'/'},key=JSON.stringify(payload)
        if(request.current?.key!==key)request.current={key,id:crypto.randomUUID()}
        await createDatabaseApiClient({baseUrl:authConfiguration().apiUrl,getAccessToken:session.getAccessToken}).submitBugReport(organizationId,{...payload,requestId:request.current.id})
        request.current=null
      }else await addDoc(collection(db, "bugReports"), reportData);
      setSubmitted(true);

      // Reset fields
      setTitle("");
      setDescription("");
    } catch (err) {
      void err;
      setError("Failed to submit bug report. Please try again later.");
    } finally {
      setIsSubmitting(false);
    }
  };

  async function loadHistory(){
    const organizationId=session.selectedOrganizationId??session.organizations?.[0]?.id
    if(!organizationId||!session.getAccessToken)return
    const generation=historyGeneration.current;setHistoryLoading(true);setHistoryError('')
    try{const api=createDatabaseApiClient({baseUrl:authConfiguration().apiUrl,getAccessToken:session.getAccessToken}),items:ApiBugReport[]=[];let after:string|undefined;do{const result=await api.bugReports(organizationId,{limit:100,after});items.push(...result.items);after=result.nextCursor??undefined}while(after);if(generation===historyGeneration.current)setHistory(items)}catch{if(generation===historyGeneration.current)setHistoryError('Could not load your reports. Try again.')}finally{if(generation===historyGeneration.current)setHistoryLoading(false)}
  }

  const handleClose = (close: () => void) => {
    historyGeneration.current++;setHistoryLoading(false);
    setSubmitted(false);
    setHistory([]);setHistoryError('');
    setError(null);
    setTitle("");
    setDescription("");
    close();
  };

  return (
    <Popup
      trigger={
        <button className="flex items-center space-x-2 text-white hover:text-[var(--accent-light)] transition-colors font-medium">
          <IoIosBug className="w-5 h-5" />
          <span>Report a Bug</span>
        </button>
      }
      modal
      nested
      contentStyle={{
        backgroundColor: "#ECECEC",
        borderRadius: "0.5rem",
        border: "2px solid black",
        width: "90%",
        maxWidth: "500px",
      }}
      overlayStyle={{
        backgroundColor: "rgba(105, 105, 105, 0.5)",
        zIndex: 2000,
      }}
    >
      {(close) => (
        <div className="modal relative">
          <IoIosCloseCircle
            color="var(--accent)"
            className="w-8 h-8 absolute top-4 right-4 cursor-pointer hover:scale-110 transition-transform z-10"
            onClick={() => handleClose(close)}
          />

          <div className="content p-6">
            {!submitted && !error ? (
              <>
                <h1 className="font-bold text-2xl pb-4 border-b border-black mb-4">
                  Report a Bug
                </h1>

                {session.mode==='authenticated'&&<details onToggle={e=>{if(e.currentTarget.open)void loadHistory()}}><summary>Your submitted reports</summary>{historyLoading&&<p role="status">Loading reports…</p>}{historyError&&<p role="alert">{historyError}</p>}{!historyLoading&&!historyError&&!history.length&&<p>No reports yet.</p>}<ul>{history.map(report=><li key={report.id}><strong>{report.title}</strong><p>{report.description}</p><small>{new Date(report.createdAt).toLocaleDateString()} · {report.pagePath}</small></li>)}</ul></details>}
                <div className="space-y-4">
                  <div>
                    <label className="block font-semibold mb-1">Title</label>
                    <input
                      type="text"
                      placeholder="What happened?" maxLength={160}
                      className="border-2 border-gray-300 focus:border-[var(--accent)] focus:outline-none p-2 rounded-md w-full bg-white"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block font-semibold mb-1">Description</label>
                    <textarea
                      placeholder="Provide more details..." maxLength={4000}
                      rows={4}
                      className="border-2 border-gray-300 focus:border-[var(--accent)] focus:outline-none p-2 rounded-md w-full bg-white resize-none"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block font-semibold mb-1">Current URL</label>
                    <input
                      type="text"
                      readOnly
                      value={currentUrl}
                      className="border-2 border-gray-200 p-2 rounded-md w-full bg-gray-100 text-gray-600 text-sm italic"
                    />
                  </div>
                </div>

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
                    {isSubmitting ? "Submitting..." : "Submit Report"}
                  </button>
                </div>
              </>
            ) : (
              <div className="py-8 text-center space-y-4">
                {submitted ? (
                  <>
                    <div className="flex justify-center text-green-600">
                      <IoIosBug className="w-16 h-16" />
                    </div>
                    <h2 className="text-2xl font-bold">Report Submitted!</h2>
                    <p className="text-gray-700">
                      Thank you for your feedback. Our team has been notified and will look into this issue.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="flex justify-center text-red-600">
                      <IoIosBug className="w-16 h-16" />
                    </div>
                    <h2 className="text-2xl font-bold">Submission Failed</h2>
                    <p className="text-gray-700">{error}</p>
                    <button
                      className="px-6 py-2 bg-[var(--accent-light)] rounded-md font-bold hover:bg-[var(--accent)] hover:text-white transition-colors mt-4"
                      onClick={() => setError(null)}
                    >
                      Try Again
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
