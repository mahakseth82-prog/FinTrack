/**
 * FinTrack Smart Expo Launcher (`mobile/start-expo.js`)
 *
 * Automatically selects the real Wi-Fi IPv4 address (ignoring Hyper-V vEthernet,
 * VirtualBox 192.168.56.x, and VMware VMnet adapters) so the QR code scanned by
 * Expo Go on a phone always points to the laptop's actual Wi-Fi IP.
 */

const os = require('os');
const { spawn } = require('child_process');

function detectRealWifiIp() {
  const interfaces = os.networkInterfaces();
  let fallbackIp = null;

  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue;
    const lowerName = name.toLowerCase();

    // Ignore virtual adapters (Hyper-V, VMware, VirtualBox, WSL)
    if (
      lowerName.includes('vethernet') ||
      lowerName.includes('vmware') ||
      lowerName.includes('vmnet') ||
      lowerName.includes('vbox') ||
      lowerName.includes('virtual') ||
      lowerName.includes('wsl')
    ) {
      continue;
    }

    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) {
        // Ignore VirtualBox default subnet 192.168.56.x
        if (addr.address.startsWith('192.168.56.')) {
          continue;
        }
        // Prefer Wi-Fi / Wireless adapter
        if (lowerName.includes('wi-fi') || lowerName.includes('wireless') || lowerName.includes('wlan')) {
          return addr.address;
        }
        if (!fallbackIp) {
          fallbackIp = addr.address;
        }
      }
    }
  }

  return fallbackIp || '127.0.0.1';
}

const wifiIp = detectRealWifiIp();
process.env.REACT_NATIVE_PACKAGER_HOSTNAME = wifiIp;
process.env.EXPO_PUBLIC_BACKEND_URL = `http://${wifiIp}:5000/api/v1`;

console.log('============================================================');
console.log(` FinTrack Wi-Fi Host Detected: ${wifiIp}`);
console.log(` Expo Go QR Code Host        : exp://${wifiIp}:8081`);
console.log(` Mobile Browser Web URL      : http://${wifiIp}:8081`);
console.log(` Backend API URL             : http://${wifiIp}:5000/api/v1`);
console.log('============================================================');

const extraArgs = process.argv.slice(2);
const child = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['expo', 'start', ...extraArgs],
  {
    stdio: 'inherit',
    env: process.env,
    shell: true,
  }
);

child.on('exit', (code) => {
  process.exit(code || 0);
});
