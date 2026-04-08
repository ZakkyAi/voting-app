require('dotenv').config();
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      project_id: process.env.FIREBASE_PROJECT_ID,
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const db = admin.firestore();

async function testQuery() {
  try {
    console.log('Testing query: .orderBy("votes", "desc").orderBy("createdAt", "desc")');
    const snap = await db.collection('statements')
      .orderBy('votes', 'desc')
      .orderBy('createdAt', 'desc')
      .get();
    console.log('Success! Documents found:', snap.size);
  } catch (err) {
    console.error('QUERY FAILED:');
    console.error(err.message);
    if (err.details && err.details.includes('index')) {
      console.log('\nTIP: You likely need to create a composite index in the Firebase Console.');
    }
  } finally {
    process.exit();
  }
}

testQuery();
