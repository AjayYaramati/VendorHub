const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const User = require('./models/User');
const Vendor = require('./models/Vendor');
const Product = require('./models/Product');
const PurchaseOrder = require('./models/PurchaseOrder');
const Payment = require('./models/Payment');

async function seedDemoData() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Use DEMO_VENDOR_EMAIL if provided; otherwise use the first vendor account.
    const email = process.env.DEMO_VENDOR_EMAIL;
    const user = email
      ? await User.findOne({ email: email.toLowerCase(), role: 'vendor' })
      : await User.findOne({ role: 'vendor' }).sort({ createdAt: 1 });

    if (!user) throw new Error('No vendor user found. Create/login a vendor first.');

    let vendor = await Vendor.findOne({ user: user._id });
    if (!vendor && user.vendorProfile) vendor = await Vendor.findById(user.vendorProfile);
    if (!vendor) throw new Error(`No Vendor profile found for ${user.email}`);

    console.log(`Demo data will be linked to: ${user.email}`);
    console.log(`Vendor company: ${vendor.companyName}`);

    const products = await Product.find().limit(3).lean();
    if (products.length === 0) throw new Error('No products found. Run the normal seed first.');

    // Remove only this vendor's old demo orders/payments.
    const oldOrders = await PurchaseOrder.find({ vendor: vendor._id }).select('_id');
    const oldOrderIds = oldOrders.map(o => o._id);
    await Payment.deleteMany({ vendor: vendor._id });
    await PurchaseOrder.deleteMany({ vendor: vendor._id });

    const now = new Date();
    const ordersData = [
      ['ORD-1001', 12000, 'delivered'],
      ['ORD-1002', 8500, 'processing'],
      ['ORD-1003', 15000, 'dispatched'],
      ['ORD-1004', 7000, 'completed'],
      ['ORD-1005', 5500, 'accepted'],
      ['ORD-1006', 4500, 'approved'],
      ['ORD-1007', 3000, 'pending'],
      ['ORD-1008', 6000, 'delivered'],
    ];

    const orders = ordersData.map(([orderNumber, grandTotal, status], i) => ({
      orderNumber,
      vendor: vendor._id,
      createdBy: user._id,
      items: [{
        product: products[i % products.length]._id,
        productName: products[i % products.length].name,
        sku: products[i % products.length].sku,
        quantity: 1,
        unitPrice: grandTotal,
        taxRate: 0,
        taxAmount: 0,
        totalPrice: grandTotal,
      }],
      subtotal: grandTotal,
      taxAmount: 0,
      discount: 0,
      discountType: 'fixed',
      shippingCost: 0,
      grandTotal,
      expectedDeliveryDate: new Date(now.getTime() + (7 + i) * 86400000),
      shippingAddress: {
        address: vendor.address,
        city: vendor.city,
        state: vendor.state,
        country: vendor.country || 'India',
        pincode: vendor.pincode,
      },
      paymentTerms: i % 2 === 0 ? 'net30' : 'net15',
      status,
      statusTimeline: [{
        status: 'pending',
        updatedBy: user._id,
        updatedByName: user.name,
        note: 'Demo order created for presentation',
        timestamp: new Date(now.getTime() - (8 - i) * 86400000),
      }],
      notes: 'Presentation demo data',
      createdAt: new Date(now.getTime() - (8 - i) * 86400000),
      updatedAt: new Date(now.getTime() - (8 - i) * 86400000),
    }));

    // insertMany intentionally keeps the exact demo totals/order numbers.
    const insertedOrders = await PurchaseOrder.insertMany(orders, { ordered: true });

    const byNumber = Object.fromEntries(insertedOrders.map(o => [o.orderNumber, o]));
    const paymentsData = [
      ['PAY-1001', 'ORD-1001', 12000, 'paid'],
      ['PAY-1002', 'ORD-1002', 8500, 'paid'],
      ['PAY-1003', 'ORD-1003', 15000, 'paid'],
      ['PAY-1004', 'ORD-1004', 7000, 'paid'],
      ['PAY-1005', 'ORD-1005', 3000, 'paid'],
      ['PAY-1006', 'ORD-1006', 8500, 'pending'],
    ];

    const payments = paymentsData.map(([paymentNumber, orderNumber, amount, status], i) => ({
      paymentNumber,
      order: byNumber[orderNumber]._id,
      vendor: vendor._id,
      amount,
      paymentMethod: ['bank_transfer', 'upi', 'card', 'bank_transfer', 'upi', 'bank_transfer'][i],
      transactionId: status === 'paid' ? `TXN-DEMO-${1001 + i}` : undefined,
      status,
      paymentDate: status === 'paid' ? new Date(now.getTime() - (5 - i) * 86400000) : null,
      dueDate: new Date(now.getTime() + 10 * 86400000),
      invoiceNumber: `INV-DEMO-${1001 + i}`,
      notes: 'Presentation demo data',
      processedBy: user._id,
      createdAt: new Date(now.getTime() - (6 - i) * 86400000),
      updatedAt: new Date(now.getTime() - (6 - i) * 86400000),
    }));

    await Payment.insertMany(payments, { ordered: true });

    // Keep performance/profile values presentation-ready.
    vendor.rating = { delivery: 4.6, quality: 4.8, communication: 4.5, support: 4.7, overall: 4.7 };
    vendor.completionRate = 88;
    vendor.totalOrders = 8;
    vendor.completedOrders = 2;
    await vendor.save();

    console.log('\nDemo data created successfully!');
    console.log('Orders: 8');
    console.log('Pending orders shown on dashboard: 2');
    console.log('Payments: 6');
    console.log('Paid amount / Total Earned: ₹45,500');
    console.log('Vendor login:', user.email);
    console.log('\nRestart backend/frontend and refresh the Vendor Dashboard.');
  } catch (err) {
    console.error('Demo data error:', err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

seedDemoData();
