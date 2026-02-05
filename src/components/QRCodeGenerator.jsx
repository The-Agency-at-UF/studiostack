import React from "react";
import QRCode from "react-qr-code";

const QRCodeGenerator = ({ equipmentID }) => {
  const downloadAction = () => {
    const svgParent = document.getElementById(`qr-container-${equipmentID}`);
    const svg = svgParent.querySelector('svg');
    if (!svg) {
        console.error("QR Code SVG not found");
        return;
    }
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();

    img.onload = () => {
      const qrSize = 256;
      const padding = 20;
      const fontSize = 24;
      
      ctx.font = `${fontSize}px Arial`;
      const textMetrics = ctx.measureText(equipmentID);
      const textWidth = textMetrics.width;
      const textHeight = fontSize + padding;

      const canvasWidth = Math.max(qrSize, textWidth) + (padding * 2);
      const canvasHeight = qrSize + textHeight;
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;

      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      const qrX = (canvasWidth - qrSize) / 2;
      ctx.drawImage(img, qrX, 0, qrSize, qrSize);

      ctx.font = `${fontSize}px Arial`;
      ctx.fillStyle = "black";
      ctx.textAlign = "center";
      ctx.fillText(equipmentID, canvasWidth / 2, qrSize + padding);

      const pngFile = canvas.toDataURL("image/png");
      const downloadLink = document.createElement("a");
      downloadLink.download = `${equipmentID}_qr.png`;
      downloadLink.href = pngFile;
      downloadLink.click();
    };

    img.src = "data:image/svg+xml;base64," + btoa(svgData);
  };

  return (
    <>
      <div id={`qr-container-${equipmentID}`} style={{ display: "none" }}>
        <QRCode value={equipmentID} size={256} />
      </div>
      <button
        className="bg-[#A3C1E0] hover:bg-[#426276] text-xs lg:text-sm cursor-pointer rounded-full text-white w-full"
        onClick={downloadAction}
      >
        {equipmentID}
      </button>
    </>
  );
};

export default QRCodeGenerator;
