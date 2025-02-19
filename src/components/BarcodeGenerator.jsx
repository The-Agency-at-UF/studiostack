import React from "react";
import Barcode from "react-barcode";

const BarcodeGenerator = ({equipmentID}) => {

  return (
      <Barcode value={equipmentID} />
  );
};

export default BarcodeGenerator;
