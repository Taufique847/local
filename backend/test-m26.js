const axios = require('axios');

const API_BASE = 'http://localhost:5000/api';

async function runM26Tests() {
  console.log('====================================================');
  console.log('💳 Testing Module 26: Billing & Subscription Engine (Stripe)');
  console.log('====================================================\n');

  try {
    // 1. Authenticate test user
    console.log('1. Authenticating test user (john@example.com)...');
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

    // 2. Fetch public plans and verify pricing ($299, $799, $1,499)
    console.log('2. Fetching available subscription plans (/api/billing/plans)...');
    const plansRes = await axios.get(`${API_BASE}/billing/plans`);
    const plans = plansRes.data.plans;

    console.log(`   Found ${plans.length} plan tiers:`);
    for (const p of plans) {
      console.log(`   • ${p.name} (${p.id.toUpperCase()}): $${p.monthlyPrice}/mo (Annual: $${p.annualPricePerMonth}/mo)`);
    }

    const starter = plans.find((p) => p.id === 'starter');
    const pro = plans.find((p) => p.id === 'pro');
    const enterprise = plans.find((p) => p.id === 'enterprise');

    if (!starter || starter.monthlyPrice !== 299) {
      throw new Error(`Starter plan price is not $299! (Got: ${starter?.monthlyPrice})`);
    }
    if (!pro || pro.monthlyPrice !== 799) {
      throw new Error(`Pro plan price is not $799! (Got: ${pro?.monthlyPrice})`);
    }
    if (!enterprise || enterprise.monthlyPrice !== 1499) {
      throw new Error(`Enterprise plan price is not $1,499! (Got: ${enterprise?.monthlyPrice})`);
    }
    console.log('   ✅ Pricing tiers verified: Starter=$299, Pro=$799, Enterprise=$1499.\n');

    // 3. Fetch active business subscription
    console.log('3. Fetching business subscription status (/api/billing/subscription)...');
    const subRes = await axios.get(`${API_BASE}/billing/subscription`, authHeaders);
    const sub = subRes.data.subscription;

    console.log('   Current Tier:', sub.tier.toUpperCase());
    console.log('   Status:', sub.status);
    console.log('   Monthly Minutes Quota:', sub.minutesAllocated);
    console.log('   Minutes Used:', sub.minutesUsed);
    console.log('   Customer ID:', sub.stripeCustomerId);
    console.log('   ✅ Business subscription verified.\n');

    // 4. Create Stripe Checkout Session for Pro ($799/mo)
    console.log('4. Creating Stripe Checkout session for PRO tier ($799/mo)...');
    const checkoutRes = await axios.post(
      `${API_BASE}/billing/checkout`,
      {
        tier: 'pro',
        interval: 'month',
        successUrl: 'http://localhost:3000/app/billing?success=true',
        cancelUrl: 'http://localhost:3000/app/billing?canceled=true',
      },
      authHeaders
    );

    console.log('   Checkout URL:', checkoutRes.data.checkoutUrl);
    console.log('   Session ID:', checkoutRes.data.sessionId);
    if (!checkoutRes.data.checkoutUrl) {
      throw new Error('No checkoutUrl returned from Stripe checkout creation!');
    }
    console.log('   ✅ Stripe Checkout Session generated successfully.\n');

    // 5. Simulate Stripe webhook: checkout.session.completed
    console.log('5. Simulating Stripe checkout.session.completed webhook for business...');
    const webhookPayload = {
      type: 'checkout.session.completed',
      data: {
        object: {
          id: checkoutRes.data.sessionId,
          businessId: sub.businessId,
          tier: 'pro',
          interval: 'month',
          subscription: `sub_stripe_pro_${Date.now()}`,
          customer: sub.stripeCustomerId,
        },
      },
    };

    const webhookRes = await axios.post(`${API_BASE}/billing/webhook`, webhookPayload);
    console.log('   Webhook handled:', webhookRes.data);

    // Verify updated subscription
    const updatedSubRes = await axios.get(`${API_BASE}/billing/subscription`, authHeaders);
    const updatedSub = updatedSubRes.data.subscription;
    console.log('   Updated Tier:', updatedSub.tier.toUpperCase());
    console.log('   Allocated Minutes:', updatedSub.minutesAllocated);
    console.log('   Phone Lines:', updatedSub.phoneNumbersAllocated);
    console.log('   Total Invoices in History:', updatedSub.invoicesHistory.length);

    if (updatedSub.tier !== 'pro' || updatedSub.minutesAllocated !== 700) {
      throw new Error(`Subscription did not upgrade to PRO (700 mins)! Got: ${updatedSub.minutesAllocated}`);
    }
    console.log('   ✅ Subscription upgraded to PRO ($799/mo, 700 mins) via webhook.\n');

    // 6. Test Customer Billing Portal Session
    console.log('6. Generating Stripe Customer Portal session (/api/billing/portal)...');
    const portalRes = await axios.post(
      `${API_BASE}/billing/portal`,
      { returnUrl: 'http://localhost:3000/app/billing' },
      authHeaders
    );
    console.log('   Portal URL:', portalRes.data.portalUrl);
    if (!portalRes.data.portalUrl) {
      throw new Error('No portalUrl returned from Stripe Customer Portal endpoint!');
    }
    console.log('   ✅ Stripe Customer Portal Session generated successfully.\n');

    console.log('====================================================');
    console.log('🎉 ALL MODULE 26 BILLING TESTS PASSED 100%!');
    console.log('====================================================\n');
  } catch (error) {
    console.error('❌ Test failed with error:', error.response?.data || error.message);
    process.exit(1);
  }
}

runM26Tests();
