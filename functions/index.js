import { onSchedule } from "firebase-functions/scheduler";
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase-admin/app';

initializeApp();

//TODO: change to "every 10 minutes" when website is done
export const overdueEquipment = onSchedule("every 72 hours", async() => {

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
            }
        }

    }
});
