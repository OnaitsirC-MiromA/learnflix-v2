const fs = require('node:fs');
const password = fs.readFileSync(process.env.ACCESS_PASSWORD_FILE, 'utf8').trim();
fetch(`http://127.0.0.1:${process.env.PORT || 7777}/api/telegram/status`, {
  headers: { Authorization: 'Basic ' + Buffer.from(`learnflix:${password}`).toString('base64') },
  signal: AbortSignal.timeout(5000),
}).then(async r => process.exit(r.ok && (await r.json()).connected ? 0 : 1)).catch(() => process.exit(1));
