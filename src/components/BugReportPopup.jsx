import React, { useState } from "react";
import Popup from "reactjs-popup";
import "reactjs-popup/dist/index.css";
import { IoIosCloseCircle, IoIosBug } from "react-icons/io";

function BugReportPopup({ userEmail }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  // TODO: send bug report to firebase to be stored (and possibly send an alert to developers/admin)
  const handleSubmit = (close) => {
    const reportData = {
      title,
      description,
      userEmail,
      url: window.location.href,
      timestamp: new Date().toISOString(),
    };

    console.log("Bug Report Submitted:", reportData);
    alert("Thank you! Your bug report has been logged to the console.");

    // Reset fields and close
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
          <div className="content p-6">
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
          </div>

          <div className="actions flex justify-end space-x-3 p-6 pt-0 font-bold">
            <button
              className="px-6 py-2 bg-gray-300 rounded-md cursor-pointer hover:bg-gray-400"
              onClick={() => {
                setTitle("");
                setDescription("");
                close();
              }}
            >
              Cancel
            </button>
            <button
              className="px-6 py-2 bg-[#A3C1E0] rounded-md cursor-pointer hover:bg-[#426276] hover:text-white transition-colors"
              onClick={() => handleSubmit(close)}
            >
              Submit Report
            </button>

            <IoIosCloseCircle
              color="#426276"
              className="w-8 h-8 absolute top-4 right-4 cursor-pointer hover:scale-110 transition-transform"
              onClick={() => {
                setTitle("");
                setDescription("");
                close();
              }}
            />
          </div>
        </div>
      )}
    </Popup>
  );
}

export default BugReportPopup;
