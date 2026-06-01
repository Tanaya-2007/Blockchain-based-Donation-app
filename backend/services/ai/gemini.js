const { GoogleGenerativeAI } = require('@google/generative-ai');

// Model selection
const MODEL = 'gemini-2.5-flash';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const rawKeys = [
  process.env.GEMINI_API_KEY,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
  process.env.GEMINI_API_KEY_4,
].filter(Boolean);

const uniqueKeys = [...new Set(rawKeys)];

// Enterprise Key State Array
const keys = uniqueKeys.map((key, idx) => ({
  id: idx + 1,
  key: key,
  lastFailure: 0,
  cooldownUntil: 0,
  requestsToday: 0,
  requestsThisMinute: 0,
  consecutiveFailures: 0
}));

if (keys.length > 0) {
  console.log(`[GEMINI] Enterprise Orchestration initialized with ${keys.length} keys.`);
}

// Global Round Robin Pointer
let currentIndex = 0;

function getNextAvailableKey() {
  const now = Date.now();
  let attempts = 0;
  
  // Try to find the next healthy key using round-robin
  while (attempts < keys.length) {
    const k = keys[currentIndex];
    // Advance pointer immediately to ensure round-robin distribution
    currentIndex = (currentIndex + 1) % keys.length;
    attempts++;
    
    if (now >= k.cooldownUntil) {
      return k;
    }
  }
  return null; // All keys are on cooldown
}

function applyCooldown(k) {
  k.consecutiveFailures += 1;
  k.lastFailure = Date.now();
  
  // Exponential Backoff Strategy
  let penalty = 30; // 1st failure: 30s
  if (k.consecutiveFailures === 2) penalty = 60;
  else if (k.consecutiveFailures === 3) penalty = 120;
  else if (k.consecutiveFailures >= 4) penalty = 300;
  
  k.cooldownUntil = Date.now() + (penalty * 1000);
  console.warn(`[AI] Provider=Gemini Key=${k.id} Cooldown=${penalty}s Failures=${k.consecutiveFailures} Status=RateLimited_429`);
}

function classifyError(err) {
  const msg = (err?.message || '').toLowerCase();
  return {
    isQuota:   msg.includes('429') || msg.includes('quota') ||
               msg.includes('resource_exhausted') || msg.includes('rate limit') ||
               msg.includes('too many requests'),
    isKeyDead: msg.includes('api_key_invalid') || msg.includes('api key not valid') ||
               msg.includes('permission denied') || msg.includes('invalid api key') ||
               (err?.status || 0) === 403 || msg.includes('api key expired'),
  };
}

function safeParse(text) {
  if (!text) return null;
  try {
    const c = text.replace(/```json\s*/gi,'').replace(/```\s*/g,'').trim();
    const m = c.match(/\{[\s\S]*\}/);
    return JSON.parse(m ? m[0] : c);
  } catch { return null; }
}

// Reset 'RequestsThisMinute' stat every minute internally
setInterval(() => {
  keys.forEach(k => k.requestsThisMinute = 0);
}, 60000);

// Reset 'RequestsToday' roughly every 24h internally
setInterval(() => {
  keys.forEach(k => k.requestsToday = 0);
}, 86400000);

// Background Health Check System: automatically test keys on cooldown every 5 minutes
setInterval(async () => {
  try {
    const now = Date.now();
    for (const k of keys) {
      // Only re-test if the key is currently marked as on cooldown
      if (k.cooldownUntil > now) {
        console.log(`[AI] Provider=Gemini Key=${k.id} Action=HealthCheck Status=Testing`);
        try {
          const genAI = new GoogleGenerativeAI(k.key);
          const model = genAI.getGenerativeModel({ model: MODEL });
          await model.generateContent({ contents: [{ role: 'user', parts: [{ text: 'status check ping' }] }] });
          
          // If successful, instantly clear cooldown
          k.cooldownUntil = 0;
          k.consecutiveFailures = 0;
          console.log(`[AI] Provider=Gemini Key=${k.id} Action=HealthCheck Status=Restored`);
        } catch (err) {
          console.log(`[AI] Provider=Gemini Key=${k.id} Action=HealthCheck Status=Failed Reason="${err.message}"`);
          // Note: we leave the cooldownUntil as-is; it will expire naturally as per exponential backoff
        }
      }
    }
  } catch (globalErr) {
    console.error(`[HealthCheck] System Error: ${globalErr.message}`);
  }
}, 5 * 60 * 1000);

async function askGemini(prompt, base64Image = null, mimeType = null) {
  if (!keys.length) throw new Error('GEMINI_KEY_MISSING');
  
  const startTime = Date.now();
  let retries = 0;
  
  // Attempt until we've exhausted all available keys
  while (retries < keys.length) {
    const k = getNextAvailableKey();
    if (!k) {
      console.error(`[AI] Provider=Gemini Retries=${retries} Status=Failed FallbackReason=AllKeysExhausted TemporaryOutage`);
      throw new Error('ALL_GEMINI_KEYS_EXHAUSTED');
    }
    
    try {
      const genAI = new GoogleGenerativeAI(k.key);
      const model = genAI.getGenerativeModel({
        model: MODEL,
        generationConfig: { responseMimeType: 'application/json', temperature: 0.0 },
      });

      const parts = [];
      if (base64Image && mimeType) parts.push({ inlineData: { data: base64Image, mimeType } });
      parts.push({ text: prompt });

      // Track usage
      k.requestsThisMinute++;
      k.requestsToday++;

      const result = await model.generateContent(parts);
      const text = result.response.text();
      
      if (!text?.trim()) throw new Error('EMPTY_RESPONSE');

      const parsed = safeParse(text);
      if (!parsed) throw new Error('PARSE_FAILED');

      const latency = Date.now() - startTime;
      
      // Connection succeeded without 429 -> reset penalty logic completely
      k.consecutiveFailures = 0; 
      
      console.log(`[AI] Provider=Gemini Key=${k.id} Retries=${retries} Status=Success Latency=${latency}ms`);
      return JSON.stringify(parsed);

    } catch (err) {
      const { isQuota, isKeyDead } = classifyError(err);
      
      if (isQuota) {
        applyCooldown(k);
      } else if (isKeyDead) {
        k.cooldownUntil = Date.now() + 86400000; // Suspend key for 24h
        console.error(`[AI] Provider=Gemini Key=${k.id} Retries=${retries} Status=KeyDead_403 Forbidden`);
      } else {
        // Typical payload rejection or other AI system error, enforce tiny 5s pause to avoid immediate spin loop
        k.cooldownUntil = Date.now() + 5000; 
        console.error(`[AI] Provider=Gemini Key=${k.id} Retries=${retries} Status=Error FallbackReason="${(err.message||'').slice(0, 80)}"`);
      }
      
      retries++;
    }
  }

  // If retries hit keys.length and we run out of iterations, bubble up failure
  console.error(`[AI] Provider=Gemini Retries=${retries} Status=Exhausted FallbackReason="All ${keys.length} keys attempted and failed"`);
  throw new Error('ALL_GEMINI_COMBINATIONS_FAILED');
}

module.exports = { askGemini };