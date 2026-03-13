// ==UserScript==
// @name         WPorg Review Helper
// @namespace    https://github.com/Kingsleyinfo/wporg-review-helper
// @version      2.0.0
// @description  Analyzes WordPress.org support threads using AI and recommends review request templates based on customer sentiment.
// @author       Kay (Kingsleyinfo)
// @match        https://wordpress.org/support/topic/*
// @grant        GM_setClipboard
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @connect      api.openai.com
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ──────────────────────────────────────────────
  // 1. CONFIGURATION
  // ──────────────────────────────────────────────

  const OPENAI_MODEL = 'gpt-4o-mini';
  const API_KEY_STORAGE = 'wrh_openai_api_key';

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

1. Whether the customer had a GOOD experience (and should be asked for a plugin review) or NOT a good experience (and should NOT be asked).
2. Which response template (A–F) the support agent should use.
3. Key signals that led to your determination.

## Decision Framework

### GOOD EXPERIENCE signals (ask for a review):
- User explicitly confirmed the fix works (e.g., "that worked," "fixed," "solved," "all good," "working now," "thanks so much")
- Positive/grateful tone — expressions of thanks, relief, enthusiasm
- Short thread with a clear resolution
- User came back after a delay to confirm the solution held up

### NOT GOOD EXPERIENCE signals (don't ask):
- Issue unresolved (e.g., "still not working," "same issue," "no luck," "giving up")
- User was frustrated, angry, or disappointed
- Feature request with no resolution
- User was redirected elsewhere (hosting, theme dev, GitHub issue, out of scope)
- Agent only provided documentation links
- User mentioned choosing another plugin or solution
- Thread ended in silence (last message from agent, no user response) — flag as inconclusive
- Long thread with no clear confirmation of resolution

### Template Selection (when sentiment is GOOD):
- **A (Quick Resolution)**: Thread is short (≤3 agent replies), user confirmed, positive tone
- **B (Resolved After Long Thread)**: Thread is longer (4+ agent replies), user confirmed, positive/neutral-positive tone
- **C (Workaround Accepted)**: Agent offered a workaround (workaround, alternative, temporary fix, snippet, custom CSS, filter) AND user accepted it positively
- **D (Resolved After Escalation)**: Thread references GitHub, escalation, developer fix, patch, or update resolving the issue
- **F (Delayed Follow-Up)**: Thread spans multiple days AND resolved, but could benefit from a check-in first (suggest alongside primary template)

### When sentiment is NOT GOOD or INCONCLUSIVE:
- Always use **E (Graceful Close)**

## Important Analysis Notes
- Pay close attention to the FINAL messages in the thread — they carry the most weight
- "Thank you" alone doesn't mean the issue is resolved — look for explicit confirmation
- Sarcasm and polite frustration should be detected (e.g., "thanks anyway, I'll find another plugin")
- If the user says thanks but the issue clearly isn't fixed, that's NOT a good experience
- Consider the full arc of the conversation, not just individual phrases

