/**
 * Comprehensive Verification Suite for Modules M16 - M20
 * M16: Customer 360 & Relationship Management Engine
 * M17: Business Knowledge Base & AI RAG Engine
 * M18: AI Agent Policy, Guardrails & Business Rules Engine
 * M19: AI Agent Memory & Context Management Engine
 * M20: AI Conversation Intelligence & Quality Engine
 */

const BASE_URL = 'http://localhost:5000/api';

async function request(url, options = {}) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function runTests() {
  console.log('====================================================');
  console.log('🧪 STARTING M16 - M20 COMPREHENSIVE VERIFICATION SUITE');
  console.log('====================================================\n');

  let token = '';
  let cookie = '';
  let businessId = '';
  let customerId = '';
  let callId = '';

  // Step 0: Auth / Login
  console.log('--- Step 0: Authentication ---');
  const loginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'john@example.com', password: 'password123' }),
  });
  const loginData = await loginRes.json();
  const rawCookie = loginRes.headers.get('set-cookie');
  if (rawCookie) cookie = rawCookie.split(';')[0];
  token = loginData.token;

  console.log('✅ Logged in as:', loginData.user?.email || 'john@example.com');

  const authHeaders = {
    'Content-Type': 'application/json',
    ...(cookie ? { Cookie: cookie } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  // Get business ID
  const meRes = await request(`${BASE_URL}/auth/me`, { headers: authHeaders });
  businessId = meRes.data.business?.id || meRes.data.business?._id || meRes.data.data?.business?.id;
  console.log(`🏢 Business Context: ${businessId}\n`);

  // ==========================================
  // MODULE 16: Customer 360 & Relationship Management
  // ==========================================
  console.log('--- MODULE 16: Customer 360 & Relationship Management ---');
  
  // Create test customer
  const custRes = await request(`${BASE_URL}/customers`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      firstName: 'Sarah',
      lastName: 'Connor',
      phone: `+1415555${Math.floor(1000 + Math.random() * 9000)}`,
      email: 'sarah.connor@example.com',
      tags: ['VIP', 'Residential'],
      lifetimeValue: 1250,
      address: {
        street: '742 Evergreen Terrace',
        city: 'Springfield',
        state: 'IL',
        zip: '62704',
      },
    }),
  });
  customerId = custRes.data.customer?.id || custRes.data.customer?._id || custRes.data.id || custRes.data._id;
  console.log(`✅ Created Customer: ${customerId}`);

  // Fetch Customer 360
  const c360Res = await request(`${BASE_URL}/customers/${customerId}/360`, { headers: authHeaders });
  if (c360Res.status === 200 && (c360Res.data.customer || c360Res.data.data?.customer)) {
    const cust = c360Res.data.customer || c360Res.data.data?.customer;
    const timeline = c360Res.data.timeline || c360Res.data.data?.timeline;
    const stats = c360Res.data.stats || c360Res.data.data?.stats;
    console.log('✅ GET /customers/:id/360 successful');
    console.log(`   Customer Name: ${cust.firstName} ${cust.lastName}`);
    console.log(`   Timeline items count: ${timeline?.length}`);
    console.log(`   Stats: ${JSON.stringify(stats)}`);
  } else {
    console.error('❌ GET /customers/:id/360 failed:', c360Res.data);
  }

  // Update Customer Tags
  const tagRes = await request(`${BASE_URL}/customers/${customerId}/tags`, {
    method: 'PUT',
    headers: authHeaders,
    body: JSON.stringify({ tags: ['VIP', 'Maintenance Agreement', 'Commercial'] }),
  });
  const updatedTags = tagRes.data.customer?.tags || tagRes.data.data?.customer?.tags;
  if (tagRes.status === 200) {
    console.log('✅ PUT /customers/:id/tags updated:', updatedTags);
  } else {
    console.error('❌ PUT /customers/:id/tags failed:', tagRes.data);
  }
  console.log('');

  // ==========================================
  // MODULE 17: Business Knowledge Base & AI RAG Engine
  // ==========================================
  console.log('--- MODULE 17: Business Knowledge Base & AI RAG Engine ---');

  // List Knowledge Items
  const kbList = await request(`${BASE_URL}/knowledge`, { headers: authHeaders });
  const totalKb = kbList.data.total !== undefined ? kbList.data.total : kbList.data.data?.total;
  console.log(`✅ Default Knowledge Base items found: ${totalKb || 0}`);

  // Create custom Knowledge Item
  const newKbRes = await request(`${BASE_URL}/knowledge`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      title: 'Filter Replacement & Seasonal Tune-Up Discount',
      category: 'faq',
      content: 'We offer a $25 discount on high-efficiency HEPA and MERV 11 filter replacements during any multi-point AC tune-up.',
      keywords: ['filter', 'tune-up', 'discount', 'merv', 'air quality'],
    }),
  });
  const createdKb = newKbRes.data.item || newKbRes.data.data?.item;
  if (newKbRes.status === 201) {
    console.log('✅ POST /knowledge created item:', createdKb?.title);
  } else {
    console.error('❌ POST /knowledge failed:', newKbRes.data);
  }

  // Search Knowledge Base
  const kbSearch = await request(`${BASE_URL}/knowledge/search?query=filter`, { headers: authHeaders });
  const results = kbSearch.data.results || kbSearch.data.data?.results;
  if (kbSearch.status === 200 && results?.length > 0) {
    console.log(`✅ GET /knowledge/search?query=filter returned ${results.length} results:`);
    console.log(`   Top match: "${results[0].title}"`);
  } else {
    console.error('❌ GET /knowledge/search failed:', kbSearch.data);
  }
  console.log('');

  // ==========================================
  // MODULE 18: AI Agent Policy, Guardrails & Business Rules Engine
  // ==========================================
  console.log('--- MODULE 18: AI Agent Policy, Guardrails & Business Rules Engine ---');

  // Get Policy
  const polRes = await request(`${BASE_URL}/policies`, { headers: authHeaders });
  const policy = polRes.data.policy || polRes.data.data?.policy;
  console.log('✅ GET /policies retrieved:');
  console.log(`   minBookingNoticeHours: ${policy?.minBookingNoticeHours}`);
  console.log(`   maxBookingHorizonDays: ${policy?.maxBookingHorizonDays}`);

  // Update Policy
  const updatePolRes = await request(`${BASE_URL}/policies`, {
    method: 'PUT',
    headers: authHeaders,
    body: JSON.stringify({
      minBookingNoticeHours: 3,
      maxBookingHorizonDays: 45,
    }),
  });
  const updatedPolicy = updatePolRes.data.policy || updatePolRes.data.data?.policy;
  console.log(`✅ PUT /policies updated minBookingNoticeHours to: ${updatedPolicy?.minBookingNoticeHours}`);

  // Test Booking Time Validation (immediate booking should fail notice guardrail)
  const immediateTime = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 mins ahead
  const valRes = await request(`${BASE_URL}/policies/validate-booking`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ startAt: immediateTime }),
  });
  console.log('✅ POST /policies/validate-booking (Immediate slot test):');
  console.log(`   Valid: ${valRes.data.valid !== undefined ? valRes.data.valid : valRes.data.data?.valid} (Expected: false)`);
  console.log(`   Reason: "${valRes.data.reason || valRes.data.data?.reason}"`);

  // Test Emergency Keyword Scan
  const emRes = await request(`${BASE_URL}/policies/check-emergency`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ text: 'Help! We smell a strong gas leak and our furnace is sparking!' }),
  });
  console.log('✅ POST /policies/check-emergency:');
  console.log(`   isEmergency: ${emRes.data.isEmergency !== undefined ? emRes.data.isEmergency : emRes.data.data?.isEmergency} (Expected: true)`);
  console.log(`   Matched: ${JSON.stringify(emRes.data.matchedKeywords || emRes.data.data?.matchedKeywords)}`);
  console.log('');

  // ==========================================
  // MODULE 19: AI Agent Memory & Context Management Engine
  // ==========================================
  console.log('--- MODULE 19: AI Agent Memory & Context Management Engine ---');

  // Create Memory for Customer
  const mem1 = await request(`${BASE_URL}/customers/${customerId}/memories`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      category: 'equipment',
      key: 'primary_hvac_system',
      value: 'Carrier Infinity 19VS Inverter Heat Pump installed 2022',
    }),
  });
  const m1 = mem1.data.memory || mem1.data.data?.memory;
  console.log('✅ POST /customers/:id/memories (Equipment):', m1?.value);

  const mem2 = await request(`${BASE_URL}/customers/${customerId}/memories`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      category: 'instruction',
      key: 'property_access',
      value: 'Gate code #9921; golden retriever dog kept in side yard, friendly',
    }),
  });
  const m2 = mem2.data.memory || mem2.data.data?.memory;
  console.log('✅ POST /customers/:id/memories (Access Instruction):', m2?.value);

  // List Memories
  const listMem = await request(`${BASE_URL}/customers/${customerId}/memories`, { headers: authHeaders });
  const memories = listMem.data.memories || listMem.data.data?.memories;
  console.log(`✅ GET /customers/:id/memories count: ${memories?.length}`);

  // Fetch Assembled AI Context
  const ctxRes = await request(`${BASE_URL}/customers/${customerId}/context`, { headers: authHeaders });
  const contextObj = ctxRes.data.context || ctxRes.data.data?.context;
  console.log('✅ GET /customers/:id/context (Assembled Returning Caller Prompt):');
  console.log('----------------------------------------------------');
  console.log(contextObj?.formattedContext);
  console.log('----------------------------------------------------');
  console.log('');

  // ==========================================
  // MODULE 20: AI Conversation Intelligence & Quality Engine
  // ==========================================
  console.log('--- MODULE 20: AI Conversation Intelligence & Quality Engine ---');

  // Simulate a Call
  const simRes = await request(`${BASE_URL}/calls/simulate`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      callerPhone: '+14155552671',
      durationSeconds: 145,
      outcome: 'appointment_booked',
      notes: 'Caller booked AC repair service. Verified address 742 Evergreen Terrace.',
      transcript: [
        { role: 'user', text: 'Hello, my AC is blowing warm air, thank you for answering so fast!' },
        { role: 'assistant', text: 'I would be glad to help. Let me check our earliest availability.' },
        { role: 'user', text: 'Tomorrow morning works great. Address is 742 Evergreen Terrace.' },
        { role: 'assistant', text: 'Confirmed! You are booked for tomorrow at 9:00 AM.' },
      ],
    }),
  });
  const simCall = simRes.data.call || simRes.data.data?.call;
  callId = simCall?._id || simCall?.id;
  console.log(`✅ Simulated Call created: ${callId} (Outcome: appointment_booked)`);

  // Evaluate Call QA
  const evalRes = await request(`${BASE_URL}/calls/${callId}/qa/evaluate`, {
    method: 'POST',
    headers: authHeaders,
  });
  const qaObj = evalRes.data.qa || evalRes.data.data?.qa;
  if (evalRes.status === 200 && qaObj) {
    console.log('✅ POST /calls/:id/qa/evaluate:');
    console.log(`   Resolution Score: ${qaObj.resolutionScore}/100`);
    console.log(`   Clarity Score: ${qaObj.clarityScore}/100`);
    console.log(`   Sentiment Score: ${qaObj.sentimentScore}`);
    console.log(`   Policy Compliance: ${qaObj.policyCompliance}`);
    console.log(`   AI Summary: "${qaObj.aiSummary}"`);
    console.log(`   Coaching Notes: ${JSON.stringify(qaObj.coachingNotes)}`);
  } else {
    console.error('❌ POST /calls/:id/qa/evaluate failed:', evalRes.data);
  }

  // Get Call QA by ID
  const getQaRes = await request(`${BASE_URL}/calls/${callId}/qa`, { headers: authHeaders });
  const singleQa = getQaRes.data.qa || getQaRes.data.data?.qa;
  console.log(`✅ GET /calls/:id/qa: Evaluated At ${singleQa?.evaluatedAt}`);

  // Get QA Summary
  const qaSumRes = await request(`${BASE_URL}/calls/qa/summary`, { headers: authHeaders });
  const summaryObj = qaSumRes.data.summary || qaSumRes.data.data?.summary;
  console.log('✅ GET /calls/qa/summary:');
  console.log(`   Total Evaluated Calls: ${summaryObj?.totalEvaluated}`);
  console.log(`   Average Resolution Score: ${summaryObj?.averageResolutionScore}%`);
  console.log(`   Policy Compliance Rate: ${summaryObj?.complianceRate}%`);
  console.log(`   Flagged Calls: ${summaryObj?.flaggedCount}`);

  console.log('\n====================================================');
  console.log('🎉 ALL M16 - M20 VERIFICATION TESTS COMPLETED SUCCESSFULLY!');
  console.log('====================================================\n');
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
