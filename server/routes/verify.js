const express = require('express');
const router = express.Router();
const { askGeminiDirect, askClaudeDirect } = require('../services/gemini');

router.post('/messages', async (req, res) => {
  try {
    const messages = req.body.messages;
    if (!messages || messages.length === 0) {
      return res.status(400).json({ error: 'Missing messages array' });
    }

    const contentArray = messages[0].content;
    let promptText = '';
    let base64Image = null;
    let mimeType = null;

    // Parse the Anthropic-style payload from the frontend
    if (Array.isArray(contentArray)) {
      for (const part of contentArray) {
        if (part.type === 'text') {
          promptText = part.text;
        } else if (part.type === 'image' && part.source?.type === 'base64') {
          base64Image = part.source.data;
          mimeType = part.source.media_type;
        }
      }
    } else if (typeof contentArray === 'string') {
      promptText = contentArray;
    }

    if (!promptText) {
      return res.status(400).json({ error: 'Missing prompt text' });
    }

    console.log('[Verify Route] Firing parallel requests to Claude and Gemini...');
    
    const injectedPrompt = `${promptText}

[CRITICAL INSTRUCTION] You are the final anti-fraud verification engine. Perform deep forensic analysis and document relevance checks.

1. CLASSIFICATION STAGE
Classify into exactly ONE:
Allowed: real_document, real_scan, real_camera_photo
Suspicious: ai_generated_document, photoshopped_document, template_fake_document, wrong_document, unrelated_image, code_screenshot, random_screenshot, blank_image, low_quality_unreadable

2. ZERO-TRUST EVIDENCE SCORING
Start at 0. Add points ONLY for authentic evidence:
+20 readable official document title
+15 clear government authority / NGO authority name
+15 valid registration number pattern
+10 consistent seals/stamps
+10 coherent layout with realistic spacing
+10 OCR text consistency
+10 org name matches form
+5 address matches form
+5 PAN / tax ID matches form

3. FRAUD PENALTIES
Subtract heavily for:
-20 unnatural fonts
-20 repeated textures / AI artifacts
-25 too-perfect synthetic layout
-25 hallucinated text
-20 fake logo/seal
-20 mismatched org name
-15 impossible spacing
-20 edited/cropped suspicious zones
-40 unrelated image
-50 code screenshot

You MUST respond with pure JSON containing EXACTLY these fields:
{
  "classification": "must be exactly one of the allowed or suspicious classes",
  "evidence_points": number (0-100),
  "penalties": number,
  "confidence_score": number (evidence - penalties),
  "matched_fields": {
    "orgName": boolean,
    "registrationNo": boolean,
    "PAN": boolean,
    "website": boolean,
    "address": boolean
  },
  "extracted_fields": {
    "orgName": "string or null",
    "registrationNo": "string or null",
    "PAN": "string or null",
    "website": "string or null",
    "address": "string or null"
  },
  "red_flags": ["array of strings detailing any suspicious findings"],
  "reasoning": "string explaining the classification and scoring"
}
No markdown around the JSON.`;

    // 1. DUAL MODEL PIPELINE
    const [geminiResult, claudeResult] = await Promise.allSettled([
      askGeminiDirect(injectedPrompt, base64Image, mimeType),
      askClaudeDirect(injectedPrompt, base64Image, mimeType)
    ]);

    let geminiData = geminiResult.status === 'fulfilled' ? geminiResult.value : null;
    let claudeData = claudeResult.status === 'fulfilled' ? claudeResult.value : null;

    if (!geminiData && !claudeData) {
      console.error('[Verify Route] BOTH MODELS FAILED.');
      return res.status(500).json({ error: 'AI Verification failed completely.' });
    }

    if (geminiResult.status === 'rejected') console.error('[Verify Route] Gemini Error:', geminiResult.reason.message);
    if (claudeResult.status === 'rejected') console.error('[Verify Route] Claude Error:', claudeResult.reason.message);

    const normalize = (data) => {
      if (!data) return null;
      return {
        classification: data.classification || data.document_classification || 'wrong_document',
        evidence_points: data.evidence_points || 0,
        penalties: data.penalties || 0,
        confidence_score: data.confidence_score || 0,
        matched_fields: data.matched_fields || {},
        extracted_fields: data.extracted_fields || {},
        red_flags: Array.isArray(data.red_flags) ? data.red_flags : [],
        reasoning: data.reasoning || data.summary || ''
      };
    };

    let gData = normalize(geminiData);
    let cData = normalize(claudeData);

    // Timeout safe / fallback
    if (!gData && cData) gData = cData;
    if (!cData && gData) cData = gData;

    console.log('[Verify] Gemini Output:', JSON.stringify(gData));
    console.log('[Verify] Claude Output:', JSON.stringify(cData));

    // Zero-trust calculation
    const calcScore = (data) => {
      let score = data.evidence_points - Math.abs(data.penalties);
      return Math.max(0, Math.min(100, score));
    };

    let gScoreRaw = gData ? calcScore(gData) : 0;
    let cScoreRaw = cData ? calcScore(cData) : 0;

    // STAGE A: DOCUMENT TYPE / RELEVANCE GATE
    const capScore = (classification, score) => {
      const caps = {
        ai_generated_document: 15,
        photoshopped_document: 15,
        template_fake_document: 20,
        wrong_document: 10,
        unrelated_image: 5,
        code_screenshot: 0,
        random_screenshot: 5,
        blank_image: 0,
        low_quality_unreadable: 20
      };
      if (caps[classification] !== undefined) {
        return Math.min(score, caps[classification]);
      }
      return score;
    };

    let s1 = capScore(gData.classification, gScoreRaw);
    let s2 = capScore(cData.classification, cScoreRaw);
    
    const isReal = (c) => ['real_document', 'real_scan', 'real_camera_photo', 'real_verified_document', 'real_scan_document', 'real_camera_photo_document'].includes(c);
    
    const gReal = isReal(gData.classification);
    const cReal = isReal(cData.classification);

    let finalScore = 0;
    let finalClass = '';

    // DUAL MODEL PARALLEL CHECK CONSENSUS
    if (gReal && cReal) {
      finalScore = Math.round((s1 + s2) / 2);
      finalClass = gData.classification;
    } else if (!gReal && !cReal) {
      finalScore = Math.min(s1, s2);
      finalClass = gData.classification;
    } else {
      // REAL + FAKE: Take stricter
      finalScore = Math.min(s1, s2);
      finalClass = 'suspicious_document';
    }

    // FORM MATCH VALIDATION
    const matchedFields = {
        orgName: gData.matched_fields?.orgName === true && cData.matched_fields?.orgName === true,
        registrationNo: gData.matched_fields?.registrationNo === true && cData.matched_fields?.registrationNo === true,
        PAN: gData.matched_fields?.PAN === true && cData.matched_fields?.PAN === true,
        website: gData.matched_fields?.website === true && cData.matched_fields?.website === true,
        address: gData.matched_fields?.address === true && cData.matched_fields?.address === true
    };
    
    if (matchedFields.orgName === false || matchedFields.registrationNo === false || matchedFields.PAN === false) {
      finalScore = Math.min(finalScore, 40);
    }
    
    // Final safety caps if suspicious classification exists
    if (!isReal(finalClass)) {
      finalScore = Math.min(finalScore, 64);
    }

    finalScore = Math.max(0, Math.min(100, finalScore));

    // FINAL DECISION
    let finalDecision = 'auto_reject';
    if (finalScore >= 75) {
      finalDecision = 'admin_review';
    } else if (finalScore >= 65 && finalScore < 75) {
      finalDecision = 'manual_second_check';
    } else {
      finalDecision = 'auto_reject';
    }

    // Combine red flags
    const combinedRedFlags = [...new Set([...gData.red_flags, ...cData.red_flags])];
    
    const extractedFields = {
        orgName: gData.extracted_fields?.orgName || cData.extracted_fields?.orgName || null,
        registrationNo: gData.extracted_fields?.registrationNo || cData.extracted_fields?.registrationNo || null,
        PAN: gData.extracted_fields?.PAN || cData.extracted_fields?.PAN || null,
        website: gData.extracted_fields?.website || cData.extracted_fields?.website || null,
        address: gData.extracted_fields?.address || cData.extracted_fields?.address || null
    };

    // REQUIRED OUTPUT JSON
    const mergedResult = {
      classification: finalClass,
      confidence_score: finalScore,
      evidence_points: Math.round(((gData.evidence_points || 0) + (cData.evidence_points || 0)) / 2),
      penalties: Math.round(((gData.penalties || 0) + (cData.penalties || 0)) / 2),
      matched_fields: matchedFields,
      extracted_fields: extractedFields,
      red_flags: combinedRedFlags,
      reasoning: `[Consensus] G: ${s1}, C: ${s2}. ${gData.reasoning} | ${cData.reasoning}`.trim(),
      final_decision: finalDecision,
      
      // Backward compatibility fields for existing UI
      document_classification: finalClass,
      decision: finalDecision,
      documentAuthenticityScore: finalScore,
      documentType: finalClass,
      extractedOrgName: extractedFields.orgName,
      extractedRegNumber: extractedFields.registrationNo,
      nameMatch: matchedFields.orgName,
      regNumberMatch: matchedFields.registrationNo
    };

    // DEBUG LOGGING
    console.log('[Verify Route] FINAL DECISION:');
    console.log('Claude Result:', JSON.stringify(cData));
    console.log('Gemini Result:', JSON.stringify(gData));
    console.log('Merged Class:', mergedResult.classification);
    console.log('Merged Score:', mergedResult.confidence_score);
    console.log('Merged Decision:', mergedResult.final_decision);
    console.log('Red Flags:', mergedResult.red_flags);

    // Sanitize nested fields for Firestore safety (No undefined values)
    const deepSanitize = (obj) => {
      if (obj === null || typeof obj !== 'object') {
        return obj === undefined ? null : obj;
      }
      if (Array.isArray(obj)) {
        return obj.map(deepSanitize);
      }
      const sanitized = {};
      for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = value === undefined ? null : deepSanitize(value);
      }
      return sanitized;
    };

    const safeResult = deepSanitize(mergedResult);

    const anthropicFormat = {
      id: "msg_dual_" + Date.now(),
      type: "message",
      role: "assistant",
      model: "dual-consensus",
      content: [
        {
          type: "text",
          text: JSON.stringify(safeResult)
        }
      ]
    };

    res.json(anthropicFormat);
  } catch (error) {
    console.error('[Verify Route] Fatal Error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
