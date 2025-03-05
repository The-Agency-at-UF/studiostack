import React, { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, Label, Tooltip } from 'recharts';
import { getDocs, collection } from 'firebase/firestore';
import { db } from '../../firebase/firebaseConfig';
import BarGraph from '../../components/BarGraph';

const Statistics = () => {
  const COLORS = ['#A3C1E0', '#CCC9E7', '#7595aa', '#6b7095', '#426276'];
  const [reservationsEquipment, setReservationsEquipment] = useState([]);
  const [brokenEquipmentReports, setbrokenEquipmentReports] = useState([]);
  const [userReports, setUserReports] = useState([]);
  const [userReservations, setUserReservations] = useState([]);
  const [reservationTeams, setReservationTeams] = useState([]);
  const [availabilityData, setAvailabilityData] = useState([]);
  const [reservedItemsData, setReservedItemsData] = useState([]);
  const [brokenEquipmentData, setBrokenEquipmentData] = useState([]);
  const [userReportsData, setUserReportsData] = useState([]);
  const [userReservationsData, setUserReservationsData] = useState([]);
  const [reservationTeamsData, setReservationTeamsData] = useState([]);
  const [totalEquipment, setTotalEquipment] = useState(0);
  const currentDate = new Date();
  
  //get the top 5 and update state
  const updateReservedItemsData = (checkedOut) => {
    const topCheckedOutItems = Object.entries(checkedOut)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value) 
      .slice(0, 5);
    
    setReservedItemsData(topCheckedOutItems);
  };

  const updateBrokenItemsData = (report) => {
    const topReportedItems = Object.entries(report)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value) 
      .slice(0, 5);
    
    setBrokenEquipmentData(topReportedItems);
  };

  const updateUserReportsData = (report) => {
    const topReportingUsers = Object.entries(report)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value) 
      .slice(0, 5);
    
    setUserReportsData(topReportingUsers);
  };

  const updateUserReservationsData = (reservation) => {
    const topReservingUsers = Object.entries(reservation)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value) 
      .slice(0, 5);
    
    setUserReservationsData(topReservingUsers);
  };

  const updateReservationsTeamsData = (team) => {
    const topTeams = Object.entries(team)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value) 
      .slice(0, 5);
    
    setReservationTeamsData(topTeams);
  };
  

  useEffect(() => {
    const fetchEquipmentAndReservations = async () => {
      try {
        // get equipment data from the 'inventory' collection
        const inventoryRef = collection(db, 'inventory');
        const inventorySnapshot = await getDocs(inventoryRef);
        const allEquipment = inventorySnapshot.docs.map(doc => ({
          equipmentId: doc.id,
          ...doc.data()
        }));

        //different values for the availability data
        let available = 0,
            reported = 0,
            checkedOut = 0,
            awaitingCheckout = 0;

        //count the values and get the broken equipment reports
        const equipmentReportList = allEquipment.map(equipment => {
          if (equipment.availability === 'available') available++;
          else if (equipment.availability === 'reported') reported++;
          else if (equipment.availability === 'checked out') checkedOut++;
          return equipment.reportCount.map(report => {
            return {
              name: equipment.name,
              time: report.toDate(),
            };
          });
        }).flat();

        setTotalEquipment(allEquipment.length);
        setbrokenEquipmentReports(equipmentReportList);

        const allTimeBroken = {};
      
        equipmentReportList.forEach(item => {
          allTimeBroken[item.name] = (allTimeBroken[item.name] || 0) + 1;
        });
        updateBrokenItemsData(allTimeBroken);

        // get the reservations from the 'reservations' collection
        const reservationsRef = collection(db, 'reservations');
        const reservationsSnapshot = await getDocs(reservationsRef);
        const allReservations = reservationsSnapshot.docs.map(doc => ({
          reservationId: doc.id,
          ...doc.data()
        }));

        const reservationsEquipmentList = allReservations.map(reservation => {
          return reservation.equipmentIDs.map(equipment => {
            return {
              name: equipment.name,
              time: reservation.startDate.toDate(),
            };
          });
        }).flat();

        setReservationsEquipment(reservationsEquipmentList);

        const allTimeCheckedOut = {};
      
        //count how many times each equipment name appears in reservationsEquipmentList
        reservationsEquipmentList.forEach(item => {
          allTimeCheckedOut[item.name] = (allTimeCheckedOut[item.name] || 0) + 1;
        });
        updateReservedItemsData(allTimeCheckedOut);

        const reservationsTeamsList = allReservations.map(reservation => {
          return {
            name: reservation.team,
            time: reservation.startDate.toDate(),
          };
        });
        setReservationTeams(reservationsTeamsList);
  
        const allTimeTeams = {};
        reservationsTeamsList.forEach(item => {
          allTimeTeams[item.name] = (allTimeTeams[item.name] || 0) + 1;
        });
        updateReservationsTeamsData(allTimeTeams);

        const activeReservations = allReservations.filter(reservation => {
          const endDate = reservation.endDate.toDate();
          return endDate >= currentDate;
        });

        //count the awaiting checkout value
        activeReservations.forEach(reservation => {
          reservation.equipmentIDs.forEach(equipmentId => {
            const isCheckedOut = reservation.checkedOutItems?.includes(equipmentId);
            const isCheckedIn = reservation.checkedInItems?.includes(equipmentId);

            if (!isCheckedOut && !isCheckedIn) {
              awaitingCheckout++;
              available--; 
            }
          });
        });

        // update the data const
        setAvailabilityData([
          { name: 'Available', value: available },
          { name: 'Reported', value: reported },
          { name: 'Awaiting Checkout', value: awaitingCheckout },
          { name: 'Checked Out', value: checkedOut },
        ]);
      } catch (error) {
        console.error("Error fetching data:", error);
      }
    };

    fetchEquipmentAndReservations();

    const fetchUsers = async () => {
      // get data from the 'users' collection
      const usersRef = collection(db, 'users');
      const userSnapshot = await getDocs(usersRef);
      const allUsers = userSnapshot.docs.map(doc => ({
        email: doc.id,
        ...doc.data()
      }));

      const userReportsList = allUsers.map(user => {
        return user.reportCount.map(report => {
          return {
            name: user.email,
            time: report.toDate(),
          };
        });
      }).flat();

      setUserReports(userReportsList);

      const allTimeUserReports = {};
      
        userReportsList.forEach(item => {
          allTimeUserReports[item.name] = (allTimeUserReports[item.name] || 0) + 1;
        });
        updateUserReportsData(allTimeUserReports);

      const userReservationsList = allUsers.map(user => {
        return user.reservations.map(reservation => {
          return {
            name: user.email,
            time: reservation.toDate(),
          };
        });
      }).flat();

      setUserReservations(userReservationsList);

      const allTimeUserReservations = {};
      
        userReservationsList.forEach(item => {
          allTimeUserReservations[item.name] = (allTimeUserReservations[item.name] || 0) + 1;
        });
        updateUserReservationsData(allTimeUserReservations);

    };

    fetchUsers();
  }, []); 

  return (
    <div className="bg-white m-8 p-8 rounded-lg relative">
      <div className="pl-2 pr-2">
        <h1 className="font-bold text-2xl md:text-3xl pb-6">Statistics</h1>
        <div className="flex flex-col sm:flex-row items-center sm:items-center">
          <div>
            <PieChart width={200} height={200}>
              <Pie
                data={availabilityData}
                cx="50%"
                cy="50%"
                outerRadius={90}
                innerRadius={60}
                fill="#8884d8"
                dataKey="value"
              >
                <Label
                  value={totalEquipment + " Total"}
                  position="center"
                  fill="#333"
                  fontSize={20}
                  fontWeight="bold"
                />
                {availabilityData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </div>
          <div className="sm:pl-8 pt-4 sm:pt-0 text-center sm:text-left flex flex-col justify-center">
            {availabilityData.map((entry, index) => (
              <div key={index} className="flex items-center justify-center sm:justify-start space-x-2">
                <span 
                  className="w-3 h-3 rounded-full inline-block" 
                  style={{ backgroundColor: COLORS[index % COLORS.length] }}
                ></span>
                <p>{entry.name}: {entry.value}</p>
              </div>
            ))}
          </div>
        </div>
        {/*}
        <div className='rounded-md border-2 border-black'>
          <h2 className="sm:pl-6 text-xl sm:text-2xl text-center sm:text-left font-semibold pb-4">Overdue Equipment</h2>
        </div>
        */}
        <div className='flex flex-wrap justify-center sm:justify-start'>
          <BarGraph data={reservedItemsData} colors={COLORS} title={"Top Reserved Items"} fullData={reservationsEquipment}/>
          <BarGraph data={brokenEquipmentData} colors={COLORS} title={"Top Reported Items"} fullData={brokenEquipmentReports} />
        </div>
        <div className='flex flex-wrap justify-center sm:justify-start'>
          <BarGraph data={userReportsData} colors={COLORS} title={"Top Reporting Users"} fullData={userReports}/>
          <BarGraph data={userReservationsData} colors={COLORS} title={"Top Reserving Users"} fullData={userReservations}/>
        </div>
        <div className='flex flex-wrap justify-center sm:justify-start'>
          <BarGraph data={reservationTeamsData} colors={COLORS} title={"Top Teams"} fullData={reservationTeams}/>
        </div>
      </div>
    </div>
  );
};

export default Statistics;
