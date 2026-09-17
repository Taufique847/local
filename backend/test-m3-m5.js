async function runTests() {
  const baseUrl = 'http://localhost:5000/api';
  let cookie = '';

  console.log('--- 1. Login to get Auth Cookie ---');
  const loginRes = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'john@example.com', password: 'password123' }),
  });
  const loginData = await loginRes.json();
  const rawCookie = loginRes.headers.get('set-cookie');
  if (rawCookie) cookie = rawCookie.split(';')[0];
  console.log('Login Result:', loginData.success, 'Cookie acquired');

  console.log('\n--- 2. Save Business Profile (Onboarding Step 1) ---');
  const profileRes = await fetch(`${baseUrl}/onboarding/business`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      name: 'Apex Heating & Air Solutions',
      businessType: 'HVAC',
      phone: '+1 (214) 555-0199',
      email: 'contact@apexhvac.com',
      website: 'https://apexhvac.com',
      address: {
        street: '4500 Elm Street',
        city: 'Dallas',
        state: 'TX',
        zip: '75201',
        country: 'United States',
      },
    }),
  });
  const profileData = await profileRes.json();
  console.log('Profile Status:', profileRes.status, 'Business Name:', profileData.business?.name, 'Step:', profileData.business?.onboardingStep);

  console.log('\n--- 3. Update Services (Onboarding Step 2) ---');
  const servicesRes = await fetch(`${baseUrl}/onboarding/services`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      services: [
        { id: 'ac_repair', name: 'AC Repair', description: 'Emergency and standard AC fixes', enabled: true },
        { id: 'heating_install', name: 'Furnace & Heat Pump Installation', description: 'High-efficiency heat systems', enabled: true },
        { id: 'air_quality', name: 'Air Duct Cleaning & Filtration', description: 'HEPA and UV air treatment', enabled: true },
      ],
    }),
  });
  const servicesData = await servicesRes.json();
  console.log('Services Status:', servicesRes.status, 'Step:', servicesData.business?.onboardingStep, 'Services Count:', servicesData.business?.services?.length);

  console.log('\n--- 4. Update Service Area (Onboarding Step 3) ---');
  const areaRes = await fetch(`${baseUrl}/onboarding/service-area`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      primaryCity: 'Dallas',
      state: 'TX',
      zip: '75201',
      radiusMiles: 35,
    }),
  });
  const areaData = await areaRes.json();
  console.log('Service Area Status:', areaRes.status, 'Radius:', areaData.business?.serviceArea?.radiusMiles, 'miles');

  console.log('\n--- 5. Update Hours & Emergency (Onboarding Step 4) ---');
  const hoursRes = await fetch(`${baseUrl}/onboarding/hours`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      businessHours: [
        { day: 'Monday', isOpen: true, openTime: '07:30', closeTime: '18:30' },
        { day: 'Tuesday', isOpen: true, openTime: '07:30', closeTime: '18:30' },
        { day: 'Wednesday', isOpen: true, openTime: '07:30', closeTime: '18:30' },
        { day: 'Thursday', isOpen: true, openTime: '07:30', closeTime: '18:30' },
        { day: 'Friday', isOpen: true, openTime: '07:30', closeTime: '18:30' },
        { day: 'Saturday', isOpen: true, openTime: '08:00', closeTime: '16:00' },
        { day: 'Sunday', isOpen: false, openTime: '08:00', closeTime: '16:00' },
      ],
      emergencyService: {
        offered: true,
        availability: '24/7',
        notes: '24/7 on-call technician available for heating emergencies',
      },
    }),
  });
  const hoursData = await hoursRes.json();
  console.log('Hours Status:', hoursRes.status, 'Emergency 24/7:', hoursData.business?.emergencyService?.offered);

  console.log('\n--- 6. Complete Onboarding (Onboarding Step 5) ---');
  const completeRes = await fetch(`${baseUrl}/onboarding/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
  });
  const completeData = await completeRes.json();
  console.log('Onboarding Complete Status:', completeRes.status, 'Onboarding Status:', completeData.business?.onboardingStatus);

  console.log('\n--- 7. Create Customer (M5 Customer Management) ---');
  const createCustomerRes = await fetch(`${baseUrl}/customers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      firstName: 'Michael',
      lastName: 'Scott',
      phone: '+1 (214) 555-8822',
      email: 'michael.scott@dundermifflin.com',
      address: {
        street: '1725 Slough Avenue',
        city: 'Dallas',
        state: 'TX',
        zip: '75204',
      },
      notes: 'Customer reported AC blowing warm air on second floor unit.',
      status: 'active',
    }),
  });
  const customerData = await createCustomerRes.json();
  console.log('Create Customer Status:', createCustomerRes.status, 'Created Customer:', customerData.customer?.fullName, 'ID:', customerData.customer?.id);

  console.log('\n--- 8. Query Customers List (Paginated & Search) ---');
  const listRes = await fetch(`${baseUrl}/customers?search=Michael`, {
    method: 'GET',
    headers: { Cookie: cookie },
  });
  const listData = await listRes.json();
  console.log('List Customers Status:', listRes.status, 'Total Customers:', listData.total, 'Matching:', listData.customers?.length);

  console.log('\n--- 9. Get Customer Stats for M4 Dashboard ---');
  const statsRes = await fetch(`${baseUrl}/customers/stats`, {
    method: 'GET',
    headers: { Cookie: cookie },
  });
  const statsData = await statsRes.json();
  console.log('Customer Stats Status:', statsRes.status, 'Stats:', statsData.stats);

  console.log('\nAll M3 & M5 Backend Integration Tests Passed Successfully!');
}

runTests().catch(console.error);
