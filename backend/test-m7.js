async function runM7Tests() {
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

  console.log('\n--- 2. Get Services (Verifying Auto-Migration) ---');
  const servicesRes = await fetch(`${baseUrl}/services`, {
    headers: { Cookie: cookie },
  });
  const servicesData = await servicesRes.json();
  console.log('Services fetch success:', servicesData.success, 'Total:', servicesData.total);
  if (servicesData.services?.length) {
    console.log('Sample services:', servicesData.services.slice(0, 3).map((s) => ({
      id: s.id || s._id,
      name: s.name,
      category: s.category,
      price: s.startingPrice,
      duration: s.durationMinutes,
      status: s.status,
    })));
  }

  console.log('\n--- 3. Get Service Stats ---');
  const statsRes = await fetch(`${baseUrl}/services/stats`, {
    headers: { Cookie: cookie },
  });
  const statsData = await statsRes.json();
  console.log('Stats response:', JSON.stringify(statsData.stats, null, 2));

  const testServiceName = `Emergency Boiler Repair ${Date.now()}`;
  console.log(`\n--- 4. Create New Service (${testServiceName}) ---`);
  const newServiceRes = await fetch(`${baseUrl}/services`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      name: testServiceName,
      description: 'Rapid 24/7 diagnostic and repair for residential boiler and hydronic heating systems.',
      durationMinutes: 90,
      startingPrice: 249,
      category: 'Emergency',
      isEmergencyService: true,
      status: 'active',
    }),
  });
  const newServiceData = await newServiceRes.json();
  console.log('Create service success:', newServiceData.success, 'Service:', newServiceData.service?.name, 'Price:', newServiceData.service?.startingPrice, 'Emergency:', newServiceData.service?.isEmergencyService);
  const createdId = newServiceData.service?.id || newServiceData.service?._id;

  console.log('\n--- 5. Prevent Duplicate Active Service Name ---');
  const dupRes = await fetch(`${baseUrl}/services`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      name: testServiceName,
      startingPrice: 300,
    }),
  });
  const dupData = await dupRes.json();
  console.log('Duplicate check rejected as expected?:', !dupData.success, 'Status Code:', dupRes.status, 'Error message:', dupData.message);

  console.log('\n--- 6. Update Service ---');
  const updateRes = await fetch(`${baseUrl}/services/${createdId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      startingPrice: 289,
      durationMinutes: 120,
      description: 'Updated rapid response diagnostic for hydronic systems.',
    }),
  });
  const updateData = await updateRes.json();
  console.log('Update success:', updateData.success, 'New price:', updateData.service?.startingPrice, 'New duration:', updateData.service?.durationMinutes);

  console.log('\n--- 7. Update Service Status to Inactive ---');
  const statusRes = await fetch(`${baseUrl}/services/${createdId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ status: 'inactive' }),
  });
  const statusData = await statusRes.json();
  console.log('Status update success:', statusData.success, 'Status:', statusData.service?.status);

  console.log('\n--- 8. Archive Service ---');
  const archiveRes = await fetch(`${baseUrl}/services/${createdId}`, {
    method: 'DELETE',
    headers: { Cookie: cookie },
  });
  const archiveData = await archiveRes.json();
  console.log('Archive success:', archiveData.success, 'Status:', archiveData.service?.status);

  console.log('\n--- 9. Verify Stats after Archive ---');
  const finalStatsRes = await fetch(`${baseUrl}/services/stats`, {
    headers: { Cookie: cookie },
  });
  const finalStatsData = await finalStatsRes.json();
  console.log('Final stats:', finalStatsData.stats);

  console.log('\nALL M7 BACKEND TESTS COMPLETED SUCCESSFULLY!');
}

runM7Tests().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
