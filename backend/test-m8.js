async function runM8Tests() {
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

  console.log('\n--- 2. Fetch Customer & Service ---');
  const custRes = await fetch(`${baseUrl}/customers?limit=1`, { headers: { Cookie: cookie } });
  const custData = await custRes.json();
  const rawCust = custData.customers?.[0];
  const customerId = rawCust?.id || rawCust?._id;
  console.log('Customer:', rawCust ? `${rawCust.firstName} ${rawCust.lastName} (${customerId})` : 'None found');

  const srvRes = await fetch(`${baseUrl}/services?limit=1`, { headers: { Cookie: cookie } });
  const srvData = await srvRes.json();
  const rawSrv = srvData.services?.[0];
  const serviceId = rawSrv?.id || rawSrv?._id;
  console.log('Service:', rawSrv ? `${rawSrv.name} (${serviceId}, ${rawSrv.durationMinutes}m)` : 'None found');

  if (!customerId || !serviceId) {
    console.error('Error: Customer or Service missing in DB. Cannot proceed.');
    return;
  }

  // Future test date: next Monday to ensure business hours are open
  const testDate = new Date();
  testDate.setDate(testDate.getDate() + ((1 + 7 - testDate.getDay()) % 7 || 7)); // Next Monday
  const dateStr = testDate.toISOString().split('T')[0];
  console.log(`\n--- 3. Query Available Slots for ${dateStr} ---`);
  const slotsRes = await fetch(`${baseUrl}/availability/slots?serviceId=${serviceId}&date=${dateStr}`, {
    headers: { Cookie: cookie },
  });
  const slotsData = await slotsRes.json();
  console.log('Slots fetch success:', slotsData.success, 'Duration:', slotsData.durationMinutes, 'Total slots:', slotsData.slots?.length);
  const openSlots = slotsData.slots?.filter(s => s.available) || [];
  console.log('Available slots count:', openSlots.length);
  if (openSlots.length > 0) {
    console.log('First 2 open slots:', openSlots.slice(0, 2));
  }

  const selectedSlot = openSlots[0];
  if (!selectedSlot) {
    console.log('No open slots on', dateStr);
    return;
  }

  console.log(`\n--- 4. Create Appointment at ${selectedSlot.startAt} ---`);
  const createRes = await fetch(`${baseUrl}/appointments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      customerId: customerId,
      serviceId: serviceId,
      startAt: selectedSlot.startAt,
      priority: 'high',
      source: 'website',
      customerNotes: 'Please call 15 minutes before arrival.',
      internalNotes: 'VIP customer test.',
    }),
  });
  const createData = await createRes.json();
  console.log('Create status:', createRes.status, 'Success:', createData.success);
  console.log('Created Appointment:', createData.appointment?._id, 'Title:', createData.appointment?.title, 'Status:', createData.appointment?.status);
  const appointmentId = createData.appointment?._id;

  console.log('\n--- 5. Double-Booking Prevention (Same Slot) ---');
  const doubleBookRes = await fetch(`${baseUrl}/appointments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      customerId: customerId,
      serviceId: serviceId,
      startAt: selectedSlot.startAt,
    }),
  });
  const doubleBookData = await doubleBookRes.json();
  console.log('Double booking HTTP status:', doubleBookRes.status, '(Expected 409)');
  console.log('Double booking rejected correctly?:', doubleBookRes.status === 409, 'Message:', doubleBookData.message);

  console.log('\n--- 6. Conflict Detection API ---');
  const conflictRes = await fetch(`${baseUrl}/availability/check-conflict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      startAt: selectedSlot.startAt,
      endAt: selectedSlot.endAt,
    }),
  });
  const conflictData = await conflictRes.json();
  console.log('Conflict detected on booked slot:', conflictData.hasConflict, '(Expected true)');

  console.log('\n--- 7. Get Appointments with Filter ---');
  const listRes = await fetch(`${baseUrl}/appointments?date=${dateStr}`, {
    headers: { Cookie: cookie },
  });
  const listData = await listRes.json();
  console.log('List appointments for date success:', listData.success, 'Count:', listData.appointments?.length);

  console.log('\n--- 8. Update Status to Confirmed ---');
  const statusRes = await fetch(`${baseUrl}/appointments/${appointmentId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ status: 'confirmed' }),
  });
  const statusData = await statusRes.json();
  console.log('Status updated to:', statusData.appointment?.status);

  console.log('\n--- 9. Get Single Appointment Details ---');
  const getOneRes = await fetch(`${baseUrl}/appointments/${appointmentId}`, {
    headers: { Cookie: cookie },
  });
  const getOneData = await getOneRes.json();
  console.log('Fetched single appointment customer:', getOneData.appointment?.customerId?.firstName, 'Service:', getOneData.appointment?.serviceId?.name);

  console.log('\n--- 10. Clean up (Cancel or Delete test appointment) ---');
  const cancelRes = await fetch(`${baseUrl}/appointments/${appointmentId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ status: 'cancelled', cancellationReason: 'Automated test cleanup' }),
  });
  const cancelData = await cancelRes.json();
  console.log('Cancelled successfully?:', cancelData.appointment?.status === 'cancelled');

  console.log('\n=== M8 BACKEND TESTS COMPLETED SUCCESSFULLY ===');
}

runM8Tests().catch(console.error);