## Response Format
You MUST respond with valid JSON only, no markdown formatting, no code blocks. The response must match this exact structure:
{
  "sentiment": "good" | "bad" | "inconclusive",
  "confidence": 0.0 to 1.0,
  "primaryTemplate": "A" | "B" | "C" | "D" | "E" | "F",
  "secondaryTemplate": null | "F",
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
      right: 210px;
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
          <label for="wrh-api-key">OpenAI API Key</label>
          <input type="password" id="wrh-api-key" placeholder="sk-..." value="${currentKey}" />
          <div class="wrh-hint">
            Your key is stored locally in Tampermonkey and never sent anywhere except OpenAI's API.
            Get one at <a href="https://platform.openai.com/api-keys" target="_blank" style="color: #0073aa;">platform.openai.com/api-keys</a>
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
      if (!key.startsWith('sk-')) {
        alert('OpenAI API keys start with "sk-". Please check your key.');
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

  // Register Tampermonkey menu command
  GM_registerMenuCommand('⚙️ Set OpenAI API Key', showSettingsDialog);

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
  // 7. AI ANALYSIS VIA OPENAI
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
   * Calls OpenAI API with the thread data.
   * Returns a promise that resolves with the parsed AI response.
   */
  function callOpenAI(threadText) {
    const apiKey = getApiKey();

    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'POST',
        url: 'https://api.openai.com/v1/chat/completions',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        data: JSON.stringify({
          model: OPENAI_MODEL,
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
              reject(new Error(data.error.message || 'OpenAI API error'));
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
          reject(new Error('Network error calling OpenAI API. Check your connection.'));
        },
        ontimeout: function () {
          reject(new Error('OpenAI API request timed out. Try again.'));
        },
        timeout: 30000,
      });
    });
  }

  // ──────────────────────────────────────────────
  // 8. UI RENDERING
  // ──────────────────────────────────────────────

  function renderPanel(aiResult, thread) {
    const existing = document.getElementById('wrh-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'wrh-overlay';

    const sentimentLabel = aiResult.sentiment === 'good'
      ? '✅ Good Experience — Ask for a Review'
      : aiResult.sentiment === 'bad'
        ? '❌ Not a Good Experience — Don\'t Ask'
        : '⚠️ Inconclusive — Review Manually';

    const sentimentClass = aiResult.sentiment === 'good' ? 'good'
      : aiResult.sentiment === 'bad' ? 'bad'
        : 'inconclusive';

    const signalIcons = { positive: '✅', negative: '❌', neutral: '⚠️', info: 'ℹ️' };

    // Confidence display
    const confidence = Math.round((aiResult.confidence || 0) * 100);
    const confClass = confidence >= 75 ? 'high' : confidence >= 50 ? 'medium' : 'low';

    const getTemplateText = (key) => {
      let text = TEMPLATES[key].text;
      if (thread.author) {
        text = text.replace('[NAME]', thread.author);
      }
      return text;
    };

    const pt = aiResult.primaryTemplate || 'E';
    const st = aiResult.secondaryTemplate || null;

    let secondaryHTML = '';
    if (st && TEMPLATES[st]) {
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

          ${aiResult.reasoning ? `
            <div class="wrh-label">AI REASONING</div>
            <div class="wrh-reasoning">${aiResult.reasoning}</div>
          ` : ''}

          <div class="wrh-label">SIGNALS DETECTED</div>
          <ul class="wrh-signals">
            ${signalsHTML}
          </ul>

          <hr class="wrh-divider">

          <div class="wrh-label">RECOMMENDED TEMPLATE</div>
          <div class="wrh-template-card">
            <h3>Template ${pt} — ${TEMPLATES[pt] ? TEMPLATES[pt].name : 'Unknown'}</h3>
            <p>${TEMPLATES[pt] ? TEMPLATES[pt].description : ''}</p>
            <button class="wrh-copy-btn" data-template="${pt}">📋 Copy Template ${pt}</button>
          </div>

          ${secondaryHTML}

          <div class="wrh-powered-by">
            Powered by OpenAI GPT-4o Mini · Analysis runs on-demand only
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

        btn.textContent = '✅ Copied!';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.textContent = `📋 Copy Template ${key}`;
          btn.classList.remove('copied');
        }, 2000);
      });
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

        // 3. Call OpenAI
        const aiResult = await callOpenAI(threadText);

        // 4. Render results
        renderPanel(aiResult, thread);

      } catch (err) {
        console.error('WPorg Review Helper Error:', err);

        let errorMsg = err.message;
        if (errorMsg.includes('Incorrect API key')) {
          errorMsg = 'Invalid API key. Click the ⚙️ button to update your key.';
        } else if (errorMsg.includes('quota')) {
          errorMsg = 'OpenAI API quota exceeded. Check your billing at platform.openai.com.';
        } else if (errorMsg.includes('rate limit')) {
          errorMsg = 'Rate limited by OpenAI. Wait a moment and try again.';
        }

        renderError(errorMsg);
      }

      fab.innerHTML = '📊 Analyze Thread';
      fab.disabled = false;
    });
  }

  init();
})();
