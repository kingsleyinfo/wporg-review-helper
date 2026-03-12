// ==UserScript==
// @name         WPorg Review Helper
// @namespace    https://github.com/Kingsleyinfo/wporg-review-helper
// @version      1.0.0
// @description  Analyzes WordPress.org support threads and recommends review request templates based on customer sentiment.
// @author       Kay (Kingsleyinfo)
// @match        https://wordpress.org/support/topic/*
// @grant        GM_setClipboard
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ──────────────────────────────────────────────
  // 1. CONFIGURATION & CONSTANTS
  // ──────────────────────────────────────────────

  const POSITIVE_PHRASES = [
    'that worked', 'that fixed', 'it worked', 'it works', 'works now',
    'working now', 'fixed it', 'solved', 'all good', 'all set',
    'problem solved', 'issue resolved', 'thank you', 'thanks so much',
    'thanks a lot', 'thanks for', 'thank you so much', 'thanks!',
    'perfect', 'great', 'awesome', 'amazing', 'brilliant', 'excellent',
    'wonderful', 'fantastic', 'you\'re a lifesaver', 'lifesaver',
    'you saved me', 'that did it', 'that did the trick', 'bingo',
    'spot on', 'nailed it', 'works perfectly', 'works great',
    'working perfectly', 'working great', 'resolved', 'sorted',
    'cheers', 'much appreciated', 'appreciate it', 'grateful',
    'helped a lot', 'very helpful', 'super helpful', 'so helpful',
    'exactly what i needed', 'just what i needed',
  ];

  const POSITIVE_EMOJIS = ['🎉', '👍', '❤️', '😊', '🙏', '💯', '🥳', '✅', '👏', '😍', '🤩', '💪'];

  const NEGATIVE_PHRASES = [
    'still not working', 'still broken', 'same issue', 'same problem',
    'same error', 'no luck', 'doesn\'t help', 'didn\'t help',
    'does not help', 'did not help', 'not resolved', 'not fixed',
    'giving up', 'gave up', 'switching to', 'switch to another',
    'trying another', 'disappointed', 'frustrating', 'frustrated',
    'angry', 'unacceptable', 'terrible', 'awful', 'horrible',
    'worst', 'useless', 'waste of time', 'waste of money',
    'doesn\'t work', 'does not work', 'didn\'t work', 'did not work',
    'won\'t work', 'will not work', 'can\'t fix', 'cannot fix',
    'no solution', 'no resolution', 'still happening', 'still occurs',
    'still the same', 'nothing works', 'nothing helped',
    'going to uninstall', 'going to deactivate', 'looking for alternative',
    'found another plugin', 'moved to', 'migrated to',
  ];

  const FEATURE_REQUEST_PHRASES = [
    'can you add', 'could you add', 'would be nice if',
    'it would be great if', 'feature request', 'is there a way to',
    'is it possible to add', 'would love to see', 'suggestion:',
    'please add', 'wish there was', 'hope you can add',
    'any plans to', 'roadmap', 'planned feature',
  ];

  const REDIRECT_PHRASES = [
    'contact your hosting', 'reach out to your host',
    'contact the theme developer', 'reach out to the theme',
    'filed a github issue', 'opened a github issue',
    'github issue', 'out of scope', 'not a woocommerce issue',
    'not a plugin issue', 'third-party', 'third party',
    'custom code', 'custom development', 'hire a developer',
    'contact the developer', 'theme conflict', 'plugin conflict',
  ];

  const WORKAROUND_PHRASES = [
    'workaround', 'work around', 'alternative', 'temporary fix',
    'temporary solution', 'snippet', 'custom css', 'custom code',
    'filter', 'hook', 'override', 'patch', 'quick fix',
    'meanwhile', 'in the meantime', 'for now',
  ];

  const ESCALATION_PHRASES = [
    'github', 'escalated', 'escalation', 'developer fix',
    'dev team', 'development team', 'patch', 'update',
    'new version', 'next release', 'fix released',
    'been fixed in', 'fixed in version', 'resolved in',
    'pull request', 'merged', 'hotfix',
  ];

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
  // 3. STYLES
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
      width: 520px;
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
  `);

  // ──────────────────────────────────────────────
  // 4. THREAD PARSING
  // ──────────────────────────────────────────────

  /**
   * Parses the support thread into structured data.
   * Returns { author, authorSlug, replies[], agentReplyCount, userReplyCount, threadSpanDays }
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

    // Fallback: get author from the first post
    if (!authorName) {
      const firstAuthor = document.querySelector('.bbp-topic-author .bbp-author-name, .topic .bbp-reply-author .bbp-author-name');
      if (firstAuthor) authorName = firstAuthor.textContent.trim();
    }

    // Parse all replies (topic lead + replies)
    const replies = [];
    const replyEls = document.querySelectorAll('.bbp-reply-content, .bbp-topic-content, .entry-content');
    const authorEls = document.querySelectorAll('.bbp-reply-author, .bbp-topic-author');

    // Try a more granular approach using the reply containers
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

          // Detect if this is the OP or an agent
          // Agents often have specific CSS classes or badges
          const isAgent = !!(
            container.querySelector('.bbp-user-nicename .is-developer') ||
            container.querySelector('.badge, .moderator-badge, .developer-badge') ||
            container.querySelector('[class*="moderator"], [class*="plugin-author"], [class*="developer"]') ||
            container.classList.contains('moderator') ||
            container.classList.contains('plugin-author') ||
            // If the reply author slug doesn't match the OP's slug, likely an agent
            (authorSlug && replySlug && replySlug !== authorSlug)
          );

          // More reliable: if we have an authorSlug, compare
          const isOP = authorSlug ? (replySlug === authorSlug) : (replyAuthor === authorName);

          let dateStr = '';
          if (dateEl) dateStr = dateEl.textContent.trim();

          replies.push({
            author: replyAuthor,
            slug: replySlug,
            content: contentEl.textContent.trim().toLowerCase(),
            rawContent: contentEl.innerHTML,
            isOP: isOP,
            isAgent: !isOP, // simplification: anyone who isn't OP is treated as agent
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

  /**
   * Attempts to parse a date string from bbPress date elements.
   */
  function extractDate(dateStr) {
    if (!dateStr) return null;
    // Try direct Date parsing
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) return d;
    // Try extracting from common formats like "March 5, 2026 at 10:30 am"
    const cleaned = dateStr.replace(/ at /i, ' ').replace(/\s+/g, ' ').trim();
    const d2 = new Date(cleaned);
    if (!isNaN(d2.getTime())) return d2;
    return null;
  }

  // ──────────────────────────────────────────────
  // 5. SENTIMENT ANALYSIS
  // ──────────────────────────────────────────────

  /**
   * Analyzes the parsed thread and returns a result object.
   */
  function analyzeThread(thread) {
    const signals = [];
    let positiveScore = 0;
    let negativeScore = 0;

    // Combine all user (OP) replies for analysis
    const userText = thread.userReplies.map(r => r.content).join(' ');
    const agentText = thread.agentReplies.map(r => r.content).join(' ');
    const allText = thread.replies.map(r => r.content).join(' ');

    // --- Positive signal detection ---
    const foundPositive = [];
    POSITIVE_PHRASES.forEach(phrase => {
      if (userText.includes(phrase)) foundPositive.push(phrase);
    });
    if (foundPositive.length > 0) {
      positiveScore += foundPositive.length * 2;
      signals.push({ type: 'positive', text: `User confirmed fix/positive response: "${foundPositive.slice(0, 3).join('", "')}"${foundPositive.length > 3 ? ` (+${foundPositive.length - 3} more)` : ''}` });
    }

    // Positive emojis in user replies
    const userRaw = thread.userReplies.map(r => r.rawContent).join(' ');
    const foundEmojis = POSITIVE_EMOJIS.filter(e => userRaw.includes(e));
    if (foundEmojis.length > 0) {
      positiveScore += foundEmojis.length;
      signals.push({ type: 'positive', text: `Positive emojis detected: ${foundEmojis.join(' ')}` });
    }

    // --- Negative signal detection ---
    const foundNegative = [];
    NEGATIVE_PHRASES.forEach(phrase => {
      if (userText.includes(phrase)) foundNegative.push(phrase);
    });
    if (foundNegative.length > 0) {
      negativeScore += foundNegative.length * 2;
      signals.push({ type: 'negative', text: `User expressed frustration/issue unresolved: "${foundNegative.slice(0, 3).join('", "')}"${foundNegative.length > 3 ? ` (+${foundNegative.length - 3} more)` : ''}` });
    }

    // Feature request detection
    const foundFeatureReq = [];
    FEATURE_REQUEST_PHRASES.forEach(phrase => {
      if (allText.includes(phrase)) foundFeatureReq.push(phrase);
    });
    if (foundFeatureReq.length > 0) {
      negativeScore += foundFeatureReq.length;
      signals.push({ type: 'neutral', text: `Feature request language detected: "${foundFeatureReq.slice(0, 2).join('", "')}"` });
    }

    // Redirect detection (agent pointed user elsewhere)
    const foundRedirect = [];
    REDIRECT_PHRASES.forEach(phrase => {
      if (agentText.includes(phrase)) foundRedirect.push(phrase);
    });
    if (foundRedirect.length > 0) {
      negativeScore += foundRedirect.length;
      signals.push({ type: 'negative', text: `User was redirected: "${foundRedirect.slice(0, 2).join('", "')}"` });
    }

    // Workaround detection
    const foundWorkaround = [];
    WORKAROUND_PHRASES.forEach(phrase => {
      if (agentText.includes(phrase)) foundWorkaround.push(phrase);
    });
    const hasWorkaround = foundWorkaround.length > 0;
    if (hasWorkaround) {
      signals.push({ type: 'info', text: `Workaround offered: "${foundWorkaround.slice(0, 2).join('", "')}"` });
    }

    // Escalation detection
    const foundEscalation = [];
    ESCALATION_PHRASES.forEach(phrase => {
      if (allText.includes(phrase)) foundEscalation.push(phrase);
    });
    const hasEscalation = foundEscalation.length > 0;
    if (hasEscalation) {
      signals.push({ type: 'info', text: `Escalation/update reference: "${foundEscalation.slice(0, 2).join('", "')}"` });
    }

    // ALL CAPS detection in user replies (anger signal)
    const capsWords = userText.match(/\b[A-Z]{3,}\b/g);
    if (capsWords && capsWords.length >= 3) {
      negativeScore += 2;
      signals.push({ type: 'negative', text: 'Multiple ALL CAPS words detected (possible frustration)' });
    }

    // Thread length as a signal
    if (thread.agentReplyCount <= 3 && thread.userReplyCount <= 3) {
      signals.push({ type: 'info', text: `Short thread: ${thread.agentReplyCount} agent + ${thread.userReplyCount} user replies` });
    } else {
      signals.push({ type: 'info', text: `Longer thread: ${thread.agentReplyCount} agent + ${thread.userReplyCount} user replies` });
    }

    // Multi-day thread
    if (thread.threadSpanDays > 1) {
      signals.push({ type: 'info', text: `Thread spans ${thread.threadSpanDays} days` });
    }

    // Check if last reply is from the agent with no user response (inconclusive)
    const lastReply = thread.replies[thread.replies.length - 1];
    const isLastFromAgent = lastReply && lastReply.isAgent;
    if (isLastFromAgent) {
      negativeScore += 1;
      signals.push({ type: 'neutral', text: 'Thread ended with agent reply (no user confirmation)' });
    }

    // Check if the last user reply (most recent) is positive
    // This is the strongest signal — recency matters
    const lastUserReply = [...thread.userReplies].pop();
    let lastUserPositive = false;
    let lastUserNegative = false;
    if (lastUserReply) {
      const luc = lastUserReply.content;
      lastUserPositive = POSITIVE_PHRASES.some(p => luc.includes(p)) ||
                         POSITIVE_EMOJIS.some(e => lastUserReply.rawContent && lastUserReply.rawContent.includes(e));
      lastUserNegative = NEGATIVE_PHRASES.some(p => luc.includes(p));

      if (lastUserPositive) {
        positiveScore += 5; // Strong bonus for recency
        signals.push({ type: 'positive', text: 'Most recent user reply is positive/confirmatory' });
      }
      if (lastUserNegative) {
        negativeScore += 5;
        signals.push({ type: 'negative', text: 'Most recent user reply expresses dissatisfaction' });
      }
    }

    // ──────────────────────────────────────────
    // Determine overall sentiment
    // ──────────────────────────────────────────
    let sentiment; // 'good', 'bad', or 'inconclusive'
    if (positiveScore > negativeScore && positiveScore >= 3) {
      sentiment = 'good';
    } else if (negativeScore > positiveScore && negativeScore >= 3) {
      sentiment = 'bad';
    } else if (isLastFromAgent && positiveScore <= 2 && negativeScore <= 2) {
      sentiment = 'inconclusive';
    } else if (positiveScore > negativeScore) {
      sentiment = 'good';
    } else if (negativeScore > positiveScore) {
      sentiment = 'bad';
    } else {
      sentiment = 'inconclusive';
    }

    // ──────────────────────────────────────────
    // Template selection
    // ──────────────────────────────────────────
    let primaryTemplate = 'E';
    let secondaryTemplate = null;

    if (sentiment === 'good') {
      if (hasEscalation) {
        primaryTemplate = 'D';
      } else if (hasWorkaround && lastUserPositive) {
        primaryTemplate = 'C';
      } else if (thread.agentReplyCount <= 3) {
        primaryTemplate = 'A';
      } else {
        primaryTemplate = 'B';
      }

      // Suggest Template F as secondary if thread spans multiple days
      if (thread.threadSpanDays > 2) {
        secondaryTemplate = 'F';
      }
    } else if (sentiment === 'inconclusive') {
      // Default to E but signal that it's uncertain
      primaryTemplate = 'E';
      signals.push({ type: 'neutral', text: 'Sentiment is inconclusive — defaulting to graceful close. Review manually.' });
    } else {
      primaryTemplate = 'E';
    }

    return {
      sentiment,
      positiveScore,
      negativeScore,
      signals,
      primaryTemplate,
      secondaryTemplate,
      thread,
    };
  }

  // ──────────────────────────────────────────────
  // 6. UI RENDERING
  // ──────────────────────────────────────────────

  function renderPanel(result) {
    // Remove any existing overlay
    const existing = document.getElementById('wrh-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'wrh-overlay';

    const sentimentLabel = result.sentiment === 'good'
      ? '✅ Good Experience — Ask for a Review'
      : result.sentiment === 'bad'
        ? '❌ Not a Good Experience — Don\'t Ask'
        : '⚠️ Inconclusive — Review Manually';

    const sentimentClass = result.sentiment === 'good' ? 'good'
      : result.sentiment === 'bad' ? 'bad'
        : 'inconclusive';

    const signalIcons = { positive: '✅', negative: '❌', neutral: '⚠️', info: 'ℹ️' };

    // Build template text with auto-filled [NAME]
    const getTemplateText = (key) => {
      let text = TEMPLATES[key].text;
      if (result.thread.author) {
        text = text.replace('[NAME]', result.thread.author);
      }
      return text;
    };

    const pt = result.primaryTemplate;
    const st = result.secondaryTemplate;

    let secondaryHTML = '';
    if (st) {
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

    overlay.innerHTML = `
      <div id="wrh-panel">
        <div id="wrh-panel-header">
          <h2>📊 Thread Analysis</h2>
          <button id="wrh-close-btn" title="Close">&times;</button>
        </div>
        <div id="wrh-panel-body">
          <div class="wrh-sentiment ${sentimentClass}">${sentimentLabel}</div>

          <div class="wrh-stats">
            <span class="wrh-stat"><strong>${result.thread.agentReplyCount}</strong> agent replies</span>
            <span class="wrh-stat"><strong>${result.thread.userReplyCount}</strong> user replies</span>
            <span class="wrh-stat"><strong>${result.thread.replies.length}</strong> total posts</span>
            ${result.thread.threadSpanDays > 0 ? `<span class="wrh-stat"><strong>${result.thread.threadSpanDays}</strong> day span</span>` : ''}
          </div>

          <div class="wrh-label">SIGNALS DETECTED</div>
          <ul class="wrh-signals">
            ${result.signals.map(s => `
              <li>
                <span class="wrh-signal-icon">${signalIcons[s.type] || 'ℹ️'}</span>
                <span>${s.text}</span>
              </li>
            `).join('')}
          </ul>

          <hr class="wrh-divider">

          <div class="wrh-label">RECOMMENDED TEMPLATE</div>
          <div class="wrh-template-card">
            <h3>Template ${pt} — ${TEMPLATES[pt].name}</h3>
            <p>${TEMPLATES[pt].description}</p>
            <button class="wrh-copy-btn" data-template="${pt}">📋 Copy Template ${pt}</button>
          </div>

          ${secondaryHTML}
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // ── Event listeners ──

    // Close on backdrop click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    // Close button
    overlay.querySelector('#wrh-close-btn').addEventListener('click', () => overlay.remove());

    // Escape key
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

        // Try GM_setClipboard first, fallback to navigator.clipboard
        try {
          if (typeof GM_setClipboard === 'function') {
            GM_setClipboard(text, 'text');
          } else {
            navigator.clipboard.writeText(text);
          }
        } catch (err) {
          // Final fallback: textarea trick
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

  // ──────────────────────────────────────────────
  // 7. INITIALIZATION
  // ──────────────────────────────────────────────

  function init() {
    // Create the floating action button
    const fab = document.createElement('button');
    fab.id = 'wrh-fab';
    fab.innerHTML = '📊 Analyze Thread';
    fab.title = 'Analyze this support thread for review request readiness';
    document.body.appendChild(fab);

    fab.addEventListener('click', () => {
      // Briefly show loading state
      fab.innerHTML = '⏳ Analyzing…';
      fab.disabled = true;

      // Small timeout to let the UI update
      setTimeout(() => {
        try {
          const thread = parseThread();

          if (thread.replies.length === 0) {
            alert('WPorg Review Helper: Could not detect any replies in this thread. The page structure may have changed.');
            fab.innerHTML = '📊 Analyze Thread';
            fab.disabled = false;
            return;
          }

          const result = analyzeThread(thread);
          renderPanel(result);
        } catch (err) {
          console.error('WPorg Review Helper Error:', err);
          alert('WPorg Review Helper: An error occurred during analysis. Check the browser console for details.');
        }

        fab.innerHTML = '📊 Analyze Thread';
        fab.disabled = false;
      }, 100);
    });
  }

  // Run on page load
  init();
})();
