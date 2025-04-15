import { onSchedule } from "firebase-functions/scheduler";
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase-admin/app';

initializeApp();

export const overdueEquipment = onSchedule("every 10 minutes", async() => {

    const db = getFirestore();
    const now = new Date();
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);

    const pastReservations = await db.collection('reservations')
        .where('endDate', '>=', tenMinutesAgo)
        .where('endDate', '<', now)
        .get();


    if (!pastReservations.empty) {

        for (const doc of pastReservations.docs) {
            const data = doc.data();
    
            if (data.checkedOutItems.length > 0) {
                const overdueItems = data.checkedOutItems.map(item => `${item.name} (${item.id})`).join(', ');

                const adminsSnapshot = await db.collection('users')
                .where('isAdmin', '==', true)
                .get();
    
                //send email to every admin
                adminsSnapshot.forEach(async (adminDoc) => {
                    const adminEmail = adminDoc.id;
                    await db.collection('mail').add({
                        to: adminEmail,
                        message: {
                            subject: `Overdue Reservation Alert: ${data.name}`,
                            html: `
                                <h2><strong>The following reservation has overdue items:</strong></h2>
                                <h3>Reservation Name: ${data.name}</h3>
                                <p>User: ${data.userEmail}</p>
                                <p>Items overdue: ${overdueItems}</p>
                            `,
                        },
                    });
                });

                //send email to the user
                await db.collection('mail').add({
                    to: data.userEmail,
                    message: {
                        subject: `Overdue Reservation Alert: ${data.name}`,
                        html: `
                            <h2><strong>The following reservation has overdue items:</strong></h2>
                            <h3>Reservation Name: ${data.name}</h3>
                            <p>Items overdue: ${overdueItems}</p>
                        `,
                    },
                });
                
                //add notification to the database
                await db.collection('notifications').add({
                    type: 'overdue',
                    reservationName: data.name,
                    amount: data.checkedOutItems.length,
                    userEmail: data.userEmail,
                    time: data.endDate,
                    userClosed: false,
                    adminClosed: false
                });
            }
        }
    }
});
