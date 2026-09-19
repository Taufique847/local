const mongoose = require('mongoose');

async function fixAppointments() {
  await mongoose.connect('mongodb://localhost:27017/bluecollar_ai');
  const db = mongoose.connection.db;

  const business = await db.collection('businesses').findOne({ name: 'charismatalk' });
  if (!business) {
    console.error('charismatalk business not found');
    process.exit(1);
  }
  const businessId = business._id;

  const services = await db.collection('services').find({ businessId }).toArray();
  const srvMap = {};
  services.forEach((s) => {
    srvMap[s.name] = s._id;
  });

  const apts = await db.collection('appointments').find({ businessId }).toArray();
  for (const apt of apts) {
    let srvId = services[0]?._id;
    const typeStr = apt.serviceType || apt.title || '';
    if (typeStr.includes('AC')) {
      srvId = srvMap['AC Repair'] || srvId;
    } else if (typeStr.includes('Tune-Up') || typeStr.includes('Furnace')) {
      srvId = srvMap['AC Maintenance & Tune-Up'] || srvId;
    } else if (typeStr.includes('Water Heater') || typeStr.includes('Emergency')) {
      srvId = srvMap['Emergency HVAC Service'] || srvId;
    } else if (typeStr.includes('Duct')) {
      srvId = srvMap['Ductwork & Airflow'] || srvId;
    }

    await db.collection('appointments').updateOne(
      { _id: apt._id },
      {
        $set: {
          serviceId: srvId,
          title: apt.title || apt.serviceType || 'HVAC Service Appointment',
          timezone: apt.timezone || 'America/Chicago',
          customerNotes: apt.customerNotes || apt.notes || '',
          internalNotes: apt.internalNotes || '',
        },
      }
    );
  }

  console.log(`Successfully fixed ${apts.length} appointments with valid serviceId, title, timezone!`);
  process.exit(0);
}

fixAppointments().catch((err) => {
  console.error(err);
  process.exit(1);
});
