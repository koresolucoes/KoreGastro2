const fs = require('fs');
let code = fs.readFileSync('src/services/operational-auth.service.ts', 'utf8');

if (!code.includes('private getCurrentLocation()')) {
  code = code.replace(/  async clockIn/, 
`  private getCurrentLocation(): Promise<{ latitude: number; longitude: number }> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocalização não suportada'));
      } else {
        navigator.geolocation.getCurrentPosition(
          pos => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
          err => reject(err),
          { timeout: 10000 }
        );
      }
    });
  }

  async clockIn`);
  fs.writeFileSync('src/services/operational-auth.service.ts', code);
}
