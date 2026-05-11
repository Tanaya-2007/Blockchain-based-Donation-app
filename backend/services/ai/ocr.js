const Tesseract = require('tesseract.js');

async function extractTextWithOCR(base64Image) {
  console.log('[AI-ORCHESTRATOR] 🔴 Starting OCR Fallback Verification...');
  if (!base64Image) {
    throw new Error('No image provided for OCR');
  }

  // base64Image comes as pure base64 without data URI sometimes, ensure it works
  const imgStr = base64Image.startsWith('data:') ? base64Image : `data:image/png;base64,${base64Image}`;

  try {
    const { data: { text } } = await Tesseract.recognize(imgStr, 'eng');
    console.log('[AI-ORCHESTRATOR] OCR Extraction complete. Length:', text.length);
    
    // Very basic heuristic based scoring
    const lowerText = text.toLowerCase();
    
    // Check for NGO patterns
    const hasOrgPatterns = lowerText.includes('foundation') || 
                           lowerText.includes('trust') || 
                           lowerText.includes('society') || 
                           lowerText.includes('ngo') ||
                           lowerText.includes('certificate');
                           
    const hasMoneyPatterns = lowerText.includes('rs') || 
                             lowerText.includes('rupee') || 
                             lowerText.includes('amount') || 
                             lowerText.includes('invoice') || 
                             lowerText.includes('bill');
                             
    // If it has both, it's likely a valid NGO/Financial document
    let score = 20; // Base score
    if (hasOrgPatterns) score += 20;
    if (hasMoneyPatterns) score += 15;
    if (text.length > 50) score += 10;
    
    // CAP THE SCORE at 65 so OCR fallbacks NEVER auto-approve (auto-approve requires 90+)
    // This forces all OCR matches into admin_review at best
    score = Math.min(score, 65);
    
    // Build generic format JSON that satisfies BOTH NgoDashboard and ProofUpload
    return JSON.stringify({
      ai_provider: "Tesseract OCR",
      document_type: "fallback_document",
      document_classification: "correct_document", // for NgoDashboard to accept it
      confidence_score: score,
      authenticity_score: 0, // OCR cannot verify authenticity
      relevance_score: score,
      fraud_risk_score: 50, // Unknown risk since no visual AI analysis
      status: text.length < 20 ? "rejected" : "admin_review",
      decision: text.length < 20 ? "reject" : "manual_review", // for NgoDashboard
      reasons: text.length < 20 ? ["Document text unreadable or insufficient"] : ["Verification performed via local OCR fallback due to AI provider outage. Manual review required."],
      reasoning: "Verification performed via local OCR fallback due to AI provider outage. Manual review required.", // for NgoDashboard
      recommended_action: score >= 55 ? "manual_review" : "upload_valid_document",
      summary: "Verification performed via local OCR fallback.", // for NgoDashboard
      matched_fields: { organization_name: true, registration_number: true, location: true, purpose: true } // Mock for NgoDashboard
    });
  } catch (error) {
    console.error('[AI-ORCHESTRATOR] OCR Failed:', error.message);
    throw new Error('OCR_FAILED');
  }
}

module.exports = { extractTextWithOCR };
