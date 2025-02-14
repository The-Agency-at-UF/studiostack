import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

function QRCodeGenerator({ equipmentID }) { 
  const [qrCodeData, setQrCodeData] = useState("");

  useEffect(() => { 
    QRCode.toDataURL(equipmentID, { width: 128 }, (err, url) => {
      if (err) {
        console.error(err);
      } else {
        setQrCodeData(url);
      }
    });
  }, [equipmentID]);
  
  return (
    <div>
      <img src={qrCodeData} alt="QR Code" />
    </div>
  );
}

export default QRCodeGenerator;