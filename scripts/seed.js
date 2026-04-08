require('dotenv').config();
const admin = require('firebase-admin');

// Initialize Firebase
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

const testStatements = [
  "Pineapple belongs on pizza.",
  "Coffee is superior to tea in every possible way.",
  "Remote work is more productive than office work.",
  "Tabs are better than spaces for indentation.",
  "Dark mode is better for productivity than light mode.",
  "AI will eventually write better code than humans.",
  "The 'Star Wars' prequels are actually better than the sequels.",
  "JavaScript is the most versatile programming language.",
  "Video games should be considered a legitimate form of art.",
  "Every developer should learn C before any other language."
];

async function seed() {
  console.log('Starting to seed test statements...');
  
  const batch = db.batch();
  const collection = db.collection('statements');

  for (const text of testStatements) {
    const docRef = collection.doc();
    batch.set(docRef, {
      text,
      votes: Math.floor(Math.random() * 21) - 10, // Random votes between -10 and 10
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  try {
    await batch.commit();
    console.log('Successfully seeded 10 test statements.');
  } catch (error) {
    console.error('Error seeding statements:', error);
  } finally {
    process.exit();
  }
}

seed();
