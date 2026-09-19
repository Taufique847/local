const mongoose = require('mongoose');
require('dotenv').config();

async function seedCharismatalk() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/bluecollar-ai');
  const db = mongoose.connection.db;

  const business = await db.collection('businesses').findOne({ name: 'charismatalk' });
  if (!business) {
    console.error('Business charismatalk not found!');
    process.exit(1);
  }
  const businessId = business._id;
  console.log('Found business:', business.name, businessId);

  // 1. Update Subscription to Pro (700 mins, 142 used)
  await db.collection('subscriptions').updateOne(
    { businessId },
    {
      $set: {
        tier: 'pro',
        status: 'active',
        billingInterval: 'month',
        amountUsd: 799,
        minutesAllocated: 700,
        minutesUsed: 142,
        phoneNumbersAllocated: 3,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    },
    { upsert: true }
  );
  console.log('✅ Subscription updated to Pro (700 mins, 142 used).');

  // 2. Clear old demo records for this business
  await db.collection('customers').deleteMany({ businessId });
  await db.collection('appointments').deleteMany({ businessId });
  await db.collection('calllogs').deleteMany({ businessId });
  await db.collection('leads').deleteMany({ businessId });

  // 3. Create 5 Customers
  const customerDocs = [
    {
      businessId,
      firstName: 'David',
      lastName: 'Henderson',
      phone: '+1 (555) 234-5678',
      email: 'd.henderson@example.com',
      address: { street: '742 Evergreen Terrace', city: 'Dallas', state: 'TX', zip: '75201' },
      status: 'active',
      tags: ['vip', 'residential'],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      businessId,
      firstName: 'Linda',
      lastName: 'Sterling',
      phone: '+1 (555) 987-6543',
      email: 'linda.s@example.com',
      address: { street: '1204 Oak Ridge Way', city: 'Plano', state: 'TX', zip: '75024' },
      status: 'active',
      tags: ['repeat-client'],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      businessId,
      firstName: 'Tom',
      lastName: 'Bradley',
      phone: '+1 (555) 345-6789',
      email: 't.bradley@example.com',
      address: { street: '8910 Preston Road', city: 'Frisco', state: 'TX', zip: '75034' },
      status: 'active',
      tags: ['emergency-repair'],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      businessId,
      firstName: 'Karen',
      lastName: 'Miller',
      phone: '+1 (555) 456-7890',
      email: 'karen.m@example.com',
      address: { street: '4520 Maple Leaf Lane', city: 'Richardson', state: 'TX', zip: '75080' },
      status: 'active',
      tags: ['maintenance-contract'],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      businessId,
      firstName: 'Marcus',
      lastName: 'Vance',
      phone: '+1 (555) 567-8901',
      email: 'marcus.vance@example.com',
      address: { street: '310 Commerce Street', city: 'Dallas', state: 'TX', zip: '75202' },
      status: 'active',
      tags: ['commercial'],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];
  const custInsertRes = await db.collection('customers').insertMany(customerDocs);
  const custIds = Object.values(custInsertRes.insertedIds);
  console.log(`✅ Created ${custIds.length} Customers.`);

  // 4. Create 4 Field Appointments
  const now = new Date();
  const appointmentDocs = [
    {
      businessId,
      customerId: custIds[0],
      serviceType: 'AC Diagnostics & Compressor Check',
      address: '742 Evergreen Terrace, Dallas, TX',
      startAt: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 30),
      endAt: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0),
      status: 'confirmed',
      technicianName: 'Mike Rossi (Van #4)',
      notes: 'Customer reported warm air from master bedroom vents. Diagnostic fee $89 approved.',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      businessId,
      customerId: custIds[1],
      serviceType: 'Seasonal Furnace Tune-Up',
      address: '1204 Oak Ridge Way, Plano, TX',
      startAt: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 13, 15),
      endAt: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 14, 30),
      status: 'confirmed',
      technicianName: 'Carlos Mendez (Van #2)',
      notes: 'Standard 21-point safety inspection & filter replacement.',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      businessId,
      customerId: custIds[2],
      serviceType: 'Emergency Water Heater Repair',
      address: '8910 Preston Road, Frisco, TX',
      startAt: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 15, 0),
      endAt: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 16, 30),
      status: 'scheduled',
      technicianName: 'Sarah Connor (Van #1)',
      notes: 'Water pooling near tank base. Urgency marked as High.',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      businessId,
      customerId: custIds[3],
      serviceType: 'Duct Cleaning & Sanitization',
      address: '4520 Maple Leaf Lane, Richardson, TX',
      startAt: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 16, 45),
      endAt: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 18, 0),
      status: 'scheduled',
      technicianName: 'Mike Rossi (Van #4)',
      notes: 'Annual indoor air quality overhaul.',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];
  await db.collection('appointments').insertMany(appointmentDocs);
  console.log(`✅ Created ${appointmentDocs.length} Appointments.`);

  // 5. Create 5 AI Call Logs with unique providerCallSid
  const callDocs = [
    {
      businessId,
      customerId: custIds[0],
      provider: 'twilio',
      providerCallSid: `CA_charismatalk_${Date.now()}_01`,
      from: '+1 (555) 234-5678',
      to: '+1 (312) 555-0102',
      direction: 'inbound',
      durationSeconds: 104,
      status: 'completed',
      outcome: 'appointment_booked',
      sentiment: 'positive',
      startedAt: new Date(Date.now() - 15 * 60 * 1000),
      answeredAt: new Date(Date.now() - 15 * 60 * 1000 + 2000),
      endedAt: new Date(Date.now() - 15 * 60 * 1000 + 104000),
      createdAt: new Date(Date.now() - 15 * 60 * 1000),
      updatedAt: new Date(),
    },
    {
      businessId,
      customerId: custIds[1],
      provider: 'twilio',
      providerCallSid: `CA_charismatalk_${Date.now()}_02`,
      from: '+1 (555) 987-6543',
      to: '+1 (312) 555-0102',
      direction: 'inbound',
      durationSeconds: 88,
      status: 'completed',
      outcome: 'appointment_booked',
      sentiment: 'positive',
      startedAt: new Date(Date.now() - 45 * 60 * 1000),
      answeredAt: new Date(Date.now() - 45 * 60 * 1000 + 1500),
      endedAt: new Date(Date.now() - 45 * 60 * 1000 + 88000),
      createdAt: new Date(Date.now() - 45 * 60 * 1000),
      updatedAt: new Date(),
    },
    {
      businessId,
      customerId: custIds[2],
      provider: 'twilio',
      providerCallSid: `CA_charismatalk_${Date.now()}_03`,
      from: '+1 (555) 345-6789',
      to: '+1 (312) 555-0102',
      direction: 'inbound',
      durationSeconds: 135,
      status: 'completed',
      outcome: 'emergency_escalated',
      sentiment: 'neutral',
      startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      answeredAt: new Date(Date.now() - 2 * 60 * 60 * 1000 + 2200),
      endedAt: new Date(Date.now() - 2 * 60 * 60 * 1000 + 135000),
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      updatedAt: new Date(),
    },
    {
      businessId,
      customerId: custIds[3],
      provider: 'twilio',
      providerCallSid: `CA_charismatalk_${Date.now()}_04`,
      from: '+1 (555) 456-7890',
      to: '+1 (312) 555-0102',
      direction: 'inbound',
      durationSeconds: 76,
      status: 'completed',
      outcome: 'general_inquiry',
      sentiment: 'positive',
      startedAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
      answeredAt: new Date(Date.now() - 4 * 60 * 60 * 1000 + 1800),
      endedAt: new Date(Date.now() - 4 * 60 * 60 * 1000 + 76000),
      createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
      updatedAt: new Date(),
    },
    {
      businessId,
      customerId: custIds[4],
      provider: 'twilio',
      providerCallSid: `CA_charismatalk_${Date.now()}_05`,
      from: '+1 (555) 567-8901',
      to: '+1 (312) 555-0102',
      direction: 'inbound',
      durationSeconds: 45,
      status: 'completed',
      outcome: 'missed_follow_up',
      sentiment: 'positive',
      startedAt: new Date(Date.now() - 6 * 60 * 60 * 1000),
      answeredAt: new Date(Date.now() - 6 * 60 * 60 * 1000 + 1200),
      endedAt: new Date(Date.now() - 6 * 60 * 60 * 1000 + 45000),
      createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000),
      updatedAt: new Date(),
    },
  ];
  await db.collection('calllogs').insertMany(callDocs);
  console.log(`✅ Created ${callDocs.length} Real Call Logs.`);

  // 6. Create 4 Active Pipeline Leads
  const leadDocs = [
    {
      businessId,
      customerId: custIds[0],
      title: 'AC Compressor Replacement & Diagnostic',
      serviceCategory: 'ac_repair',
      urgency: 'high',
      status: 'qualified',
      source: 'phone_inbound',
      estimatedValue: 4800,
      createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
      updatedAt: new Date(),
    },
    {
      businessId,
      customerId: custIds[1],
      title: 'Annual Furnace Tune-Up & Safety Inspection',
      serviceCategory: 'heating_furnace',
      urgency: 'medium',
      status: 'contacted',
      source: 'phone_inbound',
      estimatedValue: 289,
      createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
      updatedAt: new Date(),
    },
    {
      businessId,
      customerId: custIds[2],
      title: 'Emergency Water Heater Tank Leak Repair',
      serviceCategory: 'emergency_leak',
      urgency: 'emergency',
      status: 'appointment_booked',
      source: 'phone_inbound',
      estimatedValue: 2100,
      createdAt: new Date(Date.now() - 7 * 60 * 60 * 1000),
      updatedAt: new Date(),
    },
    {
      businessId,
      customerId: custIds[3],
      title: 'Whole-Home Air Duct Cleaning & UV Filter',
      serviceCategory: 'duct_cleaning',
      urgency: 'low',
      status: 'new',
      source: 'sms_inbound',
      estimatedValue: 850,
      createdAt: new Date(Date.now() - 9 * 60 * 60 * 1000),
      updatedAt: new Date(),
    },
  ];
  await db.collection('leads').insertMany(leadDocs);
  console.log(`✅ Created ${leadDocs.length} Active Sales Leads.`);

  console.log('🎉 Seeding complete for charismatalk!');
  process.exit(0);
}

seedCharismatalk().catch((err) => {
  console.error('Error seeding charismatalk:', err);
  process.exit(1);
});
