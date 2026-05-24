// Run: node test-now.js
require('dotenv').config({ override: true });
const { GoogleGenerativeAI } = require('@google/generative-ai');

const KEY4 = process.env.GEMINI_API_KEY_4;
const KEY1 = process.env.GEMINI_API_KEY;

console.log('\n=== QUICK GEMINI TEST ===');
console.log('Key1 ends in:', KEY1?.slice(-6) || 'MISSING');
console.log('Key4 ends in:', KEY4?.slice(-6) || 'MISSING');

async function hit(label, key, model) {
  try {
    const g = new GoogleGenerativeAI(key);
    const m = g.getGenerativeModel({ model, generationConfig: { responseMimeType: 'application/json' } });
    const r = await m.generateContent('Return: {"ok":true}');
    console.log(`✅ ${label} + ${model} WORKS → ${r.response.text().slice(0,30)}`);
    return true;
  } catch(e) {
    console.log(`❌ ${label} + ${model}: ${e.message.slice(0,150)}`);
    return false;
  }
}

(async () => {
  let worked = false;
  if (KEY1) worked = await hit('Key1', KEY1, 'gemini-2.0-flash') || worked;
  if (KEY4) worked = await hit('Key4', KEY4, 'gemini-2.0-flash') || worked;
  if (KEY4) worked = await hit('Key4', KEY4, 'gemini-2.0-flash-lite') || worked;

  console.log('\n' + (worked ? '✅ Gemini IS working — just replace gemini.js + verifier.js and restart' : '❌ Still failing — paste full error above'));
  console.log('=========================\n');
})();