import React, { useRef } from "react";
import bwipjs from "bwip-js";

const BarcodeDownloader = ({ equipmentID }) => {
  const canvasRef = useRef(null);

  //function thats generates the barcode
  const generateBarcode = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      try {
        bwipjs.toCanvas(canvas, {
          bcid: "code128",   
          text: equipmentID,  
          scale: 3,           
          height: 10,         
          includetext: true,  
        });
      } catch (e) {
        console.error("Error generating barcode", e);
      }
    }
  };

  //function to download barcode
  const downloadBarcode = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const imageUrl = canvas.toDataURL("image/png"); 
      const a = document.createElement("a"); 
      a.href = imageUrl;
      a.download = equipmentID; 
      a.click();
    }
  };

  React.useEffect(() => {
    generateBarcode();
  }, []);

  return (
    <div>
      <canvas ref={canvasRef} style={{ display: "none" }} />
      <button 
      className='bg-[#A3C1E0] hover:bg-[#426276] text-xs lg:text-sm cursor-pointer rounded-full text-white w-full'
      onClick={downloadBarcode}>{equipmentID}</button>
    </div>
  );
};

export default BarcodeDownloader;
