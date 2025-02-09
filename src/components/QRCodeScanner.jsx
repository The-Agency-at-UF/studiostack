import React, { useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/library';

function QRCodeScanner() {
  const [scannedData, setScannedData] = useState('');
  const videoRef = useRef(null);
  const codeReader = new BrowserMultiFormatReader();

  const startScanner = () => {
    codeReader
      .decodeFromVideoDevice(null, videoRef.current, (result, err) => {
        if (result) {
          setScannedData(result.text);
        }
        if (err) {
          console.error(err);
        }
      })
      .catch((err) => {
        console.error(err);
      });
  };

  return (
    <div>
      <h1>QR Code Scanner</h1>
      <video ref={videoRef} width="100%" height="auto"></video>
      <button onClick={startScanner}>Start Scanning</button>
      <p>{scannedData ? `Scanned Data: ${scannedData}` : 'Scan a QR code'}</p>
    </div>
  );
}

export default QRCodeScanner;
