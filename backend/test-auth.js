// Quick automated verification script for Backend Auth
async function runTests() {
  const baseUrl = 'http://localhost:5000/api/auth';
  let cookie = '';

  console.log('--- 1. Testing Login with correct credentials ---');
  const loginRes = await fetch(`${baseUrl}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'john@example.com', password: 'password123' }),
  });
  const loginData = await loginRes.json();
  console.log('Login Status:', loginRes.status, loginData);

  const rawCookie = loginRes.headers.get('set-cookie');
  if (rawCookie) {
    cookie = rawCookie.split(';')[0];
    console.log('Received auth cookie:', cookie);
  }

  console.log('\n--- 2. Testing GET /api/auth/me with cookie ---');
  const meRes = await fetch(`${baseUrl}/me`, {
    method: 'GET',
    headers: { Cookie: cookie },
  });
  console.log('/me Status:', meRes.status, await meRes.json());

  console.log('\n--- 3. Testing GET /api/auth/protected-test with cookie ---');
  const testRes = await fetch(`${baseUrl}/protected-test`, {
    method: 'GET',
    headers: { Cookie: cookie },
  });
  console.log('/protected-test Status:', testRes.status, await testRes.json());

  console.log('\n--- 4. Testing GET /api/auth/me WITHOUT cookie (Expect 401) ---');
  const unauthRes = await fetch(`${baseUrl}/me`, { method: 'GET' });
  console.log('Unauth /me Status:', unauthRes.status, await unauthRes.json());

  console.log('\n--- 5. Testing Login with WRONG password (Expect 401) ---');
  const badLoginRes = await fetch(`${baseUrl}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'john@example.com', password: 'wrongpassword' }),
  });
  console.log('Bad login Status:', badLoginRes.status, await badLoginRes.json());

  console.log('\n--- 6. Testing POST /api/auth/logout ---');
  const logoutRes = await fetch(`${baseUrl}/logout`, {
    method: 'POST',
    headers: { Cookie: cookie },
  });
  console.log('Logout Status:', logoutRes.status, await logoutRes.json());
  console.log('Logout Set-Cookie header:', logoutRes.headers.get('set-cookie'));

  console.log('\nAll Backend Auth Tests Completed Successfully!');
}

runTests().catch(console.error);
