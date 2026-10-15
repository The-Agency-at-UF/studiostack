import type { AlertMessage } from '../types/models'
import type { StylesConfig } from 'react-select'
import type { SelectOption } from '../types/models'
import type { ReservationData } from '../types/models'
import React, { useState, useEffect } from "react";
import Popup from './Popup';
import { db, getDocs, collection, doc, setDoc } from '../data/localStore';
import { IoIosCloseCircle, IoIosAddCircle } from "react-icons/io";
import Select from "react-select";

function AddToReservationPopup({ handleAdd, reservation, reservationID }: { handleAdd: () => void | Promise<void>; reservation: ReservationData; reservationID: string }) {
  const [availableEquipment, setAvailableEquipment] = useState<SelectOption[]>([]);
  const [selectedEquipment, setSelectedEquipment] = useState<SelectOption | null>(null);
  const [message, setMessage] = useState<AlertMessage | null>(null);

  const handle = (close: () => void) => {
    fetchReservationsAndEquipment();
    if (!selectedEquipment) return;
    //make sure its stil available
    if (
      !availableEquipment.some(
        (equipment) => equipment.value === selectedEquipment.value,
      )
    ) {
      setMessage({ text: "This item is no longer available. Please choose another item.", type: "error" });
      return;
    }

    //update the reservation
    const reservationRef = doc(db, "reservations", reservationID);
    setDoc(reservationRef, {
      ...reservation,
      equipmentIDs: [
        ...reservation.equipmentIDs,
        { id: selectedEquipment.value, name: selectedEquipment.label },
      ],
    })
      .then(() => {
        console.log("Reservation updated successfully");
      })
      .catch((error) => {
        console.error("Error updating reservation:", error);
      });

    handleAdd();
    setSelectedEquipment(null);
    close();
  };

  const fetchReservationsAndEquipment = async () => {
    try {
      const reservationRef = collection(db, "reservations");
      const querySnapshot = await getDocs(reservationRef);

      const allReservations = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      const conflictingReservations = allReservations.filter(
        (doc) =>
          reservation.startDate.toDate() < doc.endDate.toDate() &&
          reservation.endDate.toDate() > doc.startDate.toDate(),
      );

      const equipmentRef = collection(db, "inventory");
      //get all the equipment in the 'equipment' collection
      const equipmentSnapshot = await getDocs(equipmentRef);
      //map through each equipment and extract the data
      const allEquipmentList = equipmentSnapshot.docs.map((doc) => ({
        equipmentID: doc.id,
        ...doc.data(),
      }));
      const availableEquipmentList = allEquipmentList.filter(
        (equipment) => equipment.availability !== "reported",
      );

      const equipment = availableEquipmentList.filter((equipment) => {
        //check if the equipment is already reserved in the conflicting reservations
        const isReserved = conflictingReservations.some((doc) =>
          doc.equipmentIDs.some(item => item.id === equipment.equipmentID),
        );
        //check if the equipment is already in the current reservation
        const isInCurrentReservation = reservation.equipmentIDs.some(item => item.id === equipment.equipmentID);
        return !isReserved && !isInCurrentReservation;
      });

      setAvailableEquipment(
        equipment.map((item) => ({
          value: item.equipmentID,
          label: item.name,
        })),
      );
    } catch (error) {
      console.error("Error fetching information:", error);
    }
  };

  useEffect(() => {
    fetchReservationsAndEquipment();
  }, []);

  //overriding styles for the dropdown
  const dropdownStyle: StylesConfig<SelectOption, false> = {
    control: (provided) => ({
      ...provided,
      border: "2px solid black",
      boxShadow: "none",
      "&:hover": {
        borderColor: "black",
      },
      borderRadius: "0.375rem",
      height: "calc(var(--spacing) * 12)",
      fontSize: "0.875rem",
      "@media (min-width: 640px)": {
        fontSize: "1rem",
      },
    }),
    option: (provided, state) => ({
      ...provided,
      backgroundColor: state.isFocused ? "var(--accent-light)" : "white",
      color: "black",
      "&:hover": {
        backgroundColor: "var(--accent-light)",
      },
      fontSize: "0.875rem",
      "@media (min-width: 640px)": {
        fontSize: "1rem",
      },
    }),
    singleValue: (provided) => ({
      ...provided,
      fontSize: "0.875rem",
      "@media (min-width: 640px)": {
        fontSize: "1rem",
      },
    }),
    input: (provided) => ({
      ...provided,
      fontSize: "0.875rem",
      "@media (min-width: 640px)": {
        fontSize: "1rem",
      },
    }),
  };

  return (
    <Popup
      trigger={
        <span className="pb-6 sm:pb-8">
          <IoIosAddCircle
            color="var(--accent)"
            className="absolute right-0 w-6 h-6 sm:w-8 sm:h-8 hover:scale-110 hover:cursor-pointer"
          />
        </span>
      }
      modal
      nested
      contentStyle={{
        backgroundColor: "#ECECEC",
        borderRadius: "0.5rem",
        border: "2px solid black",
      }}
      overlayStyle={{ backgroundColor: "rgba(105, 105, 105, 0.5)" }}
    >
      {(close) => (
        <div className="modal relative">
          <div className="content p-4">
            <h1 className="font-bold text-lg sm:text-xl sm:pb-6 text-center pt-8">
              Choose an item to add below:
            </h1>
            {message && (
              <div className={`p-4 mb-4 rounded ${message.type === 'success' ? 'bg-green-100 text-green-800 border border-green-400' : 'bg-red-100 text-red-800 border border-red-400'}`}>
                {message.text}
                <button onClick={() => setMessage(null)} className="float-right font-bold">×</button>
              </div>
            )}
            <Select
              value={selectedEquipment}
              options={availableEquipment}
              isClearable={true}
              isSearchable={true}
              onChange={setSelectedEquipment}
              styles={dropdownStyle}
            />
          </div>
          <div className="text-sm sm:text-lg actions flex justify-center space-x-4 pb-6 pt-4 font-bold">
            <button
              className="px-6 py-2 bg-[var(--accent-light)] rounded-md hover:cursor-pointer hover:scale-110"
              onClick={() => {
                handle(close);
              }}
            >
              Confirm
            </button>
            <IoIosCloseCircle
              color="var(--accent)"
              className="w-8 h-8 sm:w-10 sm:h-10 absolute top-2 right-2 sm:top-4 sm:right-4 hover:cursor-pointer hover:scale-110"
              onClick={() => {
                setSelectedEquipment(null);
                close();
              }}
            />
          </div>
        </div>
      )}
    </Popup>
  );
}

export default AddToReservationPopup;
