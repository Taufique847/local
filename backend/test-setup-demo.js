const mongoose = require('mongoose');

async function run() {
  await mongoose.connect('mongodb://localhost:27017/bluecollar_ai');

  // Find or create pending estimate
  const est = await mongoose.connection.collection('estimates').findOne();
  if (est) {
    await mongoose.connection.collection('estimates').updateOne(
      { _id: est._id },
      {
        $set: {
          status: 'sent',
          shareToken: 'est_demo_pending',
          signature: null,
          title: '3-Ton Heat Pump Replacement & Duct Sealing',
          diagnosticFeeCredit: 89,
          subtotal: 3500,
          taxAmount: 281.41,
          totalAmount: 3692.41,
        },
      }
    );
    console.log('Updated estimate to pending status with shareToken: est_demo_pending');
  }

  // Find or create unpaid invoice
  const inv = await mongoose.connection.collection('invoices').findOne();
  if (inv) {
    await mongoose.connection.collection('invoices').updateOne(
      { _id: inv._id },
      {
        $set: {
          status: 'sent',
          shareToken: 'inv_demo_unpaid',
          amountPaid: 0,
          balanceDue: 260.0,
        },
      }
    );
    console.log('Updated invoice to unpaid status with shareToken: inv_demo_unpaid');
  }

  await mongoose.disconnect();
  console.log('Done setup');
}

run();
