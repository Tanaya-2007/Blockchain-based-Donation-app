function buildVerificationPrompt(campaignContext) {
  const ctx = (campaignContext || '').slice(0, 200);
  return `You are a forensic fraud detection AI. Assume every document is FAKE.

Campaign: ${ctx}

Analyze the image and return ONLY this JSON (no markdown, no explanation):

{
  "document_classification": "correct_document|wrong_document|ai_generated_image|screenshot|code_image|unrelated_image|blank",
  "is_relevant": <true|false>,
  "matches_campaign": <true|false>,
  "fraud_detected": <true|false>,
  "forensic_signals": {
    "has_paper_texture": <true|false>,
    "has_scan_artifacts": <true|false>,
    "has_natural_imperfections": <true|false>,
    "has_ink_variation": <true|false>,
    "has_realistic_shadows": <true|false>,
    "stamp_looks_authentic": <true|false|null>,
    "signature_looks_authentic": <true|false|null>,
    "text_looks_printed_not_rendered": <true|false>,
    "background_is_smooth_gradient": <true|false>,
    "lighting_is_too_perfect": <true|false>,
    "fonts_are_perfectly_uniform": <true|false>,
    "ai_generation_probability": <integer 0-100>,
    "tampering_probability": <integer 0-100>,
    "is_ai_generated": <true|false>
  },
  "red_flags": ["<specific observation>"],
  "reason": "<one sentence>"
}

Rules:
- ai_generated_image: smooth background, perfect lighting, no paper grain, rendered text, diffusion/GAN artifacts
- correct_document: real paper with visible grain, scan lines, ink variation, slight imperfections
- wrong_document: real doc but wrong type (PAN/Aadhaar when cert/invoice needed)
- unrelated_image: photos, nature, people, screenshots
- Real Indian NGO docs are IMPERFECT. Too clean = ai_generated_image.`;
}

module.exports = { buildVerificationPrompt };