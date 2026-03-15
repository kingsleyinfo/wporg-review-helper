// ==UserScript==
// @name         WPorg Review Helper
// @namespace    https://github.com/Kingsleyinfo/wporg-review-helper
// @updateURL    https://raw.githubusercontent.com/Kingsleyinfo/wporg-review-helper/master/tampermonkey/review-helper.user.js
// @downloadURL  https://raw.githubusercontent.com/Kingsleyinfo/wporg-review-helper/master/tampermonkey/review-helper.user.js
// @version      2.4.0
// @description  Analyzes WordPress.org support threads using AI and recommends review request templates based on customer sentiment.
// @author       Kay (Kingsleyinfo)
// @match        https://wordpress.org/support/topic/*
// @grant        GM_setClipboard
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @connect      api.groq.com
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ──────────────────────────────────────────────
  // 1. CONFIGURATION
  // ──────────────────────────────────────────────

  const GROQ_MODEL = 'llama-3.1-8b-instant';
  const API_KEY_STORAGE = 'wrh_groq_api_key';
  const ANALYTICS_STORAGE = 'wrh_analytics_log';
  const ANALYTICS_MAX_ENTRIES = 1000;

  // ──────────────────────────────────────────────
  // 2. TEMPLATES
  // ──────────────────────────────────────────────

  const TEMPLATES = {
    A: {
      name: 'Quick Resolution',
      description: 'Short thread (≤3 agent replies), user confirmed fix, positive tone.',
      text: `I'm glad we got that sorted! 🎉 Your experience could really help other store owners who might run into something similar. If you have a moment, we'd appreciate a quick review here: [REVIEW_LINK]\n\nThanks again — don't hesitate to reach out if anything else comes up!`,
    },
    B: {
      name: 'Resolved After Long Thread',
      description: 'Longer thread (4+ agent replies), user confirmed fix, positive/neutral tone.',
      text: `I'm happy we were able to work through that together — I know it took some patience on your end! If the solution is still holding up and you'd like to share your experience to help others in the community, you can leave a review here: [REVIEW_LINK]\n\nFeel free to open a new thread anytime if anything else comes up.`,
    },
    C: {
      name: 'Workaround Accepted',
      description: 'Agent offered a workaround and the user accepted it positively.',
      text: `I'm glad the workaround is doing the job! If you'd like to share your experience, it really helps other users who might face something similar: [REVIEW_LINK]\n\nWe've noted your feedback too — it helps our team prioritize what to improve next. Thanks for your patience!`,
    },
    D: {
      name: 'Resolved After Escalation',
      description: 'Thread references GitHub/escalation/patch/update that resolved the issue.',
      text: `Great news that the update resolved this for you! Your report helped our support and development teams work together on a fix. If you'd like to share your experience, a review here would benefit the community: [REVIEW_LINK]\n\nThanks for sticking with us through the process!`,
    },
    E: {
      name: 'Graceful Close (No Review Ask)',
      description: 'Not a good experience — close gracefully without asking for a review.',
      text: `Thanks for reaching out and for your patience while we looked into this. I've [logged this as a feature request / escalated to the development team / shared the details internally], and your feedback is genuinely valuable in shaping future improvements.\n\nIf anything else comes up down the road, don't hesitate to open a new thread. We're always here to help!`,
    },
    F: {
      name: 'Delayed Follow-Up',
      description: 'Thread spans multiple days and resolved — check in before asking for review.',
      text: `Hi [NAME]! Just checking in — is everything still working well after the changes we made? If so, and you'd like to help other store owners who might face something similar, we'd really appreciate a quick review here: [REVIEW_LINK]\n\nIf anything's come up, feel free to let us know and we'll take another look!`,
    },
  };

  // ──────────────────────────────────────────────
  // 3. SYSTEM PROMPT FOR AI ANALYSIS
  // ──────────────────────────────────────────────

  const SYSTEM_PROMPT = `You are a sentiment analysis assistant for WordPress.org plugin support threads. Your job is to analyze a support conversation and determine:

1. Whether the customer had a GOOD, NEUTRAL, or BAD experience.
2. Which response template (A–F) the support agent should use.
3. Key signals that led to your determination.

## Decision Framework

Follow this decision tree strictly:

### Step 1: Was the issue resolved?
- NO → sentiment is "bad". Recommend Template E.

### Step 2: Did the user confirm or accept the solution?
- NO (silence / no response from user — last message is from agent) → sentiment is "bad". Recommend Template E.

### Step 3: What is the user's overall tone?
- POSITIVE → sentiment is "good". Recommend Templates A–D or F.
- NEUTRAL → sentiment is "neutral". Recommend Templates B, C, D, or F (softer options). NEVER recommend Template A for neutral.
- NEGATIVE → sentiment is "bad". Recommend Template E.

## Sentiment Definitions

### GOOD (positive tone):
- User explicitly confirmed the fix works WITH enthusiasm (e.g., "that worked perfectly!", "amazing, fixed!", "you're the best!", "lifesaver!", "thanks so much, all sorted!")
- Strong positive/grateful tone — expressions of relief, excitement, gratitude beyond a simple "thanks"
- Clear resolution with warm closing language

### NEUTRAL (lukewarm tone — grey area):
- User acknowledged the fix but WITHOUT enthusiasm — phrases like "okay," "thanks," "I'll try that," "seems to work," "alright," "got it," "it's working now"
- Short confirmations without elaboration (a bare "thanks" or "okay that works")
- No negative language, but also no strong positive signals
- User accepted a workaround without expressing excitement or dissatisfaction
- Functional acknowledgment — they confirmed it works, but the energy is flat
- IMPORTANT: Neutral is NOT silence. Silence = bad. Neutral means the user responded, but the response is lukewarm.

### BAD (negative tone or unresolved):
- Issue unresolved (e.g., "still not working," "same issue," "no luck," "giving up")
- User was frustrated, angry, or disappointed
- Feature request with no resolution
- User was redirected elsewhere (hosting, theme dev, GitHub issue, out of scope)
- Agent only provided documentation links with no confirmation of resolution
- User mentioned choosing another plugin or solution
- Thread ended in silence (last message from agent, no user response)
- Long thread with no clear confirmation of resolution
- Sarcasm or polite frustration (e.g., "thanks anyway, I'll find another plugin")

## Template Selection

### When sentiment is GOOD:
- **A (Quick Resolution)**: Thread is short (≤3 agent replies), user confirmed, clearly positive tone
- **B (Resolved After Long Thread)**: Thread is longer (4+ agent replies), user confirmed, positive tone
- **C (Workaround Accepted)**: Agent offered a workaround AND user accepted it positively/enthusiastically
- **D (Resolved After Escalation)**: Thread references GitHub, escalation, developer fix, patch, or update resolving the issue
- **F (Delayed Follow-Up)**: Thread spans multiple days AND resolved — suggest alongside primary template

### When sentiment is NEUTRAL (grey area):
- **B (Resolved After Long Thread)**: Long thread, resolved, neutral tone
- **C (Workaround Accepted)**: Workaround accepted, but not enthusiastically
- **D (Resolved After Escalation)**: Escalation resolved, user came back with flat confirmation
- **F (Delayed Follow-Up)**: Solution provided, user confirmed after a delay with lukewarm response
- NEVER suggest Template A for neutral — it's too upbeat for a lukewarm thread
- Template E should always be available as a fallback "skip" option (set as secondaryTemplate)

### When sentiment is BAD:
- Always use **E (Graceful Close)**

## Important Analysis Notes
- Pay close attention to the FINAL messages in the thread — they carry the most weight
- "Thank you" alone (without elaboration) leans NEUTRAL, not positive
- A bare "thanks" or "okay" after a fix is neutral, not good
- Sarcasm and polite frustration should be detected as negative
- If the user says thanks but the issue clearly isn't fixed, that's BAD
- Consider the full arc of the conversation, not just individual phrases
- When in doubt between good and neutral, choose NEUTRAL — it's safer to let the HC decide

## Response Format
You MUST respond with valid JSON only, no markdown formatting, no code blocks. The response must match this exact structure:
{
  "sentiment": "good" | "neutral" | "bad",
  "confidence": 0.0 to 1.0,
  "primaryTemplate": "A" | "B" | "C" | "D" | "E" | "F",
  "secondaryTemplate": null | "E" | "F",
  "signals": [
    { "type": "positive" | "negative" | "neutral" | "info", "text": "description of signal" }
  ],
  "reasoning": "One sentence summary of why you reached this conclusion"
}`;

  // ──────────────────────────────────────────────
  // 4. STYLES
  // ──────────────────────────────────────────────

  GM_addStyle(`
    /* Floating action button */
    #wrh-fab {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 99999;
      background: #23282d;
      color: #fff;
      border: none;
      border-radius: 50px;
      padding: 12px 20px;
      font-size: 14px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, sans-serif;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0,0,0,0.25);
      transition: background 0.2s, transform 0.15s;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    #wrh-fab:hover {
      background: #0073aa;
      transform: translateY(-2px);
    }
    #wrh-fab:active { transform: translateY(0); }

    /* Settings button */
    #wrh-settings-fab {
      position: fixed;
      bottom: 24px;
      right: 350px;
      z-index: 99999;
      background: #50575e;
      color: #fff;
      border: none;
      border-radius: 50px;
      padding: 12px 16px;
      font-size: 14px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, sans-serif;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      transition: background 0.2s, transform 0.15s;
    }
    #wrh-settings-fab:hover {
      background: #0073aa;
      transform: translateY(-2px);
    }

    /* Overlay backdrop */
    #wrh-overlay {
      position: fixed;
      inset: 0;
      z-index: 100000;
      background: rgba(0,0,0,0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      animation: wrh-fadeIn 0.2s ease;
    }
    @keyframes wrh-fadeIn { from { opacity: 0; } to { opacity: 1; } }

    /* Panel */
    #wrh-panel {
      background: #fff;
      border-radius: 12px;
      width: 560px;
      max-width: 92vw;
      max-height: 85vh;
      overflow-y: auto;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, sans-serif;
      animation: wrh-slideUp 0.25s ease;
    }
    @keyframes wrh-slideUp {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* Panel header */
    #wrh-panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 18px 22px;
      border-bottom: 1px solid #e2e4e7;
    }
    #wrh-panel-header h2 {
      margin: 0;
      font-size: 17px;
      font-weight: 600;
      color: #1e1e1e;
    }
    #wrh-close-btn {
      background: none;
      border: none;
      font-size: 22px;
      cursor: pointer;
      color: #757575;
      padding: 4px 8px;
      border-radius: 4px;
      line-height: 1;
    }
    #wrh-close-btn:hover { background: #f0f0f0; color: #1e1e1e; }

    /* Panel body */
    #wrh-panel-body { padding: 22px; }

    /* Sentiment badge */
    .wrh-sentiment {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 10px 16px;
      border-radius: 8px;
      font-size: 15px;
      font-weight: 600;
      margin-bottom: 18px;
    }
    .wrh-sentiment.good { background: #edfcf2; color: #0a7b3e; border: 1px solid #b8e6cc; }
    .wrh-sentiment.bad { background: #fef2f2; color: #b91c1c; border: 1px solid #f5c6c6; }
    .wrh-sentiment.neutral { background: #fffbeb; color: #92400e; border: 1px solid #fde68a; }
    .wrh-sentiment.inconclusive { background: #fffbeb; color: #92400e; border: 1px solid #fde68a; }

    /* Confidence bar */
    .wrh-confidence {
      margin-bottom: 18px;
      font-size: 12px;
      color: #757575;
    }
    .wrh-confidence-bar {
      height: 6px;
      background: #e2e4e7;
      border-radius: 3px;
      margin-top: 4px;
      overflow: hidden;
    }
    .wrh-confidence-fill {
      height: 100%;
      border-radius: 3px;
      transition: width 0.5s ease;
    }
    .wrh-confidence-fill.high { background: #0a7b3e; }
    .wrh-confidence-fill.medium { background: #d97706; }
    .wrh-confidence-fill.low { background: #b91c1c; }

    /* Reasoning */
    .wrh-reasoning {
      background: #f0f6fc;
      border: 1px solid #c8d6e5;
      border-radius: 8px;
      padding: 12px 14px;
      margin-bottom: 18px;
      font-size: 13px;
      color: #1e1e1e;
      line-height: 1.5;
      font-style: italic;
    }

    /* Signals list */
    .wrh-signals {
      margin: 0 0 18px 0;
      padding: 0;
      list-style: none;
    }
    .wrh-signals li {
      padding: 6px 0;
      font-size: 13px;
      color: #3c434a;
      display: flex;
      align-items: flex-start;
      gap: 8px;
      line-height: 1.45;
    }
    .wrh-signals li .wrh-signal-icon { flex-shrink: 0; font-size: 14px; }

    /* Section label */
    .wrh-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      font-weight: 600;
      color: #757575;
      margin-bottom: 8px;
    }

    /* Template card */
    .wrh-template-card {
      background: #f6f7f7;
      border: 1px solid #e2e4e7;
      border-radius: 8px;
      padding: 14px 16px;
      margin-bottom: 14px;
    }
    .wrh-template-card h3 {
      margin: 0 0 4px 0;
      font-size: 14px;
      font-weight: 600;
      color: #1e1e1e;
    }
    .wrh-template-card p {
      margin: 0;
      font-size: 12px;
      color: #757575;
      line-height: 1.4;
    }

    /* Copy button */
    .wrh-copy-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-top: 10px;
      padding: 8px 16px;
      background: #0073aa;
      color: #fff;
      border: none;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.15s;
    }
    .wrh-copy-btn:hover { background: #005a87; }
    .wrh-copy-btn.copied { background: #0a7b3e; }

    /* Grey area guidance box */
    .wrh-grey-guidance {
      background: #fffbeb;
      border: 1px solid #fde68a;
      border-radius: 8px;
      padding: 14px 16px;
      margin-bottom: 18px;
      font-size: 13px;
      color: #92400e;
      line-height: 1.5;
    }
    .wrh-grey-guidance strong { display: block; margin-bottom: 4px; font-size: 14px; }

    /* Skip / graceful close fallback card */
    .wrh-skip-card {
      background: #f6f7f7;
      border: 2px dashed #c3c4c7;
      border-radius: 8px;
      padding: 14px 16px;
      margin-top: 14px;
    }
    .wrh-skip-card h3 {
      margin: 0 0 4px 0;
      font-size: 14px;
      font-weight: 600;
      color: #757575;
    }
    .wrh-skip-card p {
      margin: 0;
      font-size: 12px;
      color: #757575;
      line-height: 1.4;
      font-style: italic;
    }
    .wrh-skip-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-top: 10px;
      padding: 8px 16px;
      background: #757575;
      color: #fff;
      border: none;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.15s;
    }
    .wrh-skip-btn:hover { background: #50575e; }
    .wrh-skip-btn.copied { background: #0a7b3e; }

    /* Stats bar */
    .wrh-stats {
      display: flex;
      gap: 16px;
      margin-bottom: 18px;
      flex-wrap: wrap;
    }
    .wrh-stat {
      font-size: 12px;
      color: #757575;
    }
    .wrh-stat strong { color: #1e1e1e; }

    /* Divider */
    .wrh-divider {
      border: none;
      border-top: 1px solid #e2e4e7;
      margin: 18px 0;
    }

    /* Secondary template suggestion */
    .wrh-secondary {
      opacity: 0.75;
      border-style: dashed;
    }

    /* Settings dialog */
    .wrh-settings-body { padding: 22px; }
    .wrh-settings-body label {
      display: block;
      font-size: 13px;
      font-weight: 600;
      color: #1e1e1e;
      margin-bottom: 6px;
    }
    .wrh-settings-body input[type="password"],
    .wrh-settings-body input[type="text"] {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid #c3c4c7;
      border-radius: 6px;
      font-size: 14px;
      font-family: monospace;
      box-sizing: border-box;
    }
    .wrh-settings-body input:focus {
      border-color: #0073aa;
      outline: none;
      box-shadow: 0 0 0 2px rgba(0,115,170,0.2);
    }
    .wrh-settings-body .wrh-hint {
      font-size: 12px;
      color: #757575;
      margin-top: 6px;
      line-height: 1.4;
    }
    .wrh-save-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-top: 16px;
      padding: 10px 20px;
      background: #0073aa;
      color: #fff;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
    }
    .wrh-save-btn:hover { background: #005a87; }

    /* Powered by badge */
    .wrh-powered-by {
      text-align: center;
      font-size: 11px;
      color: #a0a5aa;
      padding: 12px 0;
      border-top: 1px solid #e2e4e7;
      margin-top: 6px;
    }

    /* Error state */
    .wrh-error {
      background: #fef2f2;
      border: 1px solid #f5c6c6;
      border-radius: 8px;
      padding: 14px 16px;
      color: #b91c1c;
      font-size: 13px;
      line-height: 1.5;
    }
    .wrh-error strong { display: block; margin-bottom: 4px; }

    /* Stats FAB button */
    #wrh-stats-fab {
      position: fixed;
      bottom: 24px;
      right: 290px;
      z-index: 99999;
      background: #50575e;
      color: #fff;
      border: none;
      border-radius: 50px;
      padding: 12px 16px;
      font-size: 14px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, sans-serif;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      transition: background 0.2s, transform 0.15s;
    }
    #wrh-stats-fab:hover {
      background: #0073aa;
      transform: translateY(-2px);
    }

    /* Stats dashboard */
    .wrh-stats-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin-bottom: 18px;
    }
    .wrh-stats-card {
      background: #f6f7f7;
      border: 1px solid #e2e4e7;
      border-radius: 8px;
      padding: 14px;
      text-align: center;
    }
    .wrh-stats-card .wrh-stats-number {
      font-size: 26px;
      font-weight: 700;
      color: #1e1e1e;
      line-height: 1.2;
    }
    .wrh-stats-card .wrh-stats-desc {
      font-size: 11px;
      color: #757575;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      margin-top: 4px;
    }
    .wrh-stats-card.good .wrh-stats-number { color: #0a7b3e; }
    .wrh-stats-card.bad .wrh-stats-number { color: #b91c1c; }
    .wrh-stats-card.warn .wrh-stats-number { color: #92400e; }
    .wrh-stats-card.info .wrh-stats-number { color: #0073aa; }

    /* Sentiment bar chart */
    .wrh-bar-row {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 6px;
      font-size: 12px;
    }
    .wrh-bar-label { width: 90px; text-align: right; color: #3c434a; flex-shrink: 0; }
    .wrh-bar-track { flex: 1; height: 18px; background: #e2e4e7; border-radius: 4px; overflow: hidden; }
    .wrh-bar-fill { height: 100%; border-radius: 4px; transition: width 0.4s ease; }
    .wrh-bar-fill.good { background: #0a7b3e; }
    .wrh-bar-fill.neutral { background: #d97706; }
    .wrh-bar-fill.bad { background: #b91c1c; }
    .wrh-bar-fill.inconclusive { background: #d97706; }
    .wrh-bar-value { width: 36px; font-size: 12px; color: #757575; flex-shrink: 0; }

    /* Stats log table */
    .wrh-log-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      margin-top: 8px;
    }
    .wrh-log-table th {
      text-align: left;
      padding: 6px 8px;
      border-bottom: 2px solid #e2e4e7;
      font-weight: 600;
      color: #757575;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .wrh-log-table td {
      padding: 6px 8px;
      border-bottom: 1px solid #f0f0f0;
      color: #3c434a;
      vertical-align: top;
    }
    .wrh-log-table tr:hover td { background: #f6f7f7; }
    .wrh-log-table a { color: #0073aa; text-decoration: none; }
    .wrh-log-table a:hover { text-decoration: underline; }
    .wrh-log-scroll {
      max-height: 280px;
      overflow-y: auto;
      border: 1px solid #e2e4e7;
      border-radius: 8px;
    }

    /* Stats action buttons */
    .wrh-stats-actions {
      display: flex;
      gap: 10px;
      margin-top: 16px;
    }
    .wrh-stats-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      border: 1px solid #c3c4c7;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      background: #fff;
      color: #1e1e1e;
      transition: background 0.15s, border-color 0.15s;
    }
    .wrh-stats-btn:hover { background: #f0f0f0; border-color: #8c8f94; }
    .wrh-stats-btn.primary { background: #0073aa; color: #fff; border-color: #0073aa; }
    .wrh-stats-btn.primary:hover { background: #005a87; }
    .wrh-stats-btn.danger { color: #b91c1c; border-color: #f5c6c6; }
    .wrh-stats-btn.danger:hover { background: #fef2f2; }
  `);

  // ──────────────────────────────────────────────
  // 5. API KEY MANAGEMENT
  // ──────────────────────────────────────────────

  function getApiKey() {
    return GM_getValue(API_KEY_STORAGE, '');
  }

  function setApiKey(key) {
    GM_setValue(API_KEY_STORAGE, key.trim());
  }

  function showSettingsDialog() {
    const existing = document.getElementById('wrh-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'wrh-overlay';

    const currentKey = getApiKey();
    const maskedKey = currentKey
      ? currentKey.slice(0, 7) + '•'.repeat(20) + currentKey.slice(-4)
      : '';

    overlay.innerHTML = `
      <div id="wrh-panel" style="width: 440px;">
        <div id="wrh-panel-header">
          <h2>⚙️ Review Helper Settings</h2>
          <button id="wrh-close-btn" title="Close">&times;</button>
        </div>
        <div class="wrh-settings-body">
          <label for="wrh-api-key">Groq API Key</label>
          <input type="password" id="wrh-api-key" placeholder="gsk_..." value="${currentKey}" />
          <div class="wrh-hint">
            Your key is stored locally in Tampermonkey and never sent anywhere except Groq's API.
            Get a free key at <a href="https://console.groq.com/keys" target="_blank" style="color: #0073aa;">console.groq.com/keys</a>
          </div>
          ${currentKey ? `<div class="wrh-hint" style="margin-top: 8px;">Current key: <code>${maskedKey}</code></div>` : ''}
          <button class="wrh-save-btn" id="wrh-save-key">💾 Save Key</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Event listeners
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
    overlay.querySelector('#wrh-close-btn').addEventListener('click', () => overlay.remove());

    overlay.querySelector('#wrh-save-key').addEventListener('click', () => {
      const key = overlay.querySelector('#wrh-api-key').value.trim();
      if (!key) {
        alert('Please enter a valid API key.');
        return;
      }
      if (!key.startsWith('gsk_')) {
        alert('Groq API keys start with "gsk_". Please check your key.');
        return;
      }
      setApiKey(key);
      overlay.remove();
      // Show brief confirmation
      const fab = document.getElementById('wrh-fab');
      if (fab) {
        const origText = fab.innerHTML;
        fab.innerHTML = '✅ Key Saved!';
        setTimeout(() => { fab.innerHTML = origText; }, 1500);
      }
    });

    // Escape key
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        overlay.remove();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);
  }

  // Register Tampermonkey menu commands
  GM_registerMenuCommand('⚙️ Set Groq API Key', showSettingsDialog);
  GM_registerMenuCommand('📈 View Analytics Dashboard', () => {
    // Defer to ensure DOM is ready
    if (typeof renderStatsDashboard === 'function') renderStatsDashboard();
  });

  // ──────────────────────────────────────────────
  // 5b. ANALYTICS TRACKING (LOCAL)
  // ──────────────────────────────────────────────

  /**
   * Gets the analytics log from Tampermonkey storage.
   * Returns an array of log entry objects.
   */
  function getAnalyticsLog() {
    try {
      const raw = GM_getValue(ANALYTICS_STORAGE, '[]');
      return JSON.parse(raw);
    } catch (e) {
      console.error('WRH Analytics: Failed to parse log', e);
      return [];
    }
  }

  /**
   * Saves the analytics log to Tampermonkey storage.
   */
  function saveAnalyticsLog(log) {
    GM_setValue(ANALYTICS_STORAGE, JSON.stringify(log));
  }

  /**
   * Adds a new entry to the analytics log.
   * Caps at ANALYTICS_MAX_ENTRIES by removing oldest entries.
   * Returns the entry's ID (index) so it can be updated later (e.g., when template is copied).
   */
  function addLogEntry(entry) {
    const log = getAnalyticsLog();
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const logEntry = {
      id,
      timestamp: new Date().toISOString(),
      threadUrl: window.location.href,
      pluginSlug: entry.pluginSlug || null,
      sentiment: entry.sentiment || 'unknown',
      confidence: entry.confidence || 0,
      recommendedTemplate: entry.recommendedTemplate || null,
      templateCopied: false,
      templateCopiedKey: null,
    };
    log.push(logEntry);

    // Cap at max entries — remove oldest
    while (log.length > ANALYTICS_MAX_ENTRIES) {
      log.shift();
    }

    saveAnalyticsLog(log);
    return id;
  }

  /**
   * Updates an existing log entry (e.g., to mark template as copied).
   */
  function updateLogEntry(id, updates) {
    const log = getAnalyticsLog();
    const idx = log.findIndex(e => e.id === id);
    if (idx !== -1) {
      Object.assign(log[idx], updates);
      saveAnalyticsLog(log);
    }
  }

  /**
   * Clears the entire analytics log.
   */
  function clearAnalyticsLog() {
    saveAnalyticsLog([]);
  }

  /**
   * Exports the analytics log as a CSV string.
   */
  function exportAnalyticsCSV() {
    const log = getAnalyticsLog();
    const headers = ['Timestamp', 'Thread URL', 'Plugin Slug', 'Sentiment', 'Confidence', 'Recommended Template', 'Template Copied', 'Template Copied Key'];
    const rows = log.map(e => [
      e.timestamp,
      e.threadUrl,
      e.pluginSlug || '',
      e.sentiment,
      Math.round((e.confidence || 0) * 100) + '%',
      e.recommendedTemplate || '',
      e.templateCopied ? 'Yes' : 'No',
      e.templateCopiedKey || '',
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));

    return [headers.join(','), ...rows].join('\n');
  }

  /**
   * Computes summary statistics from the analytics log.
   */
  function computeAnalyticsStats() {
    const log = getAnalyticsLog();
    const total = log.length;
    if (total === 0) {
      return { total: 0, good: 0, neutral: 0, bad: 0, inconclusive: 0, copyRate: 0, templateCounts: {}, pluginCounts: {}, recentEntries: [] };
    }

    const good = log.filter(e => e.sentiment === 'good').length;
    const neutral = log.filter(e => e.sentiment === 'neutral').length;
    const bad = log.filter(e => e.sentiment === 'bad').length;
    const inconclusive = log.filter(e => e.sentiment === 'inconclusive').length;
    const copied = log.filter(e => e.templateCopied).length;

    // Template recommendation counts
    const templateCounts = {};
    log.forEach(e => {
      if (e.recommendedTemplate) {
        templateCounts[e.recommendedTemplate] = (templateCounts[e.recommendedTemplate] || 0) + 1;
      }
    });

    // Plugin analysis counts
    const pluginCounts = {};
    log.forEach(e => {
      if (e.pluginSlug) {
        pluginCounts[e.pluginSlug] = (pluginCounts[e.pluginSlug] || 0) + 1;
      }
    });

    // Sort plugins by count descending
    const sortedPlugins = Object.entries(pluginCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    return {
      total,
      good,
      neutral,
      bad,
      inconclusive,
      copyRate: total > 0 ? Math.round((copied / total) * 100) : 0,
      templateCounts,
      pluginCounts: Object.fromEntries(sortedPlugins),
      recentEntries: log.slice(-50).reverse(),
    };
  }

  // ──────────────────────────────────────────────
  // 6. THREAD PARSING
  // ──────────────────────────────────────────────

  /**
   * Parses the support thread into structured data.
   */
  function parseThread() {
    // Get the thread author (original poster)
    const topicAuthorEl = document.querySelector('.bbp-topic-started-by a.bbp-author-link, #bbpress-forums .bb-topic-author a');
    let authorName = '';
    let authorSlug = '';

    if (topicAuthorEl) {
      authorName = topicAuthorEl.textContent.trim();
      const href = topicAuthorEl.getAttribute('href') || '';
      const slugMatch = href.match(/\/users\/([^/]+)/);
      if (slugMatch) authorSlug = slugMatch[1];
    }

    if (!authorName) {
      const firstAuthor = document.querySelector('.bbp-topic-author .bbp-author-name, .topic .bbp-reply-author .bbp-author-name');
      if (firstAuthor) authorName = firstAuthor.textContent.trim();
    }

    // Parse all replies
    const replies = [];
    const replyContainers = document.querySelectorAll('[id^="post-"], .bbp-reply, .topic, .reply');

    if (replyContainers.length > 0) {
      replyContainers.forEach(container => {
        const contentEl = container.querySelector('.bbp-reply-content, .bbp-topic-content, .entry-content');
        const authorEl = container.querySelector('.bbp-author-name, .bbp-author-link');
        const dateEl = container.querySelector('.bbp-reply-post-date, .bbp-topic-post-date, .bbp-meta .date');

        if (contentEl) {
          const replyAuthor = authorEl ? authorEl.textContent.trim() : 'Unknown';
          const replySlugEl = container.querySelector('a.bbp-author-link');
          let replySlug = '';
          if (replySlugEl) {
            const href = replySlugEl.getAttribute('href') || '';
            const m = href.match(/\/users\/([^/]+)/);
            if (m) replySlug = m[1];
          }

          const isOP = authorSlug ? (replySlug === authorSlug) : (replyAuthor === authorName);

          let dateStr = '';
          if (dateEl) dateStr = dateEl.textContent.trim();

          replies.push({
            author: replyAuthor,
            slug: replySlug,
            content: contentEl.textContent.trim(),
            isOP: isOP,
            isAgent: !isOP,
            date: dateStr,
          });
        }
      });
    }

    // Calculate thread span in days
    let threadSpanDays = 0;
    if (replies.length >= 2) {
      const firstDate = extractDate(replies[0].date);
      const lastDate = extractDate(replies[replies.length - 1].date);
      if (firstDate && lastDate) {
        threadSpanDays = Math.round((lastDate - firstDate) / (1000 * 60 * 60 * 24));
      }
    }

    const agentReplies = replies.filter(r => r.isAgent);
    const userReplies = replies.filter(r => r.isOP);

    return {
      author: authorName,
      authorSlug,
      replies,
      agentReplyCount: agentReplies.length,
      userReplyCount: userReplies.length,
      threadSpanDays,
      agentReplies,
      userReplies,
    };
  }

  function extractDate(dateStr) {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) return d;
    const cleaned = dateStr.replace(/ at /i, ' ').replace(/\s+/g, ' ').trim();
    const d2 = new Date(cleaned);
    if (!isNaN(d2.getTime())) return d2;
    return null;
  }

  // ──────────────────────────────────────────────
  // 6b. PLUGIN DETECTION & REVIEW LINK
  // ──────────────────────────────────────────────

  /**
   * Detects the plugin slug from the current WordPress.org support page.
   * Tries multiple strategies: breadcrumbs, sidebar links, and page metadata.
   * Returns the review URL or null if the plugin can't be detected.
   */
  function detectPluginReviewLink() {
    let pluginSlug = null;

    // Strategy 1: Breadcrumb navigation
    // WordPress.org forum pages have breadcrumbs like:
    // Home > Forums > Plugins > Plugin Name > [Topic]
    // The plugin link in the breadcrumb contains /support/plugin/{slug}/
    const breadcrumbLinks = document.querySelectorAll('.bbp-breadcrumb a, .breadcrumb a, nav a');
    for (const link of breadcrumbLinks) {
      const href = link.getAttribute('href') || '';
      const match = href.match(/\/support\/plugin\/([^/]+)/);
      if (match) {
        pluginSlug = match[1];
        break;
      }
    }

    // Strategy 2: Sidebar or page links containing /plugins/{slug}/
    if (!pluginSlug) {
      const allLinks = document.querySelectorAll('a[href*="/plugins/"]');
      for (const link of allLinks) {
        const href = link.getAttribute('href') || '';
        // Match wordpress.org/plugins/{slug}/ but not /plugins/tags/ or /plugins/browse/
        const match = href.match(/wordpress\.org\/plugins\/([a-z0-9-]+)\/?(?:#|$|\?)/);
        if (match && !['tags', 'browse', 'developers', 'about'].includes(match[1])) {
          pluginSlug = match[1];
          break;
        }
      }
    }

    // Strategy 3: Check the forum topic tags/metadata
    if (!pluginSlug) {
      const topicTags = document.querySelectorAll('.bbp-topic-tags a, .topic-tag a');
      for (const tag of topicTags) {
        const href = tag.getAttribute('href') || '';
        const match = href.match(/\/support\/plugin\/([^/]+)/);
        if (match) {
          pluginSlug = match[1];
          break;
        }
      }
    }

    // Strategy 4: Parse from the page URL structure
    // Some forum URLs include the plugin context: /support/topic/xxx/ but the page
    // may reference the plugin in the topic-info section
    if (!pluginSlug) {
      const topicInfo = document.querySelector('.bbp-topic-forum a, .topic-info a');
      if (topicInfo) {
        const href = topicInfo.getAttribute('href') || '';
        const match = href.match(/\/support\/plugin\/([^/]+)/);
        if (match) pluginSlug = match[1];
      }
    }

    // Strategy 5: Look for any link on the page pointing to /support/plugin/{slug}
    if (!pluginSlug) {
      const anyPluginLink = document.querySelector('a[href*="/support/plugin/"]');
      if (anyPluginLink) {
        const href = anyPluginLink.getAttribute('href') || '';
        const match = href.match(/\/support\/plugin\/([^/]+)/);
        if (match) pluginSlug = match[1];
      }
    }

    if (pluginSlug) {
      return {
        slug: pluginSlug,
        reviewUrl: `https://wordpress.org/plugins/${pluginSlug}/#reviews`,
        pluginUrl: `https://wordpress.org/plugins/${pluginSlug}/`,
      };
    }

    return null;
  }

  // ──────────────────────────────────────────────
  // 7. AI ANALYSIS VIA GROQ
  // ──────────────────────────────────────────────

  /**
   * Formats the thread into a readable transcript for the AI.
   */
  function formatThreadForAI(thread) {
    const lines = [];
    lines.push(`THREAD METADATA:`);
    lines.push(`- Original poster: ${thread.author}`);
    lines.push(`- Agent replies: ${thread.agentReplyCount}`);
    lines.push(`- User replies: ${thread.userReplyCount}`);
    lines.push(`- Total posts: ${thread.replies.length}`);
    lines.push(`- Thread span: ${thread.threadSpanDays} days`);
    lines.push('');
    lines.push('CONVERSATION:');
    lines.push('─'.repeat(40));

    thread.replies.forEach((reply, i) => {
      const role = reply.isOP ? `[CUSTOMER — ${reply.author}]` : `[SUPPORT AGENT — ${reply.author}]`;
      lines.push(`\n${role} (${reply.date || 'date unknown'}):`);
      // Truncate extremely long replies to save tokens
      const content = reply.content.length > 2000
        ? reply.content.slice(0, 2000) + '\n[... truncated for length ...]'
        : reply.content;
      lines.push(content);
    });

    return lines.join('\n');
  }

  /**
   * Calls Groq API with the thread data.
   * Groq uses an OpenAI-compatible API format.
   * Returns a promise that resolves with the parsed AI response.
   */
  function callGroq(threadText) {
    const apiKey = getApiKey();

    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'POST',
        url: 'https://api.groq.com/openai/v1/chat/completions',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        data: JSON.stringify({
          model: GROQ_MODEL,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: `Please analyze this WordPress.org support thread and provide your assessment:\n\n${threadText}` },
          ],
          temperature: 0.2, // Low temperature for consistent analysis
          max_tokens: 800,
        }),
        onload: function (response) {
          try {
            const data = JSON.parse(response.responseText);

            if (data.error) {
              reject(new Error(data.error.message || 'Groq API error'));
              return;
            }

            const content = data.choices[0].message.content.trim();

            // Parse the JSON response — handle potential markdown code blocks
            let jsonStr = content;
            if (jsonStr.startsWith('```')) {
              jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
            }

            const result = JSON.parse(jsonStr);
            resolve(result);
          } catch (err) {
            reject(new Error(`Failed to parse AI response: ${err.message}`));
          }
        },
        onerror: function (err) {
          reject(new Error('Network error calling Groq API. Check your connection.'));
        },
        ontimeout: function () {
          reject(new Error('Groq API request timed out. Try again.'));
        },
        timeout: 30000,
      });
    });
  }

  // ──────────────────────────────────────────────
  // 8. UI RENDERING
  // ──────────────────────────────────────────────

  function renderPanel(aiResult, thread, logEntryId) {
    const existing = document.getElementById('wrh-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'wrh-overlay';

    const sentimentMap = {
      good:  { label: '✅ Good Experience — Ask for a Review', css: 'good' },
      neutral: { label: '🤔 Grey Area — Use Your Judgment', css: 'neutral' },
      bad:   { label: '❌ Not a Good Experience — Don\'t Ask', css: 'bad' },
      inconclusive: { label: '⚠️ Inconclusive — Review Manually', css: 'inconclusive' },
    };
    const sentInfo = sentimentMap[aiResult.sentiment] || sentimentMap.inconclusive;
    const sentimentLabel = sentInfo.label;
    const sentimentClass = sentInfo.css;

    const signalIcons = { positive: '✅', negative: '❌', neutral: '⚠️', info: 'ℹ️' };

    // Confidence display
    const confidence = Math.round((aiResult.confidence || 0) * 100);
    const confClass = confidence >= 75 ? 'high' : confidence >= 50 ? 'medium' : 'low';

    // Detect plugin and build review link
    const pluginInfo = detectPluginReviewLink();
    const reviewLink = pluginInfo ? pluginInfo.reviewUrl : '[REVIEW_LINK]';
    const reviewLinkDetected = !!pluginInfo;

    const getTemplateText = (key) => {
      let text = TEMPLATES[key].text;
      if (thread.author) {
        text = text.replace('[NAME]', thread.author);
      }
      text = text.replace('[REVIEW_LINK]', reviewLink);
      return text;
    };

    const isNeutral = aiResult.sentiment === 'neutral';
    const pt = aiResult.primaryTemplate || 'E';
    const st = aiResult.secondaryTemplate || null;

    let secondaryHTML = '';
    if (!isNeutral && st && TEMPLATES[st]) {
      secondaryHTML = `
        <hr class="wrh-divider">
        <div class="wrh-label">ALTERNATIVE TEMPLATE (OPTIONAL)</div>
        <div class="wrh-template-card wrh-secondary">
          <h3>Template ${st} — ${TEMPLATES[st].name}</h3>
          <p>${TEMPLATES[st].description}</p>
          <button class="wrh-copy-btn" data-template="${st}">📋 Copy Template ${st}</button>
        </div>
      `;
    }

    // For neutral: build the skip (Template E) fallback card
    let skipFallbackHTML = '';
    if (isNeutral) {
      skipFallbackHTML = `
        <hr class="wrh-divider">
        <div class="wrh-label">PREFER TO SKIP?</div>
        <div class="wrh-skip-card">
          <h3>Template E — ${TEMPLATES.E.name}</h3>
          <p>Still unsure? Close gracefully instead. No review ask.</p>
          <button class="wrh-skip-btn wrh-copy-btn" data-template="E">📋 Copy Template E (Skip)</button>
        </div>
      `;
    }

    // For neutral: build the grey area guidance box
    let greyGuidanceHTML = '';
    if (isNeutral) {
      greyGuidanceHTML = `
        <div class="wrh-grey-guidance">
          <strong>🤔 This one's your call</strong>
          A solution was provided and accepted, but the tone is lukewarm — not clearly positive or negative.
          Lean toward asking with a softer template below. If something still feels off, skip it and close gracefully.
        </div>
      `;
    }

    const signalsHTML = (aiResult.signals || []).map(s => `
      <li>
        <span class="wrh-signal-icon">${signalIcons[s.type] || 'ℹ️'}</span>
        <span>${s.text}</span>
      </li>
    `).join('');

    overlay.innerHTML = `
      <div id="wrh-panel">
        <div id="wrh-panel-header">
          <h2>📊 Thread Analysis</h2>
          <button id="wrh-close-btn" title="Close">&times;</button>
        </div>
        <div id="wrh-panel-body">
          <div class="wrh-sentiment ${sentimentClass}">${sentimentLabel}</div>

          <div class="wrh-confidence">
            AI Confidence: <strong>${confidence}%</strong>
            <div class="wrh-confidence-bar">
              <div class="wrh-confidence-fill ${confClass}" style="width: ${confidence}%;"></div>
            </div>
          </div>

          <div class="wrh-stats">
            <span class="wrh-stat"><strong>${thread.agentReplyCount}</strong> agent replies</span>
            <span class="wrh-stat"><strong>${thread.userReplyCount}</strong> user replies</span>
            <span class="wrh-stat"><strong>${thread.replies.length}</strong> total posts</span>
            ${thread.threadSpanDays > 0 ? `<span class="wrh-stat"><strong>${thread.threadSpanDays}</strong> day span</span>` : ''}
          </div>

          ${pluginInfo ? `
            <div style="background: #f0f6fc; border: 1px solid #c8d6e5; border-radius: 8px; padding: 10px 14px; margin-bottom: 18px; font-size: 13px; display: flex; align-items: center; gap: 8px;">
              <span>🔗</span>
              <span>Plugin detected: <strong>${pluginInfo.slug}</strong> — review link will be auto-filled in templates</span>
            </div>
          ` : `
            <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 10px 14px; margin-bottom: 18px; font-size: 13px; display: flex; align-items: center; gap: 8px;">
              <span>⚠️</span>
              <span>Could not detect plugin — <code>[REVIEW_LINK]</code> will remain as placeholder. Replace it manually.</span>
            </div>
          `}

          ${greyGuidanceHTML}

          ${aiResult.reasoning ? `
            <div class="wrh-label">AI REASONING</div>
            <div class="wrh-reasoning">${aiResult.reasoning}</div>
          ` : ''}

          <div class="wrh-label">SIGNALS DETECTED</div>
          <ul class="wrh-signals">
            ${signalsHTML}
          </ul>

          <hr class="wrh-divider">

          <div class="wrh-label">${isNeutral ? 'SUGGESTED SOFTER TEMPLATE' : 'RECOMMENDED TEMPLATE'}</div>
          <div class="wrh-template-card">
            <h3>Template ${pt} — ${TEMPLATES[pt] ? TEMPLATES[pt].name : 'Unknown'}</h3>
            <p>${TEMPLATES[pt] ? TEMPLATES[pt].description : ''}</p>
            <button class="wrh-copy-btn" data-template="${pt}">📋 Copy Template ${pt}</button>
          </div>

          ${secondaryHTML}
          ${skipFallbackHTML}

          <div class="wrh-powered-by">
            Powered by Groq (Llama 3.1) · Analysis runs on-demand only
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Event listeners
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
    overlay.querySelector('#wrh-close-btn').addEventListener('click', () => overlay.remove());

    const escHandler = (e) => {
      if (e.key === 'Escape') {
        overlay.remove();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);

    // Copy buttons
    overlay.querySelectorAll('.wrh-copy-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.template;
        const text = getTemplateText(key);

        try {
          if (typeof GM_setClipboard === 'function') {
            GM_setClipboard(text, 'text');
          } else {
            navigator.clipboard.writeText(text);
          }
        } catch (err) {
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          ta.remove();
        }

        // Log template copy in analytics
        if (logEntryId) {
          updateLogEntry(logEntryId, { templateCopied: true, templateCopiedKey: key });
        }

        btn.textContent = '✅ Copied!';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.textContent = `📋 Copy Template ${key}`;
          btn.classList.remove('copied');
        }, 2000);
      });
    });
  }

  // ──────────────────────────────────────────────
  // 8b. STATS DASHBOARD
  // ──────────────────────────────────────────────

  function renderStatsDashboard() {
    const existing = document.getElementById('wrh-overlay');
    if (existing) existing.remove();

    const stats = computeAnalyticsStats();
    const overlay = document.createElement('div');
    overlay.id = 'wrh-overlay';

    // Build sentiment bar chart
    const maxBar = Math.max(stats.good, stats.neutral, stats.bad, stats.inconclusive, 1);
    const barHTML = (label, count, cls) => `
      <div class="wrh-bar-row">
        <span class="wrh-bar-label">${label}</span>
        <div class="wrh-bar-track">
          <div class="wrh-bar-fill ${cls}" style="width: ${Math.round((count / maxBar) * 100)}%;"></div>
        </div>
        <span class="wrh-bar-value">${count}</span>
      </div>
    `;

    // Build template breakdown
    const templateKeys = ['A', 'B', 'C', 'D', 'E', 'F'];
    const templateBreakdownHTML = templateKeys.map(k => {
      const count = stats.templateCounts[k] || 0;
      return count > 0 ? `<span class="wrh-stat"><strong>${count}×</strong> Template ${k}</span>` : '';
    }).filter(Boolean).join('') || '<span class="wrh-stat" style="color: #a0a5aa;">No data yet</span>';

    // Build top plugins
    const pluginEntries = Object.entries(stats.pluginCounts);
    const topPluginsHTML = pluginEntries.length > 0
      ? pluginEntries.map(([slug, count]) =>
          `<span class="wrh-stat"><strong>${count}×</strong> ${slug}</span>`
        ).join('')
      : '<span class="wrh-stat" style="color: #a0a5aa;">No plugins detected yet</span>';

    // Build log table rows
    const logRows = stats.recentEntries.map(e => {
      const date = new Date(e.timestamp);
      const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      const sentimentEmoji = e.sentiment === 'good' ? '✅' : e.sentiment === 'neutral' ? '🤔' : e.sentiment === 'bad' ? '❌' : '⚠️';
      const copyEmoji = e.templateCopied ? '📋' : '—';
      // Extract thread slug from URL for display
      const urlParts = e.threadUrl.split('/');
      const threadSlug = urlParts[urlParts.length - 2] || urlParts[urlParts.length - 1] || 'thread';
      const shortSlug = threadSlug.length > 30 ? threadSlug.slice(0, 27) + '...' : threadSlug;

      return `<tr>
        <td>${dateStr}<br><span style="color: #a0a5aa; font-size: 11px;">${timeStr}</span></td>
        <td><a href="${e.threadUrl}" target="_blank" title="${threadSlug}">${shortSlug}</a></td>
        <td>${e.pluginSlug || '—'}</td>
        <td>${sentimentEmoji}</td>
        <td>${e.recommendedTemplate || '—'}</td>
        <td>${copyEmoji} ${e.templateCopiedKey || ''}</td>
      </tr>`;
    }).join('');

    overlay.innerHTML = `
      <div id="wrh-panel" style="width: 640px;">
        <div id="wrh-panel-header">
          <h2>📈 Analytics Dashboard</h2>
          <button id="wrh-close-btn" title="Close">&times;</button>
        </div>
        <div id="wrh-panel-body">
          ${stats.total === 0 ? `
            <div style="text-align: center; padding: 40px 20px; color: #757575;">
              <div style="font-size: 40px; margin-bottom: 12px;">📊</div>
              <p style="font-size: 15px; margin: 0 0 8px;">No analyses logged yet</p>
              <p style="font-size: 13px; margin: 0;">Click <strong>📊 Analyze Thread</strong> on a support topic to get started.</p>
            </div>
          ` : `
            <div class="wrh-stats-grid">
              <div class="wrh-stats-card info">
                <div class="wrh-stats-number">${stats.total}</div>
                <div class="wrh-stats-desc">Threads Analyzed</div>
              </div>
              <div class="wrh-stats-card good">
                <div class="wrh-stats-number">${stats.copyRate}%</div>
                <div class="wrh-stats-desc">Template Copy Rate</div>
              </div>
              <div class="wrh-stats-card good">
                <div class="wrh-stats-number">${stats.good}</div>
                <div class="wrh-stats-desc">Good Sentiment</div>
              </div>
            </div>

            <div class="wrh-label">SENTIMENT BREAKDOWN</div>
            ${barHTML('Good ✅', stats.good, 'good')}
            ${barHTML('Grey Area 🤔', stats.neutral, 'inconclusive')}
            ${barHTML('Bad ❌', stats.bad, 'bad')}
            ${stats.inconclusive > 0 ? barHTML('Inconclusive ⚠️', stats.inconclusive, 'inconclusive') : ''}

            <hr class="wrh-divider">

            <div class="wrh-label">MOST RECOMMENDED TEMPLATES</div>
            <div class="wrh-stats" style="margin-bottom: 18px;">
              ${templateBreakdownHTML}
            </div>

            <div class="wrh-label">TOP ANALYZED PLUGINS</div>
            <div class="wrh-stats" style="margin-bottom: 18px; flex-wrap: wrap;">
              ${topPluginsHTML}
            </div>

            <hr class="wrh-divider">

            <div class="wrh-label">RECENT ANALYSES (last 50)</div>
            <div class="wrh-log-scroll">
              <table class="wrh-log-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Thread</th>
                    <th>Plugin</th>
                    <th>Result</th>
                    <th>Template</th>
                    <th>Copied</th>
                  </tr>
                </thead>
                <tbody>
                  ${logRows || '<tr><td colspan="6" style="text-align: center; color: #a0a5aa;">No entries</td></tr>'}
                </tbody>
              </table>
            </div>
          `}

          <div class="wrh-stats-actions">
            <button class="wrh-stats-btn primary" id="wrh-export-csv">📥 Export CSV</button>
            <button class="wrh-stats-btn danger" id="wrh-clear-log">🗑️ Clear All Data</button>
          </div>

          <div class="wrh-powered-by">
            Analytics stored locally in Tampermonkey · No data sent externally · Max ${ANALYTICS_MAX_ENTRIES} entries
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Event listeners
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
    overlay.querySelector('#wrh-close-btn').addEventListener('click', () => overlay.remove());

    const escHandler = (e) => {
      if (e.key === 'Escape') {
        overlay.remove();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);

    // Export CSV
    overlay.querySelector('#wrh-export-csv').addEventListener('click', () => {
      const csv = exportAnalyticsCSV();
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `wrh-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      const btn = overlay.querySelector('#wrh-export-csv');
      btn.textContent = '✅ Exported!';
      setTimeout(() => { btn.textContent = '📥 Export CSV'; }, 2000);
    });

    // Clear data
    overlay.querySelector('#wrh-clear-log').addEventListener('click', () => {
      if (confirm('Are you sure you want to clear all analytics data? This cannot be undone.')) {
        clearAnalyticsLog();
        renderStatsDashboard(); // Re-render with empty state
      }
    });
  }

  function renderError(message) {
    const existing = document.getElementById('wrh-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'wrh-overlay';

    overlay.innerHTML = `
      <div id="wrh-panel" style="width: 440px;">
        <div id="wrh-panel-header">
          <h2>📊 Thread Analysis</h2>
          <button id="wrh-close-btn" title="Close">&times;</button>
        </div>
        <div id="wrh-panel-body">
          <div class="wrh-error">
            <strong>Analysis Failed</strong>
            ${message}
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
    overlay.querySelector('#wrh-close-btn').addEventListener('click', () => overlay.remove());
  }

  // ──────────────────────────────────────────────
  // 9. INITIALIZATION
  // ──────────────────────────────────────────────

  function init() {
    // Floating analyze button
    const fab = document.createElement('button');
    fab.id = 'wrh-fab';
    fab.innerHTML = '📊 Analyze Thread';
    fab.title = 'Analyze this support thread for review request readiness';
    document.body.appendChild(fab);

    // Stats button
    const statsBtn = document.createElement('button');
    statsBtn.id = 'wrh-stats-fab';
    statsBtn.innerHTML = '📈';
    statsBtn.title = 'View Analytics Dashboard';
    document.body.appendChild(statsBtn);
    statsBtn.addEventListener('click', renderStatsDashboard);

    // Settings button
    const settingsBtn = document.createElement('button');
    settingsBtn.id = 'wrh-settings-fab';
    settingsBtn.innerHTML = '⚙️';
    settingsBtn.title = 'Review Helper Settings';
    document.body.appendChild(settingsBtn);
    settingsBtn.addEventListener('click', showSettingsDialog);

    // Main analyze flow
    fab.addEventListener('click', async () => {
      // Check for API key first
      const apiKey = getApiKey();
      if (!apiKey) {
        showSettingsDialog();
        return;
      }

      fab.innerHTML = '⏳ Analyzing with AI…';
      fab.disabled = true;

      try {
        // 1. Parse the thread
        const thread = parseThread();

        if (thread.replies.length === 0) {
          renderError('Could not detect any replies in this thread. The page structure may have changed.');
          fab.innerHTML = '📊 Analyze Thread';
          fab.disabled = false;
          return;
        }

        // 2. Format thread for AI
        const threadText = formatThreadForAI(thread);

        // 3. Call Groq AI
        const aiResult = await callGroq(threadText);

        // 4. Log analytics (no PII — just URL, plugin, sentiment, template)
        const pluginInfo = detectPluginReviewLink();
        const logEntryId = addLogEntry({
          pluginSlug: pluginInfo ? pluginInfo.slug : null,
          sentiment: aiResult.sentiment,
          confidence: aiResult.confidence,
          recommendedTemplate: aiResult.primaryTemplate,
        });

        // 5. Render results (pass logEntryId so copy buttons can update it)
        renderPanel(aiResult, thread, logEntryId);

      } catch (err) {
        console.error('WPorg Review Helper Error:', err);

        let errorMsg = err.message;
        if (errorMsg.includes('Incorrect API key')) {
          errorMsg = 'Invalid API key. Click the ⚙️ button to update your key.';
        } else if (errorMsg.includes('quota')) {
          errorMsg = 'Groq API quota exceeded. Check your usage at console.groq.com.';
        } else if (errorMsg.includes('rate limit')) {
          errorMsg = 'Rate limited by Groq. Wait a moment and try again.';
        }

        renderError(errorMsg);
      }

      fab.innerHTML = '📊 Analyze Thread';
      fab.disabled = false;
    });
  }

  init();
})();
