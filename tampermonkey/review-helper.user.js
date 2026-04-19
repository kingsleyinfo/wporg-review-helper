// ==UserScript==
// @name         WPorg Review Helper
// @namespace    https://github.com/Kingsleyinfo/wporg-review-helper
// @updateURL    https://raw.githubusercontent.com/Kingsleyinfo/wporg-review-helper/master/tampermonkey/review-helper.user.js
// @downloadURL  https://raw.githubusercontent.com/Kingsleyinfo/wporg-review-helper/master/tampermonkey/review-helper.user.js
// @version      3.0.2
// @description  Analyzes WordPress.org support threads using AI, drafts personalized review request messages, and recommends templates based on customer sentiment.
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

  const API_KEY_STORAGE = 'wrh_groq_api_key';
  const ANALYTICS_STORAGE = 'wrh_analytics_log';
  const ANALYTICS_MAX_ENTRIES = 1000;

  // ──────────────────────────────────────────────
  // 2. TEMPLATES
  // ──────────────────────────────────────────────

  // Single fallback template — used when sentiment is bad/unresolved (no review ask)
  const FALLBACK_TEMPLATE = {
    name: 'Graceful Close',
    description: 'Close the thread without asking for a review. Use when the issue was not resolved or the merchant is not satisfied.',
    text: `Thanks for reaching out and for your patience while we looked into this! I really appreciate you taking the time to report this — it genuinely helps us improve.\n\nI'll go ahead and mark this thread as resolved for now. If anything changes on your end or you need further assistance down the road, feel free to start a new thread anytime — we're always happy to help!`,
  };

  // ──────────────────────────────────────────────
  // 3. SYSTEM PROMPT FOR AI ANALYSIS
  // ──────────────────────────────────────────────

  const SYSTEM_PROMPT = buildSystemPrompt();

  function buildSystemPrompt() {
    return `You are a sentiment analysis assistant for WordPress.org plugin support threads. Your purpose is to help Happiness Engineers (HCs) decide whether to ask a customer for a plugin review when closing a support thread.

## What This Tool Does

An HC uses this tool when they are about to close a support thread. The tool should:
1. Analyze the customer's experience — was the issue resolved and is the customer satisfied?
2. If YES (good or neutral sentiment): draft a closing message that references the specific support interaction AND clearly asks the customer to leave a plugin review.
3. If NO (bad sentiment / unresolved): indicate that a review request is NOT appropriate. Do NOT draft a review request.

## Sentiment Analysis

### GOOD — Customer is satisfied, safe to ask for a review
- User explicitly confirmed the fix works with enthusiasm ("that worked perfectly!", "amazing!", "lifesaver!", "thanks so much, all sorted!")
- Strong positive/grateful tone beyond a bare "thanks"
- Clear resolution with warm closing language

### NEUTRAL — Customer seems okay, proceed with a softer review ask
- User acknowledged the fix but without enthusiasm ("okay," "thanks," "seems to work," "got it," "it's working now")
- Short confirmations without elaboration
- No negative language, but no strong positive signals either
- IMPORTANT: Neutral is NOT silence. Silence = bad.

### BAD — Do NOT ask for a review
- Issue unresolved ("still not working," "same issue," "giving up")
- User frustrated, angry, or disappointed
- User redirected elsewhere with no resolution
- Thread ended in silence (last message from agent, no user response)
- User went silent after agent's suggestion
- Sarcasm or polite frustration ("thanks anyway, I'll find another plugin")
- If user says "thanks" but issue clearly isn't fixed, that's BAD

## Important Analysis Notes
- The FINAL messages carry the most weight
- "Thank you" alone leans NEUTRAL, not good
- A bare "thanks" or "okay" is neutral, not good
- Consider the full arc, not just individual phrases
- When in doubt between good and neutral, choose NEUTRAL

## Message Drafting (ONLY for good or neutral sentiment)

When sentiment is good or neutral, draft a personalized closing message. This message must:

1. **Reference the specific support interaction** — mention what was discussed, what the issue was, and how it was resolved. Make it feel personal, not generic.
2. **Clearly ask the customer to leave a review** — don't just drop a link. Explicitly ask them to take the action of writing a review. Frame it as: their experience helping other users who might face similar issues.
3. **Include [REVIEW_LINK] as a clickable call to action** — the link should be presented as the place where they can leave their review. Make it clear what happens when they click it.
4. **Match the tone to the sentiment:**
   - Good: warm, enthusiastic, grateful
   - Neutral: softer, appreciative, no pressure
5. **Use [NAME] as a placeholder** for the customer's name.
6. **Be 3-5 sentences.** Natural, warm, specific to the conversation.

### Good Draft Examples

"Hi [NAME]! I'm really glad we were able to sort out that checkout issue by disabling the conflicting plugin. It's great to hear things are running smoothly now! If you have a moment, it would mean a lot to us if you could share your experience by leaving a review here: [REVIEW_LINK] — your feedback helps other store owners who might run into something similar. Thanks again, and don't hesitate to reach out if anything else comes up!"

"Hey [NAME], so happy the shipping calculation fix worked out for you! Since you've had a chance to see how things work with the update, would you consider leaving a quick review about your experience? You can do that right here: [REVIEW_LINK]. It really helps other merchants in the community. We're always here if you need anything!"

### Neutral Draft Examples

"Hi [NAME], glad to hear things are working on your end now. I know it took a bit of back and forth to get the product display sorted, and I appreciate your patience! If you'd be open to it, sharing your experience in a quick review would really help other users who might face something similar: [REVIEW_LINK]. No pressure at all — and feel free to reach out anytime if anything else comes up."

### What NOT to do
- Do NOT just place the link without asking. Wrong: "You can find the review page here: [REVIEW_LINK]"
- Do NOT be demanding. Wrong: "Please leave us a 5-star review."
- Do NOT be generic. Wrong: "Thanks for contacting support! Leave a review here: [REVIEW_LINK]"
- The draft should feel like a real person wrote it, referencing what actually happened in the thread.

## When sentiment is BAD

Do NOT draft a review request message. Set draftedMessage to null. The HC will use a standard graceful close template instead.

## Thread Summary

Provide a one-line summary: what was the issue and how was it resolved (or not).
Example: "User had WooCommerce checkout error, resolved by disabling conflicting plugin."

## Response Format
You MUST respond with valid JSON only. No markdown formatting, no code blocks, no extra text.
{
  "sentiment": "good" | "neutral" | "bad",
  "confidence": 0.0 to 1.0,
  "signals": [
    { "type": "positive" | "negative" | "neutral" | "info", "text": "description of signal" }
  ],
  "reasoning": "One sentence explaining why you reached this conclusion",
  "summary": "One-line thread summary: issue + resolution",
  "draftedMessage": "The personalized closing message with review request (null if bad sentiment)"
}`;
  }

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

    /* v3.0: Draft section (tinted background) */
    .wrh-draft-section {
      background: #f6f8fa;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 18px;
    }
    .wrh-draft-textarea {
      width: 100%;
      min-height: 120px;
      resize: vertical;
      font-size: 14px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, sans-serif;
      padding: 12px;
      border: 1px solid #c3c4c7;
      border-radius: 6px;
      box-sizing: border-box;
      line-height: 1.5;
      color: #1e1e1e;
    }
    .wrh-draft-textarea:focus {
      border-color: #0073aa;
      outline: none;
      box-shadow: 0 0 0 2px rgba(0,115,170,0.2);
    }

    /* v3.0: Placeholder warning */
    .wrh-placeholder-warning {
      font-size: 12px;
      color: #92400e;
      margin-top: 6px;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    /* v3.0: Loading skeleton */
    .wrh-loading {
      text-align: center;
      padding: 40px 20px;
      color: #757575;
    }
    .wrh-loading-text {
      font-size: 15px;
      margin-top: 12px;
      animation: wrh-pulse 1.5s ease-in-out infinite;
    }
    .wrh-loading-spinner {
      font-size: 32px;
    }
    @keyframes wrh-pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }

    /* v3.0: Collapsed draft toggle */
    .wrh-collapsed-draft {
      max-height: 0;
      overflow: hidden;
      opacity: 0;
      transition: max-height 0.3s ease, opacity 0.3s ease;
    }
    .wrh-collapsed-draft.expanded {
      max-height: 400px;
      opacity: 1;
    }
    .wrh-toggle-link {
      background: none;
      border: none;
      color: #0073aa;
      cursor: pointer;
      font-size: 13px;
      padding: 0;
      margin-top: 6px;
      text-decoration: underline;
    }
    .wrh-toggle-link:hover { color: #005a87; }

    /* v3.0: Template fallback copy button (secondary) */
    .wrh-copy-btn.secondary {
      background: #50575e;
    }
    .wrh-copy-btn.secondary:hover { background: #3c434a; }

    /* v3.0: Summary banner */
    .wrh-summary-banner {
      background: #f0f6fc;
      border: 1px solid #c8d6e5;
      border-radius: 8px;
      padding: 10px 14px;
      margin-bottom: 18px;
      font-size: 13px;
      color: #1e1e1e;
      display: flex;
      align-items: flex-start;
      gap: 8px;
      line-height: 1.5;
    }

    /* v3.0: Context length warning */
    .wrh-context-warning {
      background: #fffbeb;
      border: 1px solid #fde68a;
      border-radius: 8px;
      padding: 10px 14px;
      margin-bottom: 12px;
      font-size: 12px;
      color: #92400e;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .wrh-context-warning button {
      background: none;
      border: none;
      color: #92400e;
      cursor: pointer;
      font-size: 16px;
      padding: 0 4px;
      flex-shrink: 0;
    }

    /* Focus styles for accessibility */
    .wrh-copy-btn:focus-visible,
    .wrh-save-btn:focus-visible,
    .wrh-stats-btn:focus-visible,
    .wrh-toggle-link:focus-visible,
    #wrh-close-btn:focus-visible {
      outline: 2px solid #0073aa;
      outline-offset: 2px;
    }

    /* Live region for screen reader announcements */
    .wrh-sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0,0,0,0);
      white-space: nowrap;
      border: 0;
    }
  `);

  // ──────────────────────────────────────────────
  // 5. SHARED UTILITIES & API KEY MANAGEMENT
  // ──────────────────────────────────────────────

  /**
   * Escapes HTML special characters to prevent XSS when rendering
   * AI response fields via innerHTML.
   */
  function escapeHTML(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Sets up standard overlay dismiss behavior: click backdrop, Escape key, close button.
   * @param {HTMLElement} overlay - The overlay element (#wrh-overlay)
   */
  function setupOverlayDismiss(overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
    const closeBtn = overlay.querySelector('#wrh-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => overlay.remove());
    }
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        overlay.remove();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);
  }

  /**
   * Copies text to clipboard with 3-tier fallback:
   * GM_setClipboard → navigator.clipboard → textarea+execCommand
   */
  function copyToClipboard(text) {
    try {
      if (typeof GM_setClipboard === 'function') {
        GM_setClipboard(text, 'text');
        return;
      }
    } catch (err) { /* fall through */ }
    try {
      navigator.clipboard.writeText(text);
      return;
    } catch (err) { /* fall through */ }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }

  function getApiKey() {
    return GM_getValue(API_KEY_STORAGE, '');
  }

  function setApiKey(key) {
    GM_setValue(API_KEY_STORAGE, key.trim());
  }

  function getModel() {
    return GM_getValue('wrh_groq_model', 'llama-3.3-70b-versatile');
  }

  function setModel(model) {
    GM_setValue('wrh_groq_model', model.trim());
  }

  function showSettingsDialog() {
    const existing = document.getElementById('wrh-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'wrh-overlay';

    const currentKey = getApiKey();
    const maskedKey = currentKey
      ? escapeHTML(currentKey.slice(0, 7) + '•'.repeat(20) + currentKey.slice(-4))
      : '';
    const currentModel = getModel();

    overlay.innerHTML = `
      <div id="wrh-panel" style="width: 440px;" role="dialog" aria-modal="true" aria-labelledby="wrh-settings-title">
        <div id="wrh-panel-header">
          <h2 id="wrh-settings-title">⚙️ Review Helper Settings</h2>
          <button id="wrh-close-btn" title="Close">&times;</button>
        </div>
        <div class="wrh-settings-body">
          <label for="wrh-api-key">Groq API Key</label>
          <input type="password" id="wrh-api-key" placeholder="gsk_..." />
          <div class="wrh-hint">
            Your key is stored locally in Tampermonkey and never sent anywhere except Groq's API.
            Get a free key at <a href="https://console.groq.com/keys" target="_blank" style="color: #0073aa;">console.groq.com/keys</a>
          </div>
          ${currentKey ? `<div class="wrh-hint" style="margin-top: 8px;">Current key: <code>${maskedKey}</code></div>` : ''}

          <label for="wrh-model" style="margin-top: 16px;">AI Model</label>
          <select id="wrh-model" style="width: 100%; padding: 10px 12px; border: 1px solid #c3c4c7; border-radius: 6px; font-size: 14px; box-sizing: border-box; background: #fff;">
            <option value="llama-3.3-70b-versatile" ${currentModel === 'llama-3.3-70b-versatile' ? 'selected' : ''}>llama-3.3-70b-versatile (recommended)</option>
            <option value="llama-3.1-8b-instant" ${currentModel === 'llama-3.1-8b-instant' ? 'selected' : ''}>llama-3.1-8b-instant (faster)</option>
            <option value="gemma2-9b-it" ${currentModel === 'gemma2-9b-it' ? 'selected' : ''}>gemma2-9b-it</option>
          </select>
          <div class="wrh-hint">The 70B model writes better drafts. The 8B model is faster but may struggle with long threads.</div>

          <button class="wrh-save-btn" id="wrh-save-key">💾 Save Settings</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Set key value via property (not attribute) to avoid HTML injection
    overlay.querySelector('#wrh-api-key').value = currentKey;

    setupOverlayDismiss(overlay);

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
      setModel(overlay.querySelector('#wrh-model').value);
      overlay.remove();
      // Show brief confirmation
      const fab = document.getElementById('wrh-fab');
      if (fab) {
        const origText = fab.innerHTML;
        fab.innerHTML = '✅ Settings Saved!';
        setTimeout(() => { fab.innerHTML = origText; }, 1500);
      }
    });
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
      priorReviewFound: entry.priorReviewFound != null ? entry.priorReviewFound : null,
      troubleshootingDetected: entry.troubleshootingDetected || false,
      lastReplyIsHC: entry.lastReplyIsHC || false,
      templateCopied: false,
      templateCopiedKey: null,
      // v3.0 fields
      draftGenerated: entry.draftGenerated || false,
      draftCopied: false,
      draftEdited: false,
      templateFallback: false,
      modelUsed: entry.modelUsed || null,
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
    const headers = ['Timestamp', 'Thread URL', 'Plugin Slug', 'Sentiment', 'Confidence', 'Prior Review Found', 'Troubleshooting Detected', 'Last Reply Is HC', 'Draft Generated', 'Draft Copied', 'Draft Edited', 'Used Fallback Close', 'Model Used'];
    const rows = log.map(e => [
      e.timestamp,
      e.threadUrl,
      e.pluginSlug || '',
      e.sentiment,
      Math.round((e.confidence || 0) * 100) + '%',
      e.priorReviewFound === true ? 'Yes' : e.priorReviewFound === false ? 'No' : '',
      e.troubleshootingDetected === undefined ? '' : (e.troubleshootingDetected ? 'Yes' : 'No'),
      e.lastReplyIsHC === undefined ? '' : (e.lastReplyIsHC ? 'Yes' : 'No'),
      e.draftGenerated ? 'Yes' : 'No',
      e.draftCopied ? 'Yes' : 'No',
      e.draftEdited ? 'Yes' : 'No',
      e.templateFallback ? 'Yes' : 'No',
      e.modelUsed || '',
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
      return { total: 0, good: 0, neutral: 0, bad: 0, inconclusive: 0, copyRate: 0, draftRate: 0, draftCopyRate: 0, templateFallbackRate: 0, pluginCounts: {}, recentEntries: [] };
    }

    const good = log.filter(e => e.sentiment === 'good').length;
    const neutral = log.filter(e => e.sentiment === 'neutral').length;
    const bad = log.filter(e => e.sentiment === 'bad').length;
    const inconclusive = log.filter(e => e.sentiment === 'inconclusive').length;
    const copied = log.filter(e => e.templateCopied || e.draftCopied).length;

    // v3.0 draft stats
    const draftGenerated = log.filter(e => e.draftGenerated).length;
    const draftCopied = log.filter(e => e.draftCopied).length;
    const templateFallback = log.filter(e => e.templateFallback).length;

    // (Template counts removed in v3.0 — replaced by draft rate tracking)

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
      draftRate: total > 0 ? Math.round((draftGenerated / total) * 100) : 0,
      draftCopyRate: draftGenerated > 0 ? Math.round((draftCopied / draftGenerated) * 100) : 0,
      templateFallbackRate: total > 0 ? Math.round((templateFallback / total) * 100) : 0,
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
    // Get the thread author (original poster) from the topic-author block.
    // Current WP.org markup: <div class="bbp-topic-author"><a class="bbp-author-link" href="/support/users/<slug>/">...<span class="bbp-author-name">Name</span></a>
    let authorName = '';
    let authorSlug = '';

    const topicAuthorLink = document.querySelector('.bbp-topic-author a.bbp-author-link');
    if (topicAuthorLink) {
      const nameEl = topicAuthorLink.querySelector('.bbp-author-name');
      authorName = (nameEl ? nameEl.textContent : topicAuthorLink.textContent).trim();
      const href = topicAuthorLink.getAttribute('href') || '';
      const slugMatch = href.match(/\/users\/([^/]+)/);
      if (slugMatch) authorSlug = slugMatch[1];
    }

    // Parse all replies. Use post-* IDs only — bbPress wraps each post (topic + replies)
    // in <div id="post-NNNNN">. Selectors like `.topic` / `.reply` also match <body>
    // and sidebar widgets, which produced phantom duplicate entries and inverted role counts.
    const replies = [];
    const replyContainers = document.querySelectorAll('div[id^="post-"]');

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
          const isHC = /\(woo-hc\)/i.test(replyAuthor);

          let dateStr = '';
          if (dateEl) dateStr = dateEl.textContent.trim();

          replies.push({
            author: replyAuthor,
            slug: replySlug,
            content: contentEl.textContent.trim(),
            isOP: isOP,
            isAgent: !isOP,
            isHC: isHC,
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
  // 6b. TROUBLESHOOTING STATUS CHECK
  // ──────────────────────────────────────────────

  function checkTroubleshootingStatus(thread) {
    const replies = thread.replies;
    if (!replies || replies.length === 0) {
      return { isTroubleshooting: false, signals: { lastReplyIsAgent: false, lastReplyIsHC: false, hcName: null, noResolutionLanguage: true } };
    }

    const lastReply = replies[replies.length - 1];
    const lastReplyIsAgent = lastReply.isAgent;
    const lastReplyIsHC = lastReply.isHC || false;
    const hcName = lastReplyIsHC ? lastReply.author : null;

    const resolutionPattern = /\b(fixed|resolved|working now|that worked|works now|all good|sorted|solved|perfect|thanks so much|problem solved|good to go|up and running|back to normal|that did it|works great|works perfectly|working perfectly|working great|working fine|works fine)\b/i;
    const opReplies = replies.filter(r => r.isOP);
    const noResolutionLanguage = !opReplies.some(r => resolutionPattern.test(r.content));

    const isTroubleshooting = lastReplyIsAgent && noResolutionLanguage;

    return {
      isTroubleshooting,
      signals: { lastReplyIsAgent, lastReplyIsHC, hcName, noResolutionLanguage },
    };
  }

  // ──────────────────────────────────────────────
  // 6c. PLUGIN DETECTION & REVIEW LINK
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
        reviewUrl: `https://wordpress.org/support/plugin/${pluginSlug}/reviews/#new-post`,
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
  /**
   * Attempts to extract key fields from a malformed AI response via regex.
   * Returns a partial result with draftAvailable = false so the HC still
   * gets sentiment + template fallback instead of a total failure.
   */
  function partialJsonRecovery(raw) {
    const sentimentMatch = raw.match(/"sentiment"\s*:\s*"(good|neutral|bad|inconclusive)"/i);
    const confidenceMatch = raw.match(/"confidence"\s*:\s*([\d.]+)/);
    const reasoningMatch = raw.match(/"reasoning"\s*:\s*"([^"]{1,500})"/);
    // Summary and draftedMessage may contain escaped quotes; match lazily up to the next
    // unescaped quote followed by a comma/brace boundary. Null literals are also allowed.
    const summaryMatch = raw.match(/"summary"\s*:\s*(?:"((?:\\.|[^"\\])*)"|null)/);
    const draftMatch = raw.match(/"draftedMessage"\s*:\s*(?:"((?:\\.|[^"\\])*)"|null)/);

    if (!sentimentMatch) return null; // Can't recover without sentiment

    const unescape = s => s ? s.replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\\\/g, '\\') : null;
    const summary = summaryMatch && summaryMatch[1] ? unescape(summaryMatch[1]) : null;
    const draft = draftMatch && draftMatch[1] ? unescape(draftMatch[1]) : null;

    return {
      sentiment: sentimentMatch[1].toLowerCase(),
      confidence: confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.5,
      reasoning: reasoningMatch ? reasoningMatch[1] : 'Partial recovery — AI response was malformed.',
      signals: [],
      summary,
      draftedMessage: draft,
      draftAvailable: !!(draft && draft.trim().length > 0),
      partialRecovery: true,
    };
  }

  function callGroq(threadText) {
    const apiKey = getApiKey();
    const model = getModel();

    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'POST',
        url: 'https://api.groq.com/openai/v1/chat/completions',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        data: JSON.stringify({
          model: model,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: `Please analyze this WordPress.org support thread and provide your assessment:\n\n${threadText}` },
          ],
          temperature: 0.2,
          max_tokens: 1200,
          // Force the model to emit valid JSON (OpenAI-compatible JSON mode, supported
          // by Groq on Llama 3.x). Without this, draftedMessage strings with embedded
          // newlines, em-dashes, or quotes routinely broke JSON.parse and the UI
          // had to fall back to partial recovery (sentiment only).
          response_format: { type: 'json_object' },
        }),
        onload: function (response) {
          try {
            const data = JSON.parse(response.responseText);

            if (data.error) {
              // Detect rate limiting specifically
              if (response.status === 429 || (data.error.message && /rate.?limit/i.test(data.error.message))) {
                reject(new Error('Rate limited by Groq. Wait a moment and try again.'));
                return;
              }
              reject(new Error(data.error.message || 'Groq API error'));
              return;
            }

            const content = data.choices[0].message.content.trim();

            // Strip markdown code fences if present
            let jsonStr = content;
            if (jsonStr.startsWith('```')) {
              jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
            }

            let result;
            try {
              result = JSON.parse(jsonStr);
            } catch (parseErr) {
              // Partial JSON recovery — extract what we can via regex
              console.warn('WRH: JSON parse failed, attempting partial recovery:', parseErr.message);
              const recovered = partialJsonRecovery(content);
              if (recovered) {
                console.info('WRH: Partial recovery succeeded — sentiment:', recovered.sentiment);
                resolve(recovered);
                return;
              }
              reject(new Error(`Failed to parse AI response: ${parseErr.message}`));
              return;
            }

            // Normalize new fields
            result.summary = result.summary || null;
            result.draftedMessage = result.draftedMessage || null;
            result.draftAvailable = !!(result.draftedMessage && result.draftedMessage.trim().length > 0);
            result.partialRecovery = false;
            result.modelUsed = model;

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
  // 7b. PRIOR REVIEW CHECK
  // ──────────────────────────────────────────────

  /**
   * Checks if the given user has already left a review for the given plugin.
   * Fetches the plugin's reviews pages on wordpress.org and searches for the
   * author's username slug in reviewer links.
   *
   * Same-origin request (script runs on wordpress.org) — no extra @connect needed.
   * Caps at maxPages to avoid hammering the server for popular plugins.
   *
   * @param {string} pluginSlug - The plugin slug (e.g., 'woocommerce')
   * @param {string} authorSlug - The thread author's username slug (e.g., 'johndoe42')
   * @returns {Promise<{found: boolean, pagesFetched: number, totalPages: number, reviewUrl?: string, error?: string}>}
   */
  async function checkExistingReview(pluginSlug, authorSlug) {
    if (!pluginSlug || !authorSlug) {
      return { found: false, error: 'missing-data', pagesFetched: 0, totalPages: 0 };
    }

    const baseUrl = `https://wordpress.org/plugins/${pluginSlug}/reviews/`;
    const maxPages = 10;
    let totalPages = 1;
    const normalizedAuthor = authorSlug.toLowerCase();

    for (let page = 1; page <= Math.min(totalPages, maxPages); page++) {
      const url = page === 1 ? baseUrl : `${baseUrl}page/${page}/`;

      try {
        const response = await fetch(url);

        if (!response.ok) {
          // 404 on first page means no reviews exist yet — user definitely hasn't reviewed
          if (response.status === 404 && page === 1) {
            return { found: false, pagesFetched: 0, totalPages: 0 };
          }
          continue;
        }

        const html = await response.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');

        // Search for reviewer links matching the author slug
        // WordPress.org reviews link to profiles.wordpress.org/{username}/ or /support/users/{username}/
        const reviewerLinks = doc.querySelectorAll(
          'a[href*="profiles.wordpress.org"], a[href*="/support/users/"]'
        );

        for (const link of reviewerLinks) {
          const href = link.getAttribute('href') || '';
          const match =
            href.match(/profiles\.wordpress\.org\/([^/]+)/) ||
            href.match(/\/support\/users\/([^/]+)/);
          if (match && match[1].toLowerCase() === normalizedAuthor) {
            return { found: true, pagesFetched: page, totalPages, reviewUrl: url };
          }
        }

        // On the first page, detect total number of review pages from pagination links
        if (page === 1) {
          const allLinks = doc.querySelectorAll('a');
          for (const pl of allLinks) {
            const href = pl.getAttribute('href') || '';
            const pageMatch = href.match(/\/reviews\/page\/(\d+)/);
            if (pageMatch) {
              const num = parseInt(pageMatch[1], 10);
              if (num > totalPages) totalPages = num;
            }
          }
        }
      } catch (err) {
        console.error(`WRH: Error fetching reviews page ${page}:`, err);
        // If even the first page fails, bail out gracefully
        if (page === 1) {
          return { found: false, error: 'fetch-failed', pagesFetched: 0, totalPages: 0 };
        }
      }
    }

    return {
      found: false,
      pagesFetched: Math.min(totalPages, maxPages),
      totalPages,
    };
  }

  // ──────────────────────────────────────────────
  // 8. UI RENDERING
  // ──────────────────────────────────────────────

  function renderPanel(aiResult, thread, logEntryId, reviewCheck, troubleshootingCheck) {
    const existing = document.getElementById('wrh-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'wrh-overlay';

    const sentimentMap = {
      good:  { label: '✅ Good Experience — Review Request Drafted', css: 'good' },
      neutral: { label: '🤔 Grey Area — Softer Review Request Drafted', css: 'neutral' },
      bad:   { label: '❌ Not Satisfied — Close Without Review Ask', css: 'bad' },
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

    // Substitute placeholders in draft text
    const substitutePlaceholders = (text) => {
      let out = text;
      if (thread.author) out = out.replace(/\[NAME\]/g, thread.author);
      out = out.replace(/\[REVIEW_LINK\]/g, reviewLink);
      return out;
    };

    const isBad = aiResult.sentiment === 'bad' || aiResult.sentiment === 'inconclusive';
    const priorReviewFound = reviewCheck && reviewCheck.found;
    const modelName = aiResult.modelUsed || getModel();

    // ── 1. Summary banner ──
    let summaryHTML = '';
    if (aiResult.summary) {
      summaryHTML = `
        <div class="wrh-summary-banner">
          <span aria-hidden="true">📝</span>
          <span>${escapeHTML(aiResult.summary)}</span>
        </div>
      `;
    }

    // ── 2. Plugin + review check banners ──
    let pluginBannerHTML = '';
    if (pluginInfo) {
      pluginBannerHTML = `
        <div style="background: #f0f6fc; border: 1px solid #c8d6e5; border-radius: 8px; padding: 10px 14px; margin-bottom: 18px; font-size: 13px; display: flex; align-items: center; gap: 8px;">
          <span aria-hidden="true">🔗</span>
          <span>Plugin: <strong>${escapeHTML(pluginInfo.slug)}</strong></span>
        </div>
      `;
    } else {
      pluginBannerHTML = `
        <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 10px 14px; margin-bottom: 18px; font-size: 13px; display: flex; align-items: center; gap: 8px;">
          <span aria-hidden="true">⚠️</span>
          <span>Could not detect plugin — <code>[REVIEW_LINK]</code> will remain as placeholder. Replace it manually.</span>
        </div>
      `;
    }

    let reviewCheckHTML = '';
    if (priorReviewFound) {
      reviewCheckHTML = `
        <div style="background: #fef2f2; border: 1px solid #f5c6c6; border-radius: 8px; padding: 10px 14px; margin-bottom: 18px; font-size: 13px; display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 16px;" aria-hidden="true">⚠️</span>
          <span><strong>This user has already reviewed ${escapeHTML(pluginInfo ? pluginInfo.slug : 'this plugin')}.</strong> Use the graceful close template below instead.</span>
        </div>
      `;
    } else if (reviewCheck && !reviewCheck.found && !reviewCheck.error) {
      const disclaimer = reviewCheck.totalPages > reviewCheck.pagesFetched
        ? ` (checked ${reviewCheck.pagesFetched} of ${reviewCheck.totalPages} review pages)`
        : '';
      reviewCheckHTML = `
        <div style="background: #edfcf2; border: 1px solid #b8e6cc; border-radius: 8px; padding: 10px 14px; margin-bottom: 18px; font-size: 13px; display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 16px;" aria-hidden="true">✅</span>
          <span>No existing review found${disclaimer} — safe to ask.</span>
        </div>
      `;
    }

    // ── 3. Troubleshooting banner ──
    let troubleshootingHTML = '';
    if (troubleshootingCheck && troubleshootingCheck.isTroubleshooting && aiResult.sentiment !== 'good' && !priorReviewFound) {
      const lastResponder = troubleshootingCheck.signals.lastReplyIsHC
        ? escapeHTML(troubleshootingCheck.signals.hcName)
        : 'a support agent';
      troubleshootingHTML = `
        <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 10px 14px; margin-bottom: 18px; font-size: 13px; display: flex; align-items: flex-start; gap: 8px;">
          <span style="font-size: 16px; flex-shrink: 0;" aria-hidden="true">🔧</span>
          <div>
            <strong>Thread may still be in progress.</strong> The last reply is from ${lastResponder} and no resolution has been confirmed yet. Consider waiting for a response before closing.
          </div>
        </div>
      `;
    }

    // ── 4. AI-drafted message section (good/neutral only) ──
    let draftSectionHTML = '';
    const draftText = aiResult.draftAvailable ? substitutePlaceholders(aiResult.draftedMessage) : '';
    const showDraft = aiResult.draftAvailable && !isBad && !priorReviewFound;

    if (showDraft) {
      // Check for unresolved placeholders
      const hasPlaceholders = /\[REVIEW_LINK\]|\[NAME\]/.test(draftText);
      const placeholderWarning = hasPlaceholders
        ? `<div class="wrh-placeholder-warning">⚠️ Draft contains placeholder text. Replace before posting.</div>`
        : '';

      draftSectionHTML = `
        <div class="wrh-draft-section">
          <div class="wrh-label">✍️ AI-DRAFTED REVIEW REQUEST</div>
          <textarea class="wrh-draft-textarea" id="wrh-draft-textarea" rows="6"
            aria-label="AI-drafted review request message">${escapeHTML(draftText)}</textarea>
          ${placeholderWarning}
          <button class="wrh-copy-btn" id="wrh-copy-draft" aria-label="Copy draft message to clipboard">📋 Copy Draft</button>
        </div>
      `;
    } else if (aiResult.draftAvailable && priorReviewFound) {
      // Draft exists but prior review found — collapsed toggle
      const hasPlaceholders = /\[REVIEW_LINK\]|\[NAME\]/.test(draftText);
      const placeholderWarning = hasPlaceholders
        ? `<div class="wrh-placeholder-warning">⚠️ Draft contains placeholder text. Replace before posting.</div>`
        : '';

      draftSectionHTML = `
        <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 10px 14px; margin-bottom: 18px; font-size: 13px; display: flex; align-items: center; gap: 8px;">
          <span aria-hidden="true">⚠️</span>
          <span>AI draft generated, but this user already reviewed. <a href="#" class="wrh-toggle-link" id="wrh-toggle-draft">Show draft anyway ▸</a></span>
        </div>
        <div class="wrh-collapsed-draft" id="wrh-collapsed-draft">
          <div class="wrh-draft-section">
            <div class="wrh-label">✍️ AI-DRAFTED REVIEW REQUEST</div>
            <textarea class="wrh-draft-textarea" id="wrh-draft-textarea" rows="6"
              aria-label="AI-drafted review request message">${escapeHTML(draftText)}</textarea>
            ${placeholderWarning}
            <button class="wrh-copy-btn" id="wrh-copy-draft" aria-label="Copy draft message to clipboard">📋 Copy Draft</button>
          </div>
        </div>
      `;
    }

    // ── 5. Bad sentiment / no draft — show graceful close template ──
    let fallbackTemplateHTML = '';
    if (isBad || priorReviewFound) {
      const fallbackText = substitutePlaceholders(FALLBACK_TEMPLATE.text);
      const actionLabel = isBad
        ? 'The customer does not appear satisfied. Close gracefully without asking for a review.'
        : 'This user already reviewed — close gracefully without asking again.';

      fallbackTemplateHTML = `
        <div style="background: #fef2f2; border: 1px solid #f5c6c6; border-radius: 8px; padding: 10px 14px; margin-bottom: 18px; font-size: 13px; display: flex; align-items: flex-start; gap: 8px;">
          <span style="font-size: 16px;" aria-hidden="true">🚫</span>
          <span>${escapeHTML(actionLabel)}</span>
        </div>
        <div class="wrh-draft-section">
          <div class="wrh-label">📋 GRACEFUL CLOSE TEMPLATE</div>
          <textarea class="wrh-draft-textarea" id="wrh-fallback-textarea" rows="6"
            aria-label="Graceful close template">${escapeHTML(fallbackText)}</textarea>
          <button class="wrh-copy-btn" id="wrh-copy-fallback" aria-label="Copy graceful close template to clipboard">📋 Copy Close Template</button>
        </div>
      `;
    }

    // ── 6. Grey area guidance (neutral sentiment) ──
    let greyGuidanceHTML = '';
    if (aiResult.sentiment === 'neutral' && !priorReviewFound) {
      greyGuidanceHTML = `
        <div class="wrh-grey-guidance">
          <strong>🤔 This one's your call</strong>
          The tone is lukewarm — not clearly positive or negative. The AI drafted a softer review request above. If something still feels off, you can close gracefully instead.
        </div>
      `;
    }

    // ── 7. Reasoning + signals (escaped) ──
    const reasoningHTML = aiResult.reasoning ? `
      <div class="wrh-label">💡 AI REASONING</div>
      <div class="wrh-reasoning">${escapeHTML(aiResult.reasoning)}</div>
    ` : '';

    const signalsHTML = (aiResult.signals || []).map(s => `
      <li>
        <span class="wrh-signal-icon" aria-hidden="true">${signalIcons[s.type] || 'ℹ️'}</span>
        <span>${escapeHTML(s.text)}</span>
      </li>
    `).join('');

    // ── 8. Partial recovery warning ──
    let partialRecoveryHTML = '';
    if (aiResult.partialRecovery) {
      partialRecoveryHTML = `
        <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 10px 14px; margin-bottom: 18px; font-size: 13px; display: flex; align-items: center; gap: 8px;">
          <span aria-hidden="true">⚠️</span>
          <span>AI returned a malformed response. Sentiment was recovered, but the draft and summary are unavailable.</span>
        </div>
      `;
    }

    // ── Assemble panel ──
    overlay.innerHTML = `
      <div id="wrh-panel" role="dialog" aria-modal="true" aria-labelledby="wrh-panel-title">
        <div id="wrh-panel-header">
          <h2 id="wrh-panel-title">📊 Thread Analysis</h2>
          <button id="wrh-close-btn" title="Close" aria-label="Close panel">&times;</button>
        </div>
        <div id="wrh-panel-body" aria-busy="false">
          <div class="wrh-sentiment ${sentimentClass}">${sentimentLabel}</div>

          <div class="wrh-confidence">
            AI Confidence: <strong>${confidence}%</strong>
            <div class="wrh-confidence-bar" role="progressbar" aria-valuenow="${confidence}" aria-valuemin="0" aria-valuemax="100">
              <div class="wrh-confidence-fill ${confClass}" style="width: ${confidence}%;"></div>
            </div>
          </div>

          <div class="wrh-stats">
            <span class="wrh-stat"><strong>${thread.agentReplyCount}</strong> agent</span>
            <span class="wrh-stat"><strong>${thread.userReplyCount}</strong> user</span>
            <span class="wrh-stat"><strong>${thread.replies.length}</strong> total</span>
            ${thread.threadSpanDays > 0 ? `<span class="wrh-stat"><strong>${thread.threadSpanDays}</strong> day</span>` : ''}
          </div>

          ${summaryHTML}
          ${pluginBannerHTML}
          ${reviewCheckHTML}
          ${troubleshootingHTML}
          ${partialRecoveryHTML}
          ${greyGuidanceHTML}

          ${draftSectionHTML}
          ${fallbackTemplateHTML}

          ${reasoningHTML}

          ${signalsHTML.length > 0 ? `
            <div class="wrh-label">SIGNALS DETECTED</div>
            <ul class="wrh-signals">${signalsHTML}</ul>
          ` : ''}

          <div class="wrh-powered-by">
            Powered by Groq (${escapeHTML(modelName)}) · Analysis runs on-demand only
          </div>
        </div>
      </div>
      <div class="wrh-sr-only" aria-live="polite" id="wrh-live-region"></div>
    `;

    document.body.appendChild(overlay);

    // ── Event listeners ──
    setupOverlayDismiss(overlay);

    // Focus trap: move focus to close button on open
    const closeBtn = overlay.querySelector('#wrh-close-btn');
    if (closeBtn) closeBtn.focus();

    // Collapsed draft toggle (prior review case)
    const toggleLink = overlay.querySelector('#wrh-toggle-draft');
    const collapsedDraft = overlay.querySelector('#wrh-collapsed-draft');
    if (toggleLink && collapsedDraft) {
      toggleLink.addEventListener('click', (e) => {
        e.preventDefault();
        collapsedDraft.classList.toggle('expanded');
        toggleLink.textContent = collapsedDraft.classList.contains('expanded')
          ? 'Hide draft ▾'
          : 'Show draft anyway ▸';
      });
    }

    // Store original draft text for draftEdited detection
    const originalDraft = draftText;

    // Copy Draft button
    const copyDraftBtn = overlay.querySelector('#wrh-copy-draft');
    if (copyDraftBtn) {
      copyDraftBtn.addEventListener('click', () => {
        const textarea = overlay.querySelector('#wrh-draft-textarea');
        const currentText = textarea ? textarea.value : originalDraft;
        copyToClipboard(currentText);

        const wasEdited = currentText.trim() !== originalDraft.trim();

        if (logEntryId) {
          updateLogEntry(logEntryId, {
            draftCopied: true,
            draftEdited: wasEdited,
            templateFallback: false,
          });
        }

        copyDraftBtn.textContent = '✅ Copied!';
        copyDraftBtn.classList.add('copied');
        const liveRegion = overlay.querySelector('#wrh-live-region');
        if (liveRegion) liveRegion.textContent = 'Draft copied to clipboard';
        setTimeout(() => {
          copyDraftBtn.textContent = '📋 Copy Draft';
          copyDraftBtn.classList.remove('copied');
        }, 2000);
      });
    }

    // Copy Fallback template button
    const copyFallbackBtn = overlay.querySelector('#wrh-copy-fallback');
    if (copyFallbackBtn) {
      copyFallbackBtn.addEventListener('click', () => {
        const textarea = overlay.querySelector('#wrh-fallback-textarea');
        const currentText = textarea ? textarea.value : substitutePlaceholders(FALLBACK_TEMPLATE.text);
        copyToClipboard(currentText);

        if (logEntryId) {
          updateLogEntry(logEntryId, {
            templateCopied: true,
            templateCopiedKey: 'graceful-close',
            templateFallback: true,
          });
        }

        copyFallbackBtn.textContent = '✅ Copied!';
        copyFallbackBtn.classList.add('copied');
        const liveRegion = overlay.querySelector('#wrh-live-region');
        if (liveRegion) liveRegion.textContent = 'Close template copied to clipboard';
        setTimeout(() => {
          copyFallbackBtn.textContent = '📋 Copy Close Template';
          copyFallbackBtn.classList.remove('copied');
        }, 2000);
      });
    }
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
      const actionEmoji = e.draftCopied ? '✍️' : e.templateFallback ? '📋' : '—';
      const urlParts = e.threadUrl.split('/');
      const threadSlug = urlParts[urlParts.length - 2] || urlParts[urlParts.length - 1] || 'thread';
      const shortSlug = threadSlug.length > 30 ? threadSlug.slice(0, 27) + '...' : threadSlug;

      return `<tr>
        <td>${dateStr}<br><span style="color: #a0a5aa; font-size: 11px;">${timeStr}</span></td>
        <td><a href="${e.threadUrl}" target="_blank" title="${threadSlug}">${shortSlug}</a></td>
        <td>${e.pluginSlug || '—'}</td>
        <td>${sentimentEmoji}</td>
        <td>${actionEmoji}</td>
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
                <div class="wrh-stats-desc">Copy Rate</div>
              </div>
              <div class="wrh-stats-card good">
                <div class="wrh-stats-number">${stats.good}</div>
                <div class="wrh-stats-desc">Good Sentiment</div>
              </div>
            </div>

            <div class="wrh-label">AI DRAFT RATE</div>
            <div class="wrh-stats" style="margin-bottom: 18px;">
              <span class="wrh-stat"><strong>${stats.draftRate}%</strong> AI draft</span>
              <span class="wrh-stat"><strong>${stats.templateFallbackRate}%</strong> template fallback</span>
              <span class="wrh-stat"><strong>${stats.draftCopyRate}%</strong> drafts copied</span>
            </div>

            <div class="wrh-label">SENTIMENT BREAKDOWN</div>
            ${barHTML('Good ✅', stats.good, 'good')}
            ${barHTML('Grey Area 🤔', stats.neutral, 'inconclusive')}
            ${barHTML('Bad ❌', stats.bad, 'bad')}
            ${stats.inconclusive > 0 ? barHTML('Inconclusive ⚠️', stats.inconclusive, 'inconclusive') : ''}

            <hr class="wrh-divider">

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
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  ${logRows || '<tr><td colspan="5" style="text-align: center; color: #a0a5aa;">No entries</td></tr>'}
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
    setupOverlayDismiss(overlay);

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
      <div id="wrh-panel" style="width: 440px;" role="dialog" aria-modal="true" aria-labelledby="wrh-error-title">
        <div id="wrh-panel-header">
          <h2 id="wrh-error-title">📊 Thread Analysis</h2>
          <button id="wrh-close-btn" title="Close" aria-label="Close panel">&times;</button>
        </div>
        <div id="wrh-panel-body">
          <div class="wrh-error">
            <strong>Analysis Failed</strong>
            ${escapeHTML(message)}
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    setupOverlayDismiss(overlay);
  }

  // ──────────────────────────────────────────────
  // 9. INITIALIZATION
  // ──────────────────────────────────────────────

  /**
   * Shows a loading skeleton in the panel while the API call is in progress.
   */
  function showLoadingPanel() {
    const existing = document.getElementById('wrh-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'wrh-overlay';

    overlay.innerHTML = `
      <div id="wrh-panel" role="dialog" aria-modal="true" aria-labelledby="wrh-loading-title">
        <div id="wrh-panel-header">
          <h2 id="wrh-loading-title">📊 Thread Analysis</h2>
          <button id="wrh-close-btn" title="Close" aria-label="Close panel">&times;</button>
        </div>
        <div id="wrh-panel-body" aria-busy="true">
          <div class="wrh-loading">
            <div class="wrh-loading-spinner"></div>
            <div class="wrh-loading-text">Analyzing thread... this takes 5–15 seconds</div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    setupOverlayDismiss(overlay);
    return overlay;
  }

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

      // Prevent duplicate overlays on rapid clicks
      if (fab.disabled) return;
      fab.innerHTML = '⏳ Analyzing…';
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

        // 2. Open loading skeleton immediately
        const loadingOverlay = showLoadingPanel();

        // 3. Format thread for AI + check troubleshooting status (local, synchronous)
        const threadText = formatThreadForAI(thread);
        const troubleshootingCheck = checkTroubleshootingStatus(thread);

        // 4. Context-length warning for 8B model on long threads
        const estimatedTokens = Math.ceil(threadText.length / 4);
        const currentModel = getModel();
        if (estimatedTokens > 6000 && currentModel === 'llama-3.1-8b-instant') {
          // Inject a dismissible tip into the loading panel
          const panelBody = loadingOverlay.querySelector('#wrh-panel-body');
          if (panelBody) {
            const warning = document.createElement('div');
            warning.className = 'wrh-context-warning';
            warning.innerHTML = `
              <span>💡 This is a long thread (~${Math.round(estimatedTokens / 1000)}K tokens). The 70B model may produce better results. Change in ⚙️ Settings.</span>
              <button aria-label="Dismiss warning" onclick="this.parentElement.remove()">×</button>
            `;
            panelBody.insertBefore(warning, panelBody.firstChild);
          }
        }

        // 5. Detect plugin info (used for review link + prior review check)
        const pluginInfo = detectPluginReviewLink();

        // 6. Run AI analysis and prior review check in parallel
        const reviewCheckPromise = (pluginInfo && thread.authorSlug)
          ? checkExistingReview(pluginInfo.slug, thread.authorSlug)
          : Promise.resolve(null);

        const [aiResult, reviewCheck] = await Promise.all([
          callGroq(threadText),
          reviewCheckPromise,
        ]);

        // 7. Log analytics (no PII — just URL, plugin, sentiment)
        const logEntryId = addLogEntry({
          pluginSlug: pluginInfo ? pluginInfo.slug : null,
          sentiment: aiResult.sentiment,
          confidence: aiResult.confidence,
          priorReviewFound: reviewCheck ? reviewCheck.found : null,
          troubleshootingDetected: troubleshootingCheck.isTroubleshooting,
          lastReplyIsHC: troubleshootingCheck.signals.lastReplyIsHC,
          draftGenerated: aiResult.draftAvailable || false,
          modelUsed: aiResult.modelUsed || currentModel,
        });

        // 9. Replace loading skeleton with results
        renderPanel(aiResult, thread, logEntryId, reviewCheck, troubleshootingCheck);

      } catch (err) {
        console.error('WPorg Review Helper Error:', err);

        let errorMsg = err.message;
        if (errorMsg.includes('Incorrect API key')) {
          errorMsg = 'Invalid API key. Click the ⚙️ button to update your key.';
        } else if (errorMsg.includes('quota')) {
          errorMsg = 'Groq API quota exceeded. Check your usage at console.groq.com.';
        } else if (errorMsg.includes('rate limit') || errorMsg.includes('Rate limited')) {
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
