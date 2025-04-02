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
  const [overdueEquipment, setOverdueEquipment] = useState([]);
  const [overdueEquipmentTimes, setOverdueEquipmentTimes] = useState([]);
  const [overdueRecords, setOverdueRecords] = useState([]);
  const [reportSubjects, setReportSubjects] = useState([]);
  const [reportSubjectsData, setReportSubjectsData] = useState([]);
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

  const updateReportSubjectsData = (subject) => {
    const topSubjects = Object.entries(subject)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value) 
      .slice(0, 5);
    
    setReportSubjectsData(topSubjects);
  };

  const createOverdueRecords = (overdueEquipmentParam, overdueEquipmentTimesParam) => {
    //have overdue times for the items that were checked back in
    //have ovedue items in general
    //name: number of overdue equipment: avg overdue time: list of overdue times:
    const combinedRecords = {};

    overdueEquipmentParam.forEach(record => {
      const user = record.user;
      if (!combinedRecords[user]) {
        combinedRecords[user] = { 
          user: user, 
          numberOfOverdueEquipment: 0, 
          overdueTimes: [],
          avgTime: '',
          overdueTimesDisplay: ''
        };
      }
      combinedRecords[user].numberOfOverdueEquipment += 1;
    });

    overdueEquipmentTimesParam.forEach(record => {
      const user = record.user;
      if (!combinedRecords[user]) {
        combinedRecords[user] = { 
          name: user, 
          numberOfOverdueEquipment: 0, 
          overdueTimes: [],
          avgTime: '',
          overdueTimesDisplay: ''
        };
      }
      combinedRecords[user].overdueTimes.push({converted: record.time, total: record.totalMinutes});
      combinedRecords[user].numberOfOverdueEquipment += 1;
    });

    Object.values(combinedRecords).forEach(record => {
      let totalTime = 0;
      record.overdueTimes.forEach(time => {
        totalTime += time.total;

        if (record.overdueTimesDisplay !== '') {
          record.overdueTimesDisplay += ', '
        } 
        record.overdueTimesDisplay += time.converted;
      });
      const avgTimeMinutes = Math.floor(totalTime / record.overdueTimes.length);
      const days = Math.floor(avgTimeMinutes / (60 * 24)); 
      const hours = Math.floor((avgTimeMinutes % (60 * 24)) / 60); 
      const minutes = avgTimeMinutes % 60; 

      record.avgTime = `${days}d ${hours}h ${minutes}m`;

    });

    setOverdueRecords(Object.values(combinedRecords));
  }
  

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

        console.log("here");

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

        const reservationsOverdueItemsList = allReservations.map(reservation => {
          const endDate = reservation.endDate.toDate();
          return reservation.overdueItems.map(equipment => {
            const checkInTime = equipment.time.toDate();
            const diffMs = checkInTime - endDate; //difference in milliseconds

            //calculate days, hours, minutes
            const totalMinutes = Math.floor(diffMs / (1000 * 60));
            const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

            return {
              user: reservation.userEmail,
              id: equipment.id,
              time: `${days}d ${hours}h ${minutes}m`,
              totalMinutes: totalMinutes
            };
          });
        }).flat();
        setOverdueEquipmentTimes(reservationsOverdueItemsList);
  
        const allTimeTeams = {};
        reservationsTeamsList.forEach(item => {
          allTimeTeams[item.name] = (allTimeTeams[item.name] || 0) + 1;
        });
        updateReservationsTeamsData(allTimeTeams);

        const overdueEquipmentList = allReservations.map(reservation => {
          const endDate = reservation.endDate.toDate();
          if (endDate < currentDate) {
            return reservation.checkedOutItems.map(item => {
              return {
                name: item.name,
                id: item.id,
                user: reservation.userEmail
              };
            })
          }
          return null;
        })
        .filter(item => item !== null)
        .flat();
        setOverdueEquipment(overdueEquipmentList);

        const activeReservations = allReservations.filter(reservation => {
          const endDate = reservation.endDate.toDate();
          const startDate = reservation.startDate.toDate();
          return (endDate >= currentDate && startDate <= currentDate);
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

        createOverdueRecords(overdueEquipmentList, reservationsOverdueItemsList);
        
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

    const fetchMail = async () => {
      const mailRef = collection(db, 'mail');
      const mailSnapshot = await getDocs(mailRef);
      const allMail = mailSnapshot.docs.map(doc => {
        const data = doc.data();
        if (data.type && data.type.subject !== undefined) {
          return {
            name: data.type.subject,
            time: data.delivery.startTime.toDate()
          };
        }
        return null;
      }).filter(mail => mail !== null);

      setReportSubjects(allMail);

      const allTimeMail = {};
        allMail.forEach(item => {
          allTimeMail[item.name] = (allTimeMail[item.name] || 0) + 1;
        });
        updateReportSubjectsData(allTimeMail);
    }

    fetchMail();
  }, []);

  return (
    <div className="bg-white m-8 p-8 rounded-lg relative">
      <div className="sm:pl-2 sm:pr-2">
        <h1 className="font-bold text-2xl md:text-3xl pb-6">Statistics</h1>
        <div className="flex flex-wrap items-start">
          <div className="flex flex-col sm:flex-row items-center pb-6 sm:pr-10 sm:pl-6 w-full sm:w-auto">
            <div className="flex justify-center items-center w-full sm:w-auto">
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

          <div className="w-full sm:w-3/5 sm:min-w-lg mt-4 sm:mt-0 sm:pl-6">
            <div className="rounded-md border-2 border-black h-full w-full">
              <h2 className="p-4 pb-0 text-xl sm:text-2xl text-center sm:text-left font-semibold">Overdue Equipment</h2>
              <div className="p-4">
                <div className="flex py-2 font-semibold">
                  <div className="flex-1 pl-1">Equipment (ID)</div>
                  <div className="flex-1 pr-1 sm:pr-0 sm:text-left text-right">User</div>
                </div>
                {overdueEquipment.length === 0 ? (
                  <div className='text-center border-t w-full text-lg font-bold pt-4'>
                    <h1>No Overdue Equipment!</h1>
                  </div>
                ) : (
                <ul>
                  {overdueEquipment.map((equipment) => (
                    <li key={equipment.id} className="flex py-2 border-t">
                      <div className="flex-1 pl-1 text-sm sm:text-base">{equipment.name} ({equipment.id})</div>
                      <div className="flex-1 pr-1 sm:pr-0 sm:text-left text-right text-sm sm:text-base">{equipment.user}</div>
                    </li>
                  ))}
                </ul>
                )}
              </div>
            </div>
          </div>
        </div>

        <h2 className="sm:pl-6 text-xl sm:text-3xl text-center sm:text-left font-semibold pt-8">Reports Data</h2>
        <div className='flex flex-wrap justify-center sm:justify-start'>
          <BarGraph data={brokenEquipmentData} colors={COLORS} title={"Top Reported Items"} fullData={brokenEquipmentReports} />
          <BarGraph data={userReportsData} colors={COLORS} title={"Top Reporting Users"} fullData={userReports}/>
        </div>
        <BarGraph data={reportSubjectsData} colors={COLORS} title={"Top Reported Subjects"} fullData={reportSubjects}/>

        <h2 className="sm:pl-6 text-xl sm:text-3xl text-center sm:text-left font-semibold pt-8">Reservations Data</h2>
        <div className='flex flex-wrap justify-center sm:justify-start'>
          <BarGraph data={reservedItemsData} colors={COLORS} title={"Top Reserved Items"} fullData={reservationsEquipment}/>
          <BarGraph data={userReservationsData} colors={COLORS} title={"Top Reserving Users"} fullData={userReservations}/>
        </div>
        <BarGraph data={reservationTeamsData} colors={COLORS} title={"Top Teams"} fullData={reservationTeams}/>

        <div className='pt-8 sm:pt-12'>
          <h2 className="sm:pl-6 text-xl sm:text-2xl text-center sm:text-left font-semibold pb-4">Overdue Equipment Record</h2>
          <div className="p-4 pt-2">
            <div className="flex py-2 font-semibold">
                <div className="flex-1 pl-1 ">User</div>
                <div className="flex-1 sm:text-left text-right pr-1 sm:pr-0 sm:text-left text-right">Total Instances</div>
                <div className="flex-1 hidden sm:block">Average Overdue Time</div>
                <div className="flex-1 text-base hidden md:block">Overdue Times</div>
            </div>
            <ul>
                {overdueRecords.map((record) => (
                    <li key={record.user} className="flex py-2 border-t">
                        <div className="flex-1 pl-1 text-sm sm:text-base">{record.user}</div>
                        <div className="flex-1 text-sm sm:text-base pr-1 sm:pr-0 sm:text-left text-right">{record.numberOfOverdueEquipment}</div>
                        <div className="flex-1 hidden sm:block">{record.avgTime === 'NaNd NaNh NaNm' ? 'N/A' : record.avgTime}</div>
                        <div className="flex-1 text-base hidden md:block">{record.overdueTimesDisplay === '' ? 'N/A' : record.overdueTimesDisplay}</div>
                    </li>
                ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Statistics;
