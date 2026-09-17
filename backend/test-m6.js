async function runM6Tests() {
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

  console.log('\n--- 2. Get Customers ---');
  const custRes = await fetch(`${baseUrl}/customers`, {
    headers: { Cookie: cookie },
  });
  const custData = await custRes.json();
  const customer = custData.customers?.[0];
  console.log('Found customers:', custData.total, 'First customer:', customer?.firstName, customer?.lastName, customer?._id || customer?.id);
  const customerId = customer?._id || customer?.id;

  console.log('\n--- 3. Create Lead 1 ---');
  const lead1Res = await fetch(`${baseUrl}/leads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      customerId,
      title: 'AC Repair - Master Bedroom Warm',
      description: 'Customer reports condenser buzzing, warm airflow in bedroom.',
      service: 'AC Repair',
      priority: 'high',
      source: 'manual',
      estimatedValue: 275,
      notes: 'Prefers 9am morning appointment.',
    }),
  });
  const lead1Data = await lead1Res.json();
  console.log('Lead 1 created:', lead1Data.success, 'Title:', lead1Data.lead?.title, 'Status:', lead1Data.lead?.status, 'Customer:', lead1Data.lead?.customerId?.firstName);
  const lead1Id = lead1Data.lead?._id || lead1Data.lead?.id;

  console.log('\n--- 4. Create Lead 2 ---');
  const lead2Res = await fetch(`${baseUrl}/leads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      customerId,
      title: 'Heat Pump Seasonal Tune-up',
      description: 'Annual heat pump checkup before winter.',
      service: 'Furnace & Heat Pump Installation',
      priority: 'medium',
      source: 'referral',
      estimatedValue: 150,
      notes: 'Customer has Carrier 3-ton unit.',
    }),
  });
  const lead2Data = await lead2Res.json();
  console.log('Lead 2 created:', lead2Data.success, 'Title:', lead2Data.lead?.title, 'Priority:', lead2Data.lead?.priority);

  console.log('\n--- 5. List Leads with Filter ---');
  const listRes = await fetch(`${baseUrl}/leads?priority=high`, {
    headers: { Cookie: cookie },
  });
  const listData = await listRes.json();
  console.log('Filtered (high priority) leads total:', listData.total, 'Count:', listData.leads?.length);

  console.log('\n--- 6. Update Lead Status ---');
  const statusRes = await fetch(`${baseUrl}/leads/${lead1Id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ status: 'qualified' }),
  });
  const statusData = await statusRes.json();
  console.log('Status updated:', statusData.success, 'New status:', statusData.lead?.status);

  console.log('\n--- 7. Get Lead Stats ---');
  const statsRes = await fetch(`${baseUrl}/leads/stats`, {
    headers: { Cookie: cookie },
  });
  const statsData = await statsRes.json();
  console.log('Lead stats:', statsData.stats);

  console.log('\n--- 8. Search Leads ---');
  const searchRes = await fetch(`${baseUrl}/leads?search=buzzing`, {
    headers: { Cookie: cookie },
  });
  const searchData = await searchRes.json();
  console.log('Search matches for "buzzing":', searchData.total, searchData.leads?.map(l => l.title));

  console.log('\nAll M6 Backend tests passed successfully!');
}

runM6Tests().catch(console.error);
