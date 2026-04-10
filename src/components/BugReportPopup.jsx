import React, { useState } from "react";
import Popup from "reactjs-popup";
import "reactjs-popup/dist/index.css";
import { IoIosCloseCircle, IoIosBug } from "react-icons/io";
import { db } from "../firebase/firebaseConfig";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

function BugReportPopup({ userEmail }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);

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
        url: window.location.href,
        timestamp: serverTimestamp(),
        status: "Open",
      };

      await addDoc(collection(db, "bugReports"), reportData);
      setSubmitted(true);
      
      // Reset fields
      setTitle("");
      setDescription("");
    } catch (err) {
      console.error("Error submitting bug report:", err);
      setError("Failed to submit bug report. Please try again later.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = (close) => {
    setSubmitted(false);
    setError(null);
    setTitle("");
    setDescription("");
    close();
  };

  return (
    <Popup
      trigger={
        <button className="flex items-center space-x-2 text-white hover:text-[#A3C1E0] transition-colors font-medium">
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
            color="#426276"
            className="w-8 h-8 absolute top-4 right-4 cursor-pointer hover:scale-110 transition-transform z-10"
            onClick={() => handleClose(close)}
          />

          <div className="content p-6">
            {!submitted && !error ? (
              <>
                <h1 className="font-bold text-2xl pb-4 border-b border-black mb-4">
                  Report a Bug
                </h1>

                <div className="space-y-4">
                  <div>
                    <label className="block font-semibold mb-1">Title</label>
                    <input
                      type="text"
                      placeholder="What happened?"
                      className="border-2 border-gray-300 focus:border-[#426276] focus:outline-none p-2 rounded-md w-full bg-white"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block font-semibold mb-1">Description</label>
                    <textarea
                      placeholder="Provide more details..."
                      rows="4"
                      className="border-2 border-gray-300 focus:border-[#426276] focus:outline-none p-2 rounded-md w-full bg-white resize-none"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block font-semibold mb-1">Current URL</label>
                    <input
                      type="text"
                      readOnly
                      value={window.location.href}
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
                        : "bg-[#A3C1E0] hover:bg-[#426276] hover:text-white cursor-pointer"
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
                      className="px-6 py-2 bg-[#A3C1E0] rounded-md font-bold hover:bg-[#426276] hover:text-white transition-colors mt-4"
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
