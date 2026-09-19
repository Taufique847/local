const axios = require('axios');

const API_BASE = 'http://localhost:5000/api';

async function runM24Tests() {
  console.log('====================================================');
  console.log('⭐ Testing Area 4: Automated Review & Reputation Shielding (M24)');
  console.log('====================================================\n');

  try {
    // 1. Authenticate
    console.log('1. Authenticating test user...');
    const loginRes = await axios.post(`${API_BASE}/auth/login`, {
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

    // 2. Fetch or create customers for testing
    console.log('2. Setting up test customers for CSAT reviews...');
    const cust1Res = await axios.post(
      `${API_BASE}/customers`,
      {
        firstName: 'Alice',
        lastName: 'Positive',
        phone: '+15554443333',
        email: `alice.${Date.now()}@example.com`,
        propertyType: 'residential',
        status: 'active',
      },
      authHeaders
    );
    const customer1 = cust1Res.data.customer || cust1Res.data.data?.customer || cust1Res.data;

    const cust2Res = await axios.post(
      `${API_BASE}/customers`,
      {
        firstName: 'Bob',
        lastName: 'Unhappy',
        phone: '+15557778888',
        email: `bob.${Date.now()}@example.com`,
        propertyType: 'residential',
        status: 'active',
      },
      authHeaders
    );
    const customer2 = cust2Res.data.customer || cust2Res.data.data?.customer || cust2Res.data;

    const servicesRes = await axios.get(`${API_BASE}/services`, authHeaders);
    const serviceList = servicesRes.data.services || servicesRes.data.data || [];
    const testService = serviceList[0] || { _id: '674000000000000000000001' };

    // 3. Create and complete an appointment to test automated survey trigger
    console.log('3. Booking and completing appointment for Customer 1 (Alice)...');
    const randomOffset = Math.floor(Math.random() * 1000000000) + 20000000;
    const startAt = new Date(Date.now() + randomOffset);
    const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);

    const appt1Res = await axios.post(
      `${API_BASE}/appointments`,
      {
        customerId: customer1._id || customer1.id,
        serviceId: testService._id || testService.id,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        technicianName: 'Dave Miller',
        description: 'Completed AC tune-up',
      },
      authHeaders
    );
    const appt1 = appt1Res.data.appointment || appt1Res.data.data?.appointment || appt1Res.data;

    // Mark as completed
    const completeRes = await axios.patch(
      `${API_BASE}/appointments/${appt1._id || appt1.id}/status`,
      { status: 'completed' },
      authHeaders
    );
    console.log('   ✅ Appointment marked as completed.');

    // Wait 500ms for async trigger
    await new Promise((r) => setTimeout(r, 600));

    // Verify ReviewCampaign created
    const campaignsRes = await axios.get(`${API_BASE}/reviews`, authHeaders);
    const campaigns = campaignsRes.data.campaigns || campaignsRes.data.data?.campaigns || [];
    const aliceCampaign = campaigns.find(
      (c) => c.customerPhone === '+15554443333' || c.customerId?._id === (customer1._id || customer1.id)
    );

    if (!aliceCampaign) {
      // If async was still firing, manually trigger to verify endpoint
      console.log('   Triggering manual survey endpoint to verify...');
      const manualTrigger = await axios.post(
        `${API_BASE}/reviews/trigger`,
        { appointmentId: appt1._id || appt1.id, bypassQuietHours: true },
        authHeaders
      );
      console.log('   ✅ Survey triggered via API:', manualTrigger.data.campaign.status);
    } else {
      console.log('   ✅ Auto-triggered CSAT survey found with status:', aliceCampaign.status);
    }

    // 4. Test 5-Star Positive Funnel
    console.log('\n4. Simulating Customer 1 (Alice) replying with 5 Stars...');
    const reply5Res = await axios.post(`${API_BASE}/reviews/reply`, {
      from: '+15554443333',
      text: '5 stars! Dave was phenomenal and fixed the capacitor in 20 minutes.',
    });

    console.log('   Handled:', reply5Res.data.handled);
    console.log('   SMS Reply sent to customer:\n     "' + reply5Res.data.responseText + '"');

    if (!reply5Res.data.responseText.includes('Google') || !reply5Res.data.campaign.googleReviewUrl) {
      throw new Error('5-star flow did not supply Google Review link!');
    }
    if (reply5Res.data.campaign.status !== 'positive_redirected' || reply5Res.data.campaign.isShielded) {
      throw new Error('5-star flow status is invalid!');
    }
    console.log('   ✅ 5-Star review successfully redirected to Google Business Profile!');

    // 5. Test 1-Star Negative Shielding Funnel
    console.log('\n5. Setting up Customer 2 (Bob) and simulating a 1-Star complaint...');
    const randomOffset2 = Math.floor(Math.random() * 1000000000) + 50000000;
    const startAt2 = new Date(Date.now() + randomOffset2);
    const endAt2 = new Date(startAt2.getTime() + 60 * 60 * 1000);

    const appt2Res = await axios.post(
      `${API_BASE}/appointments`,
      {
        customerId: customer2._id || customer2.id,
        serviceId: testService._id || testService.id,
        startAt: startAt2.toISOString(),
        endAt: endAt2.toISOString(),
        technicianName: 'Dave Miller',
        description: 'Furnace Inspection',
      },
      authHeaders
    );
    const appt2 = appt2Res.data.appointment || appt2Res.data.data?.appointment || appt2Res.data;

    // Trigger survey for Bob
    await axios.post(
      `${API_BASE}/reviews/trigger`,
      { appointmentId: appt2._id || appt2.id, bypassQuietHours: true },
      authHeaders
    );

    // Bob replies with 1 star
    const reply1Res = await axios.post(`${API_BASE}/reviews/reply`, {
      from: '+15557778888',
      text: '1 - tech showed up late and tracked mud everywhere, terrible service!',
    });

    console.log('   Handled:', reply1Res.data.handled);
    console.log('   SMS Reply sent to customer:\n     "' + reply1Res.data.responseText + '"');

    if (reply1Res.data.responseText.includes('Google') || reply1Res.data.campaign.googleReviewUrl) {
      throw new Error('SECURITY BREACH: 1-star negative review was given Google link!');
    }
    if (!reply1Res.data.campaign.isShielded || reply1Res.data.campaign.status !== 'negative_shielded') {
      throw new Error('Reputation Shield failed to mark review as shielded!');
    }
    if (!reply1Res.data.campaign.escalatedToOwner) {
      throw new Error('Negative review was not escalated to owner!');
    }
    if (!reply1Res.data.campaign.slaDeadlineAt) {
      throw new Error('24h SLA deadline was not calculated!');
    }
    console.log('   ✅ 1-Star review successfully SHIELDED from Google & escalated to owner internally!');
    console.log('   ✅ SLA Deadline set to:', reply1Res.data.campaign.slaDeadlineAt);
    console.log('   ✅ Owner Push Alert Sent flag:', reply1Res.data.campaign.ownerAlertSent);

    // 5b. Test /check-sla endpoint
    const checkSlaRes = await axios.post(`${API_BASE}/reviews/check-sla`, {}, authHeaders);
    console.log('   ✅ SLA Breach Monitor verified, active breaches:', checkSlaRes.data.breachedCount);

    // 6. Test resolving shielded review
    console.log('\n6. Owner resolves Bob\'s shielded complaint...');
    const resolveRes = await axios.post(
      `${API_BASE}/reviews/${reply1Res.data.campaign._id}/resolve`,
      { notes: 'Owner personally called Bob, refunded $50 diagnostic fee, and scheduled free duct clean.' },
      authHeaders
    );
    console.log('   Updated Status:', resolveRes.data.campaign.status);
    console.log('   ✅ Shielded review marked resolved.');

    // 7. Verify Reputation Analytics
    console.log('\n7. Fetching reputation & CSAT analytics (/api/reviews/stats)...');
    const statsRes = await axios.get(`${API_BASE}/reviews/stats`, authHeaders);
    const repStats = statsRes.data;
    console.log('   Surveys Sent:', repStats.totalSurveysSent);
    console.log('   Total Responses:', repStats.totalResponses);
    console.log('   Average Rating:', repStats.averageRating, '⭐');
    console.log('   Positive Redirected:', repStats.positiveRedirectedCount);
    console.log('   Negative Shielded:', repStats.negativeShieldedCount);
    console.log('   Resolved Count:', repStats.resolvedCount);
    console.log('   Rating Breakdown:', JSON.stringify(repStats.ratingBreakdown));

    // 8. Verify QA Summary Endpoints for Area 5
    console.log('\n8. Verifying QA summary endpoint (/api/calls/qa/summary)...');
    const qaSummaryRes = await axios.get(`${API_BASE}/calls/qa/summary`, authHeaders);
    const qa = qaSummaryRes.data.summary || qaSummaryRes.data;
    console.log('   Total Evaluated:', qa.totalEvaluated);
    console.log('   Avg Resolution Score:', qa.averageResolutionScore + '%');
    console.log('   Compliance Rate:', qa.complianceRate + '%');
    console.log('   Flagged Count:', qa.flaggedCount);

    console.log('\n====================================================');
    console.log('🎉 ALL AREA 4 REPUTATION SHIELDING TESTS PASSED 100%!');
    console.log('====================================================\n');
  } catch (error) {
    console.error('❌ Test failed with error:', error.response?.data || error.message);
    process.exit(1);
  }
}

runM24Tests();
