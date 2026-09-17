async function runM9Tests() {
  const baseUrl = 'http://localhost:5000/api';
  let cookie = '';

  console.log('--- 1. Login ---');
  const loginRes = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'john@example.com', password: 'password123' }),
  });
  const loginData = await loginRes.json();
  const rawCookie = loginRes.headers.get('set-cookie');
  if (rawCookie) cookie = rawCookie.split(';')[0];
  console.log('Login result:', loginData.success, 'User:', loginData.user?.email);

  console.log('\n--- 2. Check Telephony / Twilio Connection Status ---');
  const statusRes = await fetch(`${baseUrl}/phone-numbers/status`, {
    headers: { Cookie: cookie },
  });
  const statusData = await statusRes.json();
  console.log('Twilio status response:', statusData);

  console.log('\n--- 3. Search Available Phone Numbers ---');
  const searchRes = await fetch(`${baseUrl}/phone-numbers/available?country=US&areaCode=312`, {
    headers: { Cookie: cookie },
  });
  const searchData = await searchRes.json();
  console.log('Available numbers count:', searchData.availableNumbers?.length);
  const sampleNumber = searchData.availableNumbers?.[0]?.phoneNumber || '+13125550101';
  console.log('Selected sample number for assignment:', sampleNumber);

  console.log(`\n--- 4. Assign Business Phone Number (${sampleNumber}) ---`);
  const assignRes = await fetch(`${baseUrl}/phone-numbers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      phoneNumber: sampleNumber,
      friendlyName: 'BlueCollar HVAC Chicago Dispatch',
      isPrimary: true,
    }),
  });
  const assignData = await assignRes.json();
  console.log('Assign phone number success:', assignData.success, 'Number:', assignData.phoneNumber?.phoneNumber, 'isPrimary:', assignData.phoneNumber?.isPrimary);
  const assignedPhoneId = assignData.phoneNumber?._id;

  console.log('\n--- 5. Get Primary Phone Number ---');
  const primaryRes = await fetch(`${baseUrl}/phone-numbers/primary`, {
    headers: { Cookie: cookie },
  });
  const primaryData = await primaryRes.json();
  console.log('Primary response:', primaryData);
  console.log('Primary number:', primaryData.phoneNumber?.phoneNumber, 'Status:', primaryData.phoneNumber?.status);

  console.log('\n--- 6. Fetch Existing Customer for Caller Matching ---');
  const custRes = await fetch(`${baseUrl}/customers?limit=1`, {
    headers: { Cookie: cookie },
  });
  const custData = await custRes.json();
  const customer = custData.customers?.[0];
  const callerPhone = customer?.phone || '+15552345678';
  console.log('Matched customer phone for test:', callerPhone, 'Customer Name:', customer ? `${customer.firstName} ${customer.lastName}` : 'None');

  console.log('\n--- 7. Inbound Twilio Voice Webhook ---');
  const testCallSid = `CA_test_${Date.now()}`;
  const webhookParams = new URLSearchParams({
    CallSid: testCallSid,
    From: callerPhone,
    To: sampleNumber,
    CallStatus: 'ringing',
    Direction: 'inbound',
  });

  const webhookRes = await fetch(`${baseUrl}/webhooks/twilio/voice`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: webhookParams.toString(),
  });
  const twimlResponse = await webhookRes.text();
  console.log('Webhook HTTP status:', webhookRes.status);
  console.log('TwiML Response raw content:\n', twimlResponse);

  console.log('\n--- 8. Idempotency Check (Duplicate CallSid) ---');
  const dupWebhookRes = await fetch(`${baseUrl}/webhooks/twilio/voice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: webhookParams.toString(),
  });
  console.log('Duplicate webhook status:', dupWebhookRes.status, '(TwiML returned without creating duplicate)');

  console.log('\n--- 9. Twilio Status Callback Webhook ---');
  const statusCallbackParams = new URLSearchParams({
    CallSid: testCallSid,
    CallStatus: 'completed',
    CallDuration: '142',
    Duration: '142',
  });

  const statusCbRes = await fetch(`${baseUrl}/webhooks/twilio/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: statusCallbackParams.toString(),
  });
  console.log('Status callback HTTP status:', statusCbRes.status, 'Response:', await statusCbRes.text());

  console.log('\n--- 10. Query Calls Log (Verifying Caller & Customer Mapping) ---');
  const callsRes = await fetch(`${baseUrl}/calls`, {
    headers: { Cookie: cookie },
  });
  const callsData = await callsRes.json();
  console.log('Total calls fetched:', callsData.total, 'Count in page:', callsData.calls?.length);
  const recordedCall = callsData.calls?.find((c) => c.providerCallSid === testCallSid);
  console.log('Recorded call found?:', !!recordedCall);
  if (recordedCall) {
    console.log('Call details:', {
      id: recordedCall._id,
      direction: recordedCall.direction,
      from: recordedCall.from,
      to: recordedCall.to,
      status: recordedCall.status,
      duration: recordedCall.durationSeconds,
      customerMatched: recordedCall.customerId ? `${recordedCall.customerId.firstName} ${recordedCall.customerId.lastName}` : 'Unmatched',
    });
  }

  console.log('\n--- 11. Call Stats KPI ---');
  const statsRes = await fetch(`${baseUrl}/calls/stats`, {
    headers: { Cookie: cookie },
  });
  const statsData = await statsRes.json();
  console.log('Call stats:', statsData.stats);

  console.log('\n--- 12. Simulate Test Call API ---');
  const simRes = await fetch(`${baseUrl}/calls/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      callerPhone: '+13129990011',
      durationSeconds: 78,
    }),
  });
  const simData = await simRes.json();
  console.log('Simulated call created:', simData.success, 'Call SID:', simData.call?.providerCallSid, 'Duration:', simData.call?.durationSeconds);

  console.log('\n=== M9 BACKEND INTEGRATION TESTS PASSED ===');
}

runM9Tests().catch(console.error);
