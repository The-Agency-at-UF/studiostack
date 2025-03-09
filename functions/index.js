import { onSchedule } from "firebase-functions/scheduler";
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase-admin/app';

initializeApp();

//TODO: change it to however often they want it to be sent
export const helloWorld = onSchedule("every 72 hours", async() => {

    const db = getFirestore();
    const now = new Date();

    const pastReservations = await db.collection('reservations')
        .where('endDate', '<', now)
        .get();


    if (!pastReservations.empty) {
        let overdueEquipmentDetails = '';

        for (const doc of pastReservations.docs) {
            const data = doc.data();
    
            if (data.checkedOutItems.length > 0) {
                const overdueItems = data.checkedOutItems.map(item => `${item.name} (${item.id})`).join(', ');

                overdueEquipmentDetails += `
                    <h3>Reservation Name: ${data.name}</h3>
                    <p>User: ${data.userEmail}</p>
                    <p>Items overdue: ${overdueItems}</p>
                    <hr/>
                `;
            }
        }

        if (overdueEquipmentDetails) {
            //TODO: UNCOMMENT THIS CODE TO HAVE IT SENT TO ADMIN EMAILS
            // const adminsSnapshot = await db.collection('users')
            //     .where('isAdmin', '==', true)
            //     .get();
    
            // adminsSnapshot.forEach(async (adminDoc) => {
            //     const adminEmail = adminDoc.id;
            //     await db.collection('mail').add({
            //         to: adminEmail,
            //         message: {
            //             subject: 'Overdue Reservation Alert',
            //             html: `
            //                 <p><strong>The following reservations have overdue items:</strong></p>
            //                 ${overdueEquipmentDetails}
            //             `,
            //         },
            //     });
            // });

            await db.collection('mail').add({
                to: 'theagencyatufdevs@gmail.com',
                message: {
                    subject: 'Overdue Reservation Alert',
                    html: `
                        <p><strong>The following reservations have overdue items:</strong></p>
                        ${overdueEquipmentDetails}
                    `,
                },
            });
        }
    }
});
