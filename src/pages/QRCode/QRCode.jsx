import React, { useEffect, useState } from 'react';
import { getDocs, collection, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../firebase/firebaseConfig';
import QRCode from 'qrcode';
import QRCodeGenerator from '../../components/QRCodeGenerator';
import QRCodeScanner from '../../components/QRCodeScanner';

function QRCodeCreator() {
  const equipmentID = "0hyH3DZcaYKjTvaPCn4c";
  const [QRCodeGenerated, setQRCodeGenerated] = useState(false);

  return (
    <div>
        <h1>{equipmentID}</h1>
        <button onClick={() => setQRCodeGenerated(true)}>Generate QR Code</button>
        {QRCodeGenerated && <QRCodeGenerator equipmentID={equipmentID} />}

        <QRCodeScanner />
    </div>
  );
}

export default QRCodeCreator;