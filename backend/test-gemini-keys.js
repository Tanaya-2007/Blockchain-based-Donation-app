require('dotenv').config({ override: true });
const https = require('https');

const KEYS = [
  process.env.GEMINI_API_KEY,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
  process.env.GEMINI_API_KEY_4,
].filter(Boolean);

// Test via direct HTTPS — no SDK, no library, just raw REST
// This shows the EXACT error Google returns
function testKeyDirect(key, keyIdx, model) {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      contents: [{ parts: [{ text: 'Say hi' }] }]
    });

    const options = {
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/${model}:generateContent?key=${key}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 15000,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode === 200) {
            resolve({ status: '✅ WORKING', code: 200, raw: null });
          } else {
            // Show the FULL Google error message
            const errMsg = json?.error?.message || JSON.stringify(json);
            const errCode = json?.error?.code || res.statusCode;
            const errStatus = json?.error?.status || '';

            let label;
            if (res.statusCode === 429 || errStatus === 'RESOURCE_EXHAUSTED') {
              label = '🔴 QUOTA EXCEEDED';
            } else if (res.statusCode === 403 || errStatus === 'PERMISSION_DENIED') {
              label = '💀 KEY INVALID/DEAD';
            } else if (res.statusCode === 404 || errStatus === 'NOT_FOUND') {
              label = '⚠️  MODEL NOT FOUND';
            } else if (res.statusCode === 400) {
              label = '❌ BAD REQUEST';
            } else {
              label = `❓ HTTP ${res.statusCode} ${errStatus}`;
            }

            resolve({ status: label, code: errCode, raw: errMsg });
          }
        } catch (e) {
          resolve({ status: '❓ PARSE ERROR', code: res.statusCode, raw: data.slice(0, 300) });
        }
      });
    });

    req.on('error', e => resolve({ status: '❌ NETWORK ERROR', code: 0, raw: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: '⏰ TIMEOUT', code: 0, raw: 'Request timed out after 15s' }); });
    req.write(body);
    req.end();
  });
}

const MODELS = ['gemini-2.0-flash', 'gemini-2.0-flash-lite'];

(async () => {
  console.log(`\n🔑 Found ${KEYS.length} key(s) in .env`);
  console.log('Testing via direct HTTPS (no SDK) — shows exact Google error\n');
  console.log('='.repeat(70));

  const working = [];

  for (let ki = 0; ki < KEYS.length; ki++) {
    console.log(`\nKey ${ki + 1} (ends in ...${KEYS[ki].slice(-6)}):`);
    for (const model of MODELS) {
      const { status, code, raw } = await testKeyDirect(KEYS[ki], ki + 1, model);
      console.log(`  ${model.padEnd(22)} → ${status}`);
      if (raw) {
        // Print FULL error — no truncation
        console.log(`  Full error: ${raw}`);
      }
      if (status.includes('WORKING')) working.push({ key: ki + 1, model });
      await new Promise(r => setTimeout(r, 300));
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log(`\nRESULT: ${working.length} working combinations`);
  if (working.length > 0) {
    console.log('✅ These work:');
    working.forEach(w => console.log(`   Key ${w.key} + ${w.model}`));
  } else {
    console.log('\n📋 Send the FULL error messages above to diagnose the real problem.');
    console.log('   The full error text will tell us exactly what Google is rejecting.\n');
  }
})();