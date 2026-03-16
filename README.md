# WPorg Review Helper

A browser tool that analyzes WordPress.org support threads using AI and recommends review request templates based on customer sentiment.

Built for Happiness Engineers working WooCommerce (and other plugin) support on the WordPress.org forums. It helps you decide **when to ask for a plugin review** and **which template to use**, based on how the support interaction went.

## How It Works

When you click the **"📊 Analyze Thread"** button on any WordPress.org support topic page, the script:

1. **Parses the thread** — identifies the original poster vs. support agents, counts replies, measures thread duration
2. **Sends the conversation to Groq AI (Llama 3.1)** — along with a detailed decision framework covering positive, neutral, and negative signals
3. **Checks for prior reviews** — simultaneously scrapes the plugin's review pages to see if the user has already left a review (runs in parallel with the AI call — no extra wait)
4. **Displays the AI's assessment** — sentiment (good/neutral/bad), confidence score, reasoning, detected signals, and the recommended template
5. **Lets you copy the template** — one click copies the recommended text to your clipboard, ready to paste

Thread content is sent to Groq's API for analysis. Your API key is stored locally in Tampermonkey. Analytics data (no PII) is stored locally for your own tracking.

## Decision Framework

The script evaluates threads through three possible outcomes:

| Sentiment | Label | What it means | Templates shown |
|---|---|---|---|
| **Good** | ✅ Ask for a Review | User confirmed fix with positive/enthusiastic tone | A, B, C, D, F |
| **Neutral** | 🤔 Grey Area — Use Your Judgment | Solution accepted but tone is lukewarm — HC decides | B, C, D, F (+ E as skip) |
| **Bad** | ❌ Don't Ask | Issue unresolved, user frustrated, or silence | E only |

When the AI detects a **grey area**, it leans toward suggesting a softer template but gives the HC an explicit "skip" option (Template E) if something still feels off.

### Prior Review Check

Before recommending a template, the script checks whether the thread's original poster has **already reviewed** the plugin. It fetches the plugin's public review pages on wordpress.org (up to 10 pages) and searches for the author's username.

| Result | What happens |
|---|---|
| **⚠️ Prior review found** | Template automatically overridden to **E (Graceful Close)** — no review ask. An amber banner explains why. |
| **✅ No review found** | Green banner confirms it's safe to ask. If reviews exceeded 10 pages, a disclaimer notes how many were checked. |
| **Plugin not detected / check skipped** | No banner shown — the tool proceeds with the AI recommendation only. |

This check runs **in parallel** with the AI analysis, so it adds no extra wait time.

## Templates

| Template | When to Use |
|---|---|
| **A — Quick Resolution** | Short thread, user confirmed fix, clearly positive tone (not used for grey area) |
| **B — Resolved After Long Thread** | Longer thread, user confirmed, positive or neutral tone |
| **C — Workaround Accepted** | Agent offered a workaround, user accepted positively or neutrally |
| **D — Resolved After Escalation** | Issue resolved via GitHub/patch/update |
| **E — Graceful Close** | Not a good experience — close without asking for review (also used as "skip" for grey area) |
| **F — Delayed Follow-Up** | Multi-day thread resolved — check in before asking |

## Installation

### Prerequisites

