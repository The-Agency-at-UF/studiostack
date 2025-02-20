import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

function QRCodeGenerator({ equipmentID }) { 
  const [qrCodeData, setQrCodeData] = useState("");

  // create QR code for an ID
  useEffect(() => { 
    QRCode.toDataURL(equipmentID, { width: 128 }, (err, url) => {
      if (err) {
        console.error(err);
      } else {
        setQrCodeData(url);
      }
    });
  }, [equipmentID]);

  // download QR code image
  const handleQRDownload = (equipmentID) => {
    const QrImage = document.createElement('a');
    QrImage.download = equipmentID;
    QrImage.href = qrCodeData;
    QrImage.click();
  }
  
  return <button 
    onClick={() => handleQRDownload(equipmentID)} 
    className='bg-[#A3C1E0] hover:bg-[#426276] text-xs lg:text-sm cursor-pointer rounded-full text-white flex-1'>
    {equipmentID}
  </button>
}

export default QRCodeGenerator;