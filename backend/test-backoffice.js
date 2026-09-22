const axios = require('axios');

const BASE_URL = 'http://127.0.0.1:5000/api';

async function runBackOfficeTests() {
  console.log('====================================================');
  console.log('👷 TESTING BACK-OFFICE: WORKER PWA, ESTIMATES & INVOICES');
  console.log('====================================================\n');

  try {
    // 1. Auth login
    console.log('1. Authenticating test user (john@example.com)...');
    const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'john@example.com',
      password: 'password123',
    });
    const token = loginRes.data.token || loginRes.data.data?.token;
    const rawCookie = loginRes.headers['set-cookie'];
    const cookie = Array.isArray(rawCookie) ? rawCookie[0].split(';')[0] : (rawCookie || '');

    const authHeaders = {
      headers: {
        Authorization: `Bearer ${token}`,
        ...(cookie ? { Cookie: cookie } : {}),
      },
    };
    console.log('   ✅ Authenticated successfully.\n');

    // 2. Worker PWA: Get technicians & today jobs
    console.log('2. Fetching Technicians (/api/worker/technicians)...');
    const techRes = await axios.get(`${BASE_URL}/worker/technicians`, authHeaders);
    console.log(`   ✅ Found ${techRes.data.technicians.length} technicians.`);
    const tech = techRes.data.technicians[0];

    console.log('3. Fetching Today Jobs for Field Worker (/api/worker/jobs/today)...');
    const jobsRes = await axios.get(`${BASE_URL}/worker/jobs/today`, authHeaders);
    console.log(`   ✅ Retrieved ${jobsRes.data.jobs.length} jobs for dispatch.`);

    let targetJob = jobsRes.data.jobs[0];
    if (!targetJob) {
      console.log('   Creating a sample appointment for worker test...');
      // Get a customer
      const custRes = await axios.get(`${BASE_URL}/customers?limit=1`, authHeaders);
      const customer = custRes.data.customers[0];
      const svcRes = await axios.get(`${BASE_URL}/services?limit=1`, authHeaders);
      const service = svcRes.data.services[0];

      const aptRes = await axios.post(
        `${BASE_URL}/appointments`,
        {
          customerId: customer._id,
          serviceId: service._id,
          title: 'Emergency AC Capacitor & Coolant Leak',
          startAt: new Date().toISOString(),
          endAt: new Date(Date.now() + 2 * 3600 * 1000).toISOString(),
          address: '742 Evergreen Terrace, Dallas, TX 75201',
          priority: 'urgent',
        },
        authHeaders
      );
      targetJob = aptRes.data.appointment;
    }

    const jobId = targetJob._id;
    console.log(`   Target Job ID: ${jobId}`);

    // 4. Worker Status Transitions
    console.log('\n4. Testing Worker Status Transitions:');
    console.log('   a) Transitioning to "en_route"...');
    await axios.patch(`${BASE_URL}/worker/jobs/${jobId}/status`, { status: 'en_route' }, authHeaders);
    console.log('      ✅ Job is EN ROUTE.');

    console.log('   b) Arriving at job site with GPS Check-In coords...');
    const arriveRes = await axios.patch(
      `${BASE_URL}/worker/jobs/${jobId}/status`,
      {
        status: 'arrived',
        latitude: 32.7767,
        longitude: -96.797,
        address: '742 Evergreen Terrace, Dallas, TX',
      },
      authHeaders
    );
    console.log(`      ✅ Job ARRIVED (GPS Check-In: ${arriveRes.data.appointment.checkIn?.latitude}, ${arriveRes.data.appointment.checkIn?.longitude})`);

    console.log('   c) Starting Job ("in_progress")...');
    await axios.patch(`${BASE_URL}/worker/jobs/${jobId}/status`, { status: 'in_progress' }, authHeaders);

    console.log('   d) Logging Checklist, Photos, and Parts Used...');
    const execRes = await axios.patch(
      `${BASE_URL}/worker/jobs/${jobId}/execution`,
      {
        checklist: [
          { item: 'Inspect electrical disconnect & capacitor', completed: true },
          { item: 'Measure suction pressure & temp split', completed: true },
        ],
        photos: [
          { url: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=800', caption: 'Burned out dual run capacitor', phase: 'before' },
          { url: 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=800', caption: 'New OEM 45/5 uF installed & tested', phase: 'after' },
        ],
        partsUsed: [
          { partName: 'OEM 45/5 uF 440V Dual Run Capacitor', quantity: 1, unitCost: 45, totalCost: 45 },
          { partName: 'R-410A Refrigerant Top-Up (1 lb)', quantity: 1, unitCost: 65, totalCost: 65 },
        ],
      },
      authHeaders
    );
    console.log(`      ✅ Checklist & ${execRes.data.appointment.partsUsed.length} parts logged.`);

    console.log('   e) Completing Job and Auto-Generating Invoice (/complete)...');
    const completeRes = await axios.post(
      `${BASE_URL}/worker/jobs/${jobId}/complete`,
      { diagnosticFeeCredit: 89, additionalLaborHours: 1 },
      authHeaders
    );
    const generatedInvoice = completeRes.data.invoice;
    console.log(`      ✅ Job COMPLETED! Invoice generated: ${generatedInvoice.invoiceNumber} (Total: $${generatedInvoice.totalAmount}, Due: $${generatedInvoice.balanceDue})`);

    // 5. Test Estimate Creation & Public E-Signature
    console.log('\n5. Testing Estimates & Public E-Signature Flow:');
    const custId = targetJob.customerId?._id || targetJob.customerId;
    const estRes = await axios.post(
      `${BASE_URL}/estimates`,
      {
        customerId: custId,
        appointmentId: jobId,
        title: 'Full HVAC System Seasonal Overhaul',
        items: [
          { description: 'Condenser Coil Chemical Cleaning', quantity: 1, unitPrice: 150 },
          { description: 'Blower Motor Bearing Lubrication', quantity: 1, unitPrice: 120 },
        ],
        diagnosticFeeCredit: 89,
      },
      authHeaders
    );
    const createdEstimate = estRes.data.estimate;
    console.log(`   ✅ Created Estimate: ${createdEstimate.estimateNumber} (Total: $${createdEstimate.totalAmount})`);
    console.log(`   Share Token: ${createdEstimate.shareToken}`);

    console.log('   a) Fetching Public Customer Quote Portal (/api/portal/quotes/:token)...');
    const publicQuoteRes = await axios.get(`${BASE_URL}/portal/quotes/${createdEstimate.shareToken}`);
    console.log(`      ✅ Public portal loaded quote: "${publicQuoteRes.data.estimate.title}" (Status: ${publicQuoteRes.data.estimate.status})`);

    console.log('   b) Customer E-Signs & Approves Quote (/api/portal/quotes/:token/approve)...');
    const signRes = await axios.post(`${BASE_URL}/portal/quotes/${createdEstimate.shareToken}/approve`, {
      signedByName: 'John Doe (Homeowner)',
      signatureDataUrl: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMDAiIGhlaWdodD0iNTAiPjxwYXRoIGQ9Ik0xMCwyNSBDNTAsMTAgOTAsNDAgMTkwLDIwIiBzdHJva2U9IiMwMDAiIGZpbGw9Im5vbmUiLz48L3N2Zz4=',
    });
    console.log(`      ✅ Quote APPROVED by ${signRes.data.estimate.signature.signedByName}! Status: ${signRes.data.estimate.status}`);

    console.log('   c) Converting Approved Estimate to Invoice (/convert)...');
    const convertRes = await axios.post(`${BASE_URL}/estimates/${createdEstimate._id}/convert`, {}, authHeaders);
    console.log(`      ✅ Converted to Invoice: ${convertRes.data.invoice.invoiceNumber}`);

    // 6. Test Invoices & Online Customer Payment
    console.log('\n6. Testing Invoices & Online Customer Checkout Flow:');
    const invRes = await axios.get(`${BASE_URL}/invoices`, authHeaders);
    console.log(`   ✅ Total Invoices in system: ${invRes.data.invoices.length}`);

    const statsRes = await axios.get(`${BASE_URL}/invoices/stats`, authHeaders);
    console.log(`   ✅ Total Billed: $${statsRes.data.stats.totalBilled}, Unpaid count: ${statsRes.data.stats.unpaidCount}`);

    console.log(`   a) Fetching Public Customer Invoice (/api/portal/invoices/:token)...`);
    const publicInvRes = await axios.get(`${BASE_URL}/portal/invoices/${generatedInvoice.shareToken}`);
    console.log(`      ✅ Loaded Invoice: ${publicInvRes.data.invoice.invoiceNumber} (Balance Due: $${publicInvRes.data.invoice.balanceDue})`);

    console.log(`   b) Customer Pays Online via Card (/api/portal/invoices/:token/pay)...`);
    const payRes = await axios.post(`${BASE_URL}/portal/invoices/${generatedInvoice.shareToken}/pay`, {
      paymentMethod: 'card',
      paymentReference: 'ch_simulated_applepay_9981',
      amount: publicInvRes.data.invoice.balanceDue,
    });
    console.log(`      ✅ Payment SUCCESSFUL! Invoice Status: ${payRes.data.invoice.status}, Balance Due: $${payRes.data.invoice.balanceDue}`);

    console.log('\n====================================================');
    console.log('🎉 ALL BACK-OFFICE & FIELD OPERATIONS TESTS PASSED 100%!');
    console.log('====================================================\n');
  } catch (err) {
    console.error('❌ Test failed:', err.response?.data || err.message);
    process.exit(1);
  }
}

runBackOfficeTests();
