import React, { useState, useEffect, useRef } from "react";
import Popup from "reactjs-popup";
import "reactjs-popup/dist/index.css";
import { IoIosCloseCircle } from "react-icons/io";
import { Html5QrcodeScanner } from "html5-qrcode";

function CheckOutInPopUp({ handleCheckOutIn, checkOut, correctID }) {
  const [isScanning, setIsScanning] = useState(false);
  const [isManualEntry, setIsManualEntry] = useState(false);
  const [manualInput, setManualInput] = useState("");
  const [showScannerContainer, setShowScannerContainer] = useState(false);
  const scannerId = "qr-reader";
  const popupRef = useRef();
  const scannerRef = useRef(null);

  useEffect(() => {
    let scanner;
    if (isScanning && showScannerContainer) {
      scanner = new Html5QrcodeScanner(
        scannerId,
        { fps: 10, qrbox: { width: 100, height: 100 } },
        /* verbose= */ false,
      );
      scanner.render(onScanSuccess, onScanFailure);
      scannerRef.current = scanner;
    }

    function onScanSuccess(decodedText) {
      console.log("scanned successfuly");
      handleSubmit(decodedText);
      if (scannerRef.current) {
        scannerRef.current.clear();
      }
      setIsScanning(false);
      setShowScannerContainer(false);
    }

    function onScanFailure(error) {
      // console.warn(`Code scan error = ${error}`);
    }

    return () => {
      if (scannerRef.current) {
        // Use ref for cleanup
        scannerRef.current.clear().catch((error) => {
          // This can happen if the component unmounts before the scanner is fully initialized.
          // It's safe to ignore.
        });
        scannerRef.current = null; // Clear ref
      }
    };
  }, [isScanning, showScannerContainer]);

  const handleSubmit = (inputID) => {
    if (inputID === correctID.id) {
      handleCheckOutIn(inputID);
      resetState();
      if (popupRef.current) {
        popupRef.current.close();
      }
    } else {
      alert(
        "Please make sure to enter the correct item ID. The ID you entered was " +
          inputID +
          ".",
      );
      resetState();
    }
  };

  const handleManualSubmit = () => {
    if (manualInput.trim() !== "") {
      handleSubmit(manualInput.trim());
    } else {
      alert("Please enter a serial number.");
    }
  };

  const handleCancelScanner = () => {
    setIsScanning(false);
    if (scannerRef.current) {
      scannerRef.current.clear();
      scannerRef.current = null;
    }
    setShowScannerContainer(false);
  };

  const handleCancelManual = () => {
    setIsManualEntry(false);
    setManualInput("");
  };

  const resetState = () => {
    setIsScanning(false);
    setIsManualEntry(false);
    setManualInput("");
    if (scannerRef.current) {
      scannerRef.current.clear().catch((error) => {
        // Handle error if scanner is not initialized or already cleared
        console.error("Error clearing scanner on reset:", error);
      });
      scannerRef.current = null; // Clear ref
    }
    setShowScannerContainer(false); // Explicitly hide the scanner container
  };

  return (
    <Popup
      ref={popupRef}
      trigger={
        <button className="bg-[#A3C1E0] w-2/7 rounded-md px-6 py-2 lg:text-xl sm:text-lg text-sm hover:cursor-pointer hover:scale-105">
          {checkOut ? "Check Out" : "Check In"}
        </button>
      }
      modal
      nested
      onOpen={() => {
        setIsScanning(false);
        setIsManualEntry(false);
        setShowScannerContainer(false); // Reset scanner container state on open
      }}
      onClose={resetState} // Ensure state is reset when popup is closed
      contentStyle={{
        backgroundColor: "#ECECEC",
        borderRadius: "0.5rem",
        border: "2px solid black",
        width: "90%",
        maxWidth: "500px",
      }}
      overlayStyle={{ backgroundColor: "rgba(105, 105, 105, 0.5)" }}
    >
      {(
        close, // 'close' from render prop is not used, but kept for clarity
      ) => (
        <div className="modal relative">
          <div className="content p-4 text-center text-sm sm:text-lg">
            <h1 className="font-bold text-2xl sm:text-3xl pb-6">
              {checkOut ? "Check Out" : "Check In"}
            </h1>

            {
              !isScanning && !isManualEntry && !showScannerContainer ? (
                <>
                  <p className="pb-3">Press a button to proceed.</p>
                  <div className="actions flex justify-center space-x-4 pt-4 font-bold">
                    <button
                      className="px-6 py-2 bg-[#A3C1E0] rounded-md hover:cursor-pointer hover:scale-110"
                      onClick={() => {
                        setIsScanning(true);
                        setShowScannerContainer(true);
                      }}
                    >
                      Scan QR Code
                    </button>
                    <button
                      className="px-6 py-2 bg-[#A3C1E0] rounded-md hover:cursor-pointer hover:scale-110"
                      onClick={() => setIsManualEntry(true)}
                    >
                      Enter Manually
                    </button>
                  </div>
                </>
              ) : isScanning && showScannerContainer ? (
                <>
                  <p className="pb-3">
                    Align the QR code within the scanning box.
                  </p>
                  <div id={scannerId} className="w-full"></div>
                  <button
                    className="mt-4 px-6 py-2 bg-[#c1a3a3] rounded-md hover:cursor-pointer hover:scale-110"
                    onClick={handleCancelScanner}
                  >
                    Cancel
                  </button>
                </>
              ) : isManualEntry ? (
                <>
                  <p className="pb-3">Enter the serial number manually.</p>
                  <input
                    type="text"
                    className="mt-2 p-2 border border-gray-300 rounded-md w-full max-w-xs text-center"
                    value={manualInput}
                    onChange={(e) => setManualInput(e.target.value)}
                    placeholder="Serial Number"
                  />
                  <div className="actions flex justify-center space-x-4 pt-4 font-bold">
                    <button
                      className="px-6 py-2 bg-[#A3C1E0] rounded-md hover:cursor-pointer hover:scale-110"
                      onClick={handleManualSubmit}
                    >
                      Submit
                    </button>
                    <button
                      className="px-6 py-2 bg-[#c1a3a3] rounded-md hover:cursor-pointer hover:scale-110"
                      onClick={handleCancelManual}
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : null /* Fallback for unexpected states, or if you want to render something else */
            }

            <IoIosCloseCircle
              color="#426276"
              className="w-8 h-8 sm:w-10 sm:h-10 absolute top-2 right-2 sm:top-4 sm:right-4 hover:cursor-pointer hover:scale-110"
              onClick={() => {
                if (popupRef.current) {
                  popupRef.current.close();
                }
              }}
            />
          </div>
        </div>
      )}
    </Popup>
  );
}

export default CheckOutInPopUp;
