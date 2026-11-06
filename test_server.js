'use strict';

const http = require('http');
const assert = require('assert');
const { server, loadDb, db } = require('./core-server');

const TEST_PORT = 3199;

function request(options, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        port: TEST_PORT,
        host: '127.0.0.1',
        ...options
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: data ? JSON.parse(data) : {} });
          } catch {
            resolve({ status: res.statusCode, data });
          }
        });
      }
    );
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runTests() {
  console.log('=== Running Cheer Stand Test Suite ===\n');
  await loadDb();

  await new Promise((resolve) => server.listen(TEST_PORT, '127.0.0.1', resolve));

  try {
    // 1. Health check
    console.log('1. Testing /api/health...');
    const health = await request({ path: '/api/health', method: 'GET' });
    assert.strictEqual(health.status, 200);
    assert.strictEqual(health.data.mode, 'cheer-stand');
    console.log('  Passed: Health endpoint returned mode cheer-stand');

    // 2. Admin login
    console.log('\n2. Testing Admin Login (user: admin, pass: 1234)...');
    const adminLogin = await request(
      { path: '/api/login', method: 'POST', headers: { 'Content-Type': 'application/json' } },
      { studentId: 'admin', password: '1234' }
    );
    assert.strictEqual(adminLogin.status, 200);
    assert.strictEqual(adminLogin.data.role, 'admin');
    const adminToken = adminLogin.data.token;
    assert.ok(adminToken, 'Admin token should be present');
    console.log('  Passed: Admin authenticated successfully with password 1234');

    // 3. Test Student ID Validation (strictly 5 digits)
    console.log('\n3. Testing 5-Digit Student ID Validation...');
    const badId1 = await request(
      { path: '/api/register', method: 'POST', headers: { 'Content-Type': 'application/json' } },
      { firstName: 'ทดสอบ', lastName: 'หนึ่ง', studentId: '1234', password: 'pass' } // 4 digits
    );
    assert.strictEqual(badId1.status, 400);
    assert.strictEqual(badId1.data.error, 'invalid_student_id');

    const badId2 = await request(
      { path: '/api/register', method: 'POST', headers: { 'Content-Type': 'application/json' } },
      { firstName: 'ทดสอบ', lastName: 'สอง', studentId: '123456', password: 'pass' } // 6 digits
    );
    assert.strictEqual(badId2.status, 400);
    assert.strictEqual(badId2.data.error, 'invalid_student_id');

    // 5 digits must pass
    const testId = '88888';
    // Clean up test user if exists
    delete db.users[testId];

    const goodReg = await request(
      { path: '/api/register', method: 'POST', headers: { 'Content-Type': 'application/json' } },
      { firstName: 'ลูกแม่', lastName: 'รำเพย', studentId: testId, password: 'pass' }
    );
    assert.strictEqual(goodReg.status, 201);
    assert.strictEqual(goodReg.data.user.studentId, testId);
    const playerToken = goodReg.data.token;
    console.log('  Passed: Rejected 4 and 6 digit IDs, accepted 5-digit ID (88888)');

    // 4. Test Protecting Admin from Deletion
    console.log('\n4. Testing Admin Account Protection (Cannot be deleted)...');
    const delAdmin = await request(
      {
        path: '/api/admin/delete',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` }
      },
      { studentId: 'admin' }
    );
    assert.strictEqual(delAdmin.status, 400);
    assert.strictEqual(delAdmin.data.error, 'cannot_delete_admin');
    assert.ok(db.users['admin'], 'Admin must still exist in db');
    console.log('  Passed: Admin account deletion was blocked');

    // 5. Test Non-Negative Score clamping
    console.log('\n5. Testing Score Clamping (No negative scores)...');
    const negProgress = await request(
      {
        path: '/api/progress',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${playerToken}` }
      },
      { score: -500, progress: 1, correct: 0, wrong: 1 }
    );
    assert.strictEqual(negProgress.status, 200);
    assert.strictEqual(negProgress.data.user.score, 0, 'Score should clamp to 0 minimum');
    console.log('  Passed: Score cannot be negative, clamped to 0');

    // 6. Test Finishing Game and History Recording
    console.log('\n6. Testing Game Completion and History Logging...');
    const finishRun = await request(
      {
        path: '/api/progress',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${playerToken}` }
      },
      { score: 1500, progress: 5, correct: 5, wrong: 0, finished: true, timeUsed: 320, runId: 'test-run-1' }
    );
    assert.strictEqual(finishRun.status, 200);
    assert.strictEqual(finishRun.data.user.finished, true);
    assert.strictEqual(finishRun.data.user.bestScore, 1500);
    assert.strictEqual(finishRun.data.user.playCount, 1);
    assert.strictEqual(finishRun.data.user.history.length, 1);
    console.log('  Passed: Completed game logged into history and bestScore updated to 1500');

    // 7. Test Replayability (Users can restart anytime)
    console.log('\n7. Testing Replayability (Users can replay without lock)...');
    const restartRun = await request(
      {
        path: '/api/restart',
        method: 'POST',
        headers: { Authorization: `Bearer ${playerToken}` }
      }
    );
    assert.strictEqual(restartRun.status, 200);
    assert.strictEqual(restartRun.data.user.finished, false);
    assert.strictEqual(restartRun.data.user.score, 0);
    assert.strictEqual(restartRun.data.user.bestScore, 1500, 'bestScore should persist');
    assert.strictEqual(restartRun.data.user.history.length, 1, 'Previous history must persist');
    console.log('  Passed: User restarted game successfully while retaining history and high score');

    // 8. Test Admin Users List
    console.log('\n8. Testing Admin Users List and Leaderboard Data...');
    const adminUsers = await request({
      path: '/api/admin/users',
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.strictEqual(adminUsers.status, 200);
    assert.ok(Array.isArray(adminUsers.data.users));
    const found = adminUsers.data.users.find((u) => u.studentId === testId);
    assert.ok(found, 'Created test user should be present in admin list');
    assert.strictEqual(found.bestScore, 1500);
    console.log('  Passed: Admin user list returns complete user info with history');

    // Clean up test user
    delete db.users[testId];

    console.log('\n=== ALL TESTS PASSED SUCCESSFULLY! ===\n');
  } finally {
    server.close();
  }
}

runTests().catch((err) => {
  console.error('\nTest failed:', err);
  process.exit(1);
});
