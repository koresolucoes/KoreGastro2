const https = require('https');

const req = https.request('https://app.chefos.online/api/proxy-cielo-lio?path=/orders', {
  method: 'POST',
  headers: {
    'client-id': 'test',
    'access-token': 'test',
    'merchant-id': 'test',
    'content-type': 'application/json'
  }
}, (res) => {
  console.log('Status:', res.statusCode);
  res.on('data', d => process.stdout.write(d));
});
req.on('error', console.error);
req.write(JSON.stringify({ test: "data" }));
req.end();