- [Tampermonkey](https://www.tampermonkey.net/) browser extension installed in Chrome, Firefox, Edge, or Safari
- A free Groq API key ([get one here](https://console.groq.com/keys) — no credit card required)

### Steps

1. Open Tampermonkey in your browser and go to the **Dashboard**
2. Click the **"+"** tab (or "Create a new script")
3. Delete any default code in the editor
4. Copy the entire contents of [`tampermonkey/review-helper.user.js`](tampermonkey/review-helper.user.js) and paste it into the editor
5. Press **Ctrl+S** (or Cmd+S) to save
6. Navigate to any WordPress.org support topic — you'll see the **"📊 Analyze Thread"** button in the bottom-right corner
7. Click the **⚙️** button (or click Analyze — it'll prompt you) to enter your Groq API key
8. You're ready to go!

### Alternative: Direct Install

If you're viewing this on GitHub, you can click the raw link for the `.user.js` file and Tampermonkey should offer to install it automatically.

## Usage

1. Open a WordPress.org support thread (e.g., `https://wordpress.org/support/topic/example-thread/`)
2. Click the **"📊 Analyze Thread"** button (bottom-right corner)
3. Wait a few seconds for the AI analysis
4. Review the results panel:
   - **Prior review check** — ⚠️ if user already reviewed, ✅ if clear (or skipped if plugin wasn't detected)
   - **Sentiment result** — Good ✅, Grey Area 🤔, or Bad ❌
   - **Confidence score** — how certain the AI is about its assessment
   - **AI reasoning** — a one-line explanation of why it reached this conclusion
   - **Signals detected** — specific things the AI noticed in the conversation
   - **Recommended template** — with a copy button (auto-overridden to Template E if prior review was found)
5. Click **"📋 Copy Template"** to copy the text to your clipboard
6. Paste into the reply box, replace `[REVIEW_LINK]` with the plugin's review URL (auto-detected when possible), and send
7. Click the **"📈"** button (bottom-right) anytime to view your analytics dashboard

## Analytics Dashboard

The built-in analytics dashboard tracks your usage locally — no data is sent anywhere.

**What's tracked (no PII):**
- Thread URL, plugin slug, sentiment result, confidence score
- Which template was recommended and whether you copied it
- Whether a prior review was found for the user/plugin combination
- Timestamp of each analysis

**What's NOT tracked:**
- No usernames, display names, or user slugs
- No thread content or messages
- No IP addresses, browser fingerprints, or HC identity

**Dashboard features:**
- Summary stats: total threads analyzed, sentiment breakdown, template copy rate
- Bar chart of sentiment distribution
- Most recommended templates and most analyzed plugins
- Scrollable log of recent analyses with clickable thread links
- CSV export for external analysis
- Data cap of 1,000 entries (oldest entries rotate out)

## Cost

The script uses Groq's free tier with the Llama 3.1-8b-instant model — **completely free**, no credit card required. The free tier allows up to 30 requests per minute and 14,400 requests per day, which is more than enough for regular support work.

## Privacy & Security

- Your Groq API key is stored locally in Tampermonkey's storage — it never leaves your browser except in API calls to Groq
- Thread content is sent to Groq for analysis — these are public forum threads
- Analytics data (thread URLs, plugin slugs, sentiment scores) is stored locally in Tampermonkey — never sent anywhere
- No PII is ever collected or stored (no usernames, no thread content, no browser fingerprints)
- The script only runs on `wordpress.org/support/topic/*` pages

## Project Structure

```
wporg-review-helper/
├── README.md
├── LICENSE
├── tampermonkey/
│   └── review-helper.user.js      ← The Tampermonkey userscript
└── chrome-extension/               ← Placeholder for Phase 2
    └── .gitkeep
```

## Roadmap

### Phase 1: Tampermonkey Script (Current)
- [x] Thread parsing and author detection
- [x] AI-powered sentiment analysis via Groq (Llama 3.1) — free tier, no cost
- [x] Template recommendation with confidence scoring
- [x] Copy-to-clipboard functionality
- [x] Clean overlay UI with AI reasoning display
- [x] Secure API key management
- [x] Auto-detect plugin review link from forum page
- [x] Local analytics dashboard with CSV export
- [x] Grey area / neutral sentiment detection with HC judgment path
- [x] Prior review check — auto-detect if user already reviewed the plugin

### Phase 2: Chrome Extension (Planned)
- [ ] Sidebar panel instead of overlay
- [ ] Template customization in extension settings
- [ ] Team/shared analytics — centralized data for managers
- [ ] Team sharing — export/import template packs

## Contributing

This is a personal productivity tool, but suggestions and improvements are welcome. Open an issue or submit a pull request.

## License

MIT — see [LICENSE](LICENSE) for details.
