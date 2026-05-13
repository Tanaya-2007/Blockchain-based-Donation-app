const Tesseract = require('tesseract.js');

async function extractTextWithOCR(base64Image) {
  console.log('[AI-ORCHESTRATOR] 🔴 Starting OCR Fallback Verification...');
  if (!base64Image) {
    throw new Error('No image provided for OCR');
  }

  const imgStr = base64Image.startsWith('data:')
    ? base64Image
    : `data:image/png;base64,${base64Image}`;

  let worker;
  try {
    worker = await Tesseract.createWorker('eng');
    const { data: { text } } = await worker.recognize(imgStr);
    await worker.terminate();

    console.log('[AI-ORCHESTRATOR] OCR Extraction complete. Length:', text.length);

    const lowerText = text.toLowerCase();

    const hasOrgPatterns =
      lowerText.includes('foundation') ||
      lowerText.includes('trust') ||
      lowerText.includes('society') ||
      lowerText.includes('ngo') ||
      lowerText.includes('certificate') ||
      lowerText.includes('registered');

    const hasMoneyPatterns =
      lowerText.includes('rs') ||
      lowerText.includes('rupee') ||
      lowerText.includes('amount') ||
      lowerText.includes('invoice') ||
      lowerText.includes('bill') ||
      lowerText.includes('receipt');

    let score = 20;
    if (hasOrgPatterns)  score += 25;
    if (hasMoneyPatterns) score += 25;
    if (text.length > 50) score += 10;
    if (text.length > 200) score += 5; // bonus for richer content

    console.log('[AI-ORCHESTRATOR] OCR score:', score, '| hasOrg:', hasOrgPatterns, '| hasMoney:', hasMoneyPatterns);

    return JSON.stringify({
      status:                score >= 60 ? "approved" : "rejected",
      confidence_score:      score,
      reason:                "Verification performed via local OCR fallback due to AI provider outage.",
      is_relevant:           hasOrgPatterns || hasMoneyPatterns,
      matches_campaign:      true,
      fraud_detected:        false,
      document_classification: "unknown_ocr",
      decision:              score >= 60 ? "manual_review" : "reject",
      ai_provider:           "Tesseract OCR (Local Fallback)"
    });

  } catch (error) {
    // Make sure worker is always cleaned up
    if (worker) {
      try { await worker.terminate(); } catch (_) {}
    }
    console.error('[AI-ORCHESTRATOR] OCR Failed:', error.message);
    throw new Error('OCR_FAILED: ' + error.message);
  }
}

module.exports = { extractTextWithOCR };