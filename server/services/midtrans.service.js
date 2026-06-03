import crypto from 'node:crypto';

function midtransConfig() {
  const serverKey = process.env.MIDTRANS_SERVER_KEY || '';
  const isProduction = process.env.MIDTRANS_PRODUCTION === 'true';
  return {
    serverKey,
    isProduction,
    snapUrl: isProduction
      ? 'https://app.midtrans.com/snap/v1/transactions'
      : 'https://app.sandbox.midtrans.com/snap/v1/transactions'
  };
}

export function isMidtransConfigured() {
  return Boolean(midtransConfig().serverKey);
}

export async function createMidtransSnap({ invoice, user }) {
  const { serverKey, snapUrl } = midtransConfig();
  if (!serverKey) {
    const error = new Error('Midtrans belum dikonfigurasi.');
    error.status = 503;
    throw error;
  }
  const payload = {
    transaction_details: {
      order_id: invoice.id,
      gross_amount: Number(invoice.amount)
    },
    customer_details: {
      first_name: user.username,
      email: user.email
    },
    item_details: [{
      id: invoice.plan,
      price: Number(invoice.amount),
      quantity: 1,
      name: invoice.label
    }],
    enabled_payments: ['gopay', 'shopeepay', 'qris', 'other_qris', 'dana', 'bank_transfer', 'echannel', 'mandiri_va', 'permata_va', 'bca_va', 'bni_va', 'bri_va']
  };
  const response = await fetch(snapUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Basic ${Buffer.from(`${serverKey}:`).toString('base64')}`
    },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error_messages?.join(', ') || 'Midtrans menolak request.');
    error.status = response.status;
    throw error;
  }
  return { token: data.token, redirectUrl: data.redirect_url };
}

export function verifyMidtransSignature({ orderId, statusCode, grossAmount, signatureKey }) {
  const { serverKey } = midtransConfig();
  if (!serverKey) return false;
  const expected = crypto
    .createHash('sha512')
    .update(`${orderId}${statusCode}${grossAmount}${serverKey}`)
    .digest('hex');
  // Gunakan timing-safe comparison untuk mencegah timing attack
  if (expected.length !== signatureKey?.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureKey || ''));
}
