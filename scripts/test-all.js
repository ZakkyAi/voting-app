/**
 * API Feature Test Script
 * This script tests Statement Creation, Public Retrieval, Voting, and Deletion.
 * 
 * Requirement: The local server must be running (npm run dev) on http://localhost:3001
 */

const BASE_URL = 'http://localhost:3001/api';
const ADMIN_KEY = 'admin123'; // Matches .env

async function test() {
  console.log('🚀 Starting API Feature Tests...\n');

  let testStatementId = null;

  // 1. Test Admin Creation
  try {
    console.log('1. [Admin] Creating a test statement...');
    const res = await fetch(`${BASE_URL}/statements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': ADMIN_KEY },
      body: JSON.stringify({ text: 'Test Statement ' + Date.now() })
    });
    const data = await res.json();
    if (res.ok) {
      testStatementId = data.id;
      console.log('✅ Success: Created ID', testStatementId);
    } else {
      throw new Error(`Failed to create: ${JSON.stringify(data)}`);
    }
  } catch (err) {
    console.error('❌ Error in Statement Creation:', err.message);
    console.log('💡 TIP: Is the server running? Run "npm run dev" first.');
    return;
  }

  // 2. Test Voting (Public)
  try {
    console.log('\n2. [Public] Voting UP on the statement...');
    const res = await fetch(`${BASE_URL}/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        statementId: testStatementId, 
        type: 'up', 
        turnstileToken: 'TEST_TOKEN' // Will pass if TURNSTILE_SECRET_KEY is the testing one
      })
    });
    const data = await res.json();
    if (res.ok) {
      console.log('✅ Success: Vote cast. Score is now:', data.statement.votes);
    } else {
      console.warn('⚠️ Vote failed (likely Turnstile verification rejected the TEST_TOKEN)');
      console.warn('   Reason:', data.error);
    }
  } catch (err) {
    console.error('❌ Error in Voting:', err.message);
  }

  // 3. Test Retrieval & Ranking
  try {
    console.log('\n3. [Public] Fetching all statements...');
    const res = await fetch(`${BASE_URL}/statements`);
    const data = await res.json();
    if (res.ok) {
      const found = data.find(s => s.id === testStatementId);
      if (found) {
        console.log('✅ Success: Statement found in list with score:', found.votes);
      } else {
        console.error('❌ Error: Statement not found in list.');
      }
    }
  } catch (err) {
    console.error('❌ Error in Retrieval:', err.message);
  }

  // 4. Test Admin Deletion
  try {
    console.log('\n4. [Admin] Deleting the test statement...');
    const res = await fetch(`${BASE_URL}/statements/${testStatementId}`, {
      method: 'DELETE',
      headers: { 'x-admin-key': ADMIN_KEY }
    });
    if (res.ok) {
      console.log('✅ Success: Statement deleted.');
    } else {
      throw new Error(`Delete failed`);
    }
  } catch (err) {
    console.error('❌ Error in Deletion:', err.message);
  }

  console.log('\n✨ All tests completed.');
}

test();
