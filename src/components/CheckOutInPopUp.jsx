import React, { useState, useEffect, useRef } from "react";
import Popup from "reactjs-popup";
import "reactjs-popup/dist/index.css";
import { IoIosCloseCircle } from "react-icons/io";
import { Html5QrcodeScanner } from "html5-qrcode";

function CheckOutInPopUp({ handleCheckOutIn, checkOut, correctID }) {
  const [isScanning, setIsScanning] = useState(false);
  const scannerId = "qr-reader";
  const popupRef = useRef();

  useEffect(() => {
    let scanner;
    if (isScanning) {
      scanner = new Html5QrcodeScanner(
        scannerId,
        { fps: 10, qrbox: { width: 100, height: 100 } },
        /* verbose= */ false,
      );
      scanner.render(onScanSuccess, onScanFailure);
    }

    function onScanSuccess(decodedText, decodedResult) {
      console.log("scanned successfuly");
      handleSubmit(decodedText);
      if (scanner) {
        scanner.clear();
      }
      setIsScanning(false);
    }

    function onScanFailure(error) {
      // console.warn(`Code scan error = ${error}`);
    }

    return () => {
      if (scanner) {
        scanner.clear().catch((error) => {
          // This can happen if the component unmounts before the scanner is fully initialized.
          // It's safe to ignore.
        });
      }
    };
  }, [isScanning]);

  const handleSubmit = (scannedID) => {
    if (scannedID === correctID.id) {
      handleCheckOutIn(scannedID);
      resetState();
      if (popupRef.current) {
        popupRef.current.close();
      }
    } else {
      alert(
        "Please make sure to scan the correct item. The QR code you scanned was for " +
          scannedID +
          ".",
      );
      resetState();
    }
  };

  const resetState = () => {
    setIsScanning(false);
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
      onOpen={() => setIsScanning(false)} // Reset scanning state on open
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

            {!isScanning ? (
              <>
                <p className="pb-3">
                  Press the button to start scanning the QR code.
                </p>
                <div className="actions flex justify-center space-x-4 pt-4 font-bold">
                  <button
                    className="px-6 py-2 bg-[#A3C1E0] rounded-md hover:cursor-pointer hover:scale-110"
                    onClick={() => setIsScanning(true)}
                  >
                    Scan QR Code
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="pb-3">
                  Align the QR code within the scanning box.
                </p>
                <div id={scannerId} className="w-full"></div>
                <button
                  className="mt-4 px-6 py-2 bg-[#c1a3a3] rounded-md hover:cursor-pointer hover:scale-110"
                  onClick={() => setIsScanning(false)}
                >
                  Cancel
                </button>
              </>
            )}

            <IoIosCloseCircle
              color="#426276"
              className="w-8 h-8 sm:w-10 sm:h-10 absolute top-2 right-2 sm:top-4 sm:right-4 hover:cursor-pointer hover:scale-110"
              onClick={() => {
                resetState();
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
