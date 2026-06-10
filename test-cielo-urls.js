import https from 'https';

const urls = [
  'https://api.cielo.com.br/sandbox-lio/order-management/v1',
  'https://api.cielo.com.br/sandbox/order-management/v1',
  'https://api.cielo.com.br/order-management/v1',
  'https://api.sandbox.cielo.com.br/order-management/v1',
  'https://apioauth.cielo.com.br/order-management/v1',
  'https://api-sandbox.cielo.com.br/order-management/v1',
  'https://api.cieloecommerce.cielo.com.br/order-management/v1',
  'https://api.sandbox.cieloecommerce.cielo.com.br/order-management/v1'
];

async function check() {
  for (const url of urls) {
    try {
      console.log(`Checking ${url}`);
      const res = await fetch(url, { method: 'HEAD' });
      console.log(`- Status: ${res.status}`);
    } catch (e) {
      console.log(`- Error: ${e.message}`);
    }
  }
}

check();
