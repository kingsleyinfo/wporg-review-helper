# WPorg Review Helper

A browser tool that analyzes WordPress.org support threads using AI and recommends review request templates based on customer sentiment.

Built for Happiness Engineers working WooCommerce (and other plugin) support on the WordPress.org forums. It helps you decide **when to ask for a plugin review** and **which template to use**, based on how the support interaction went.

## How It Works

When you click the **"📊 Analyze Thread"** button on any WordPress.org support topic page, the script:

1. **Parses the thread** — identifies the original poster vs. support agents, counts replies, measures thread duration
2. **Sends the conversation to GPT-4o Mini** — along with a detailed decision framework covering positive signals, negative signals, and template selection criteria
3. **Displays the AI's assessment** — sentiment (good/bad/inconclusive), confidence score, reasoning, detected signals, and the recommended template
4. **Lets you copy the template** — one click copies the recommended text to your clipboard, ready to paste

Thread content is sent to OpenAI's API for analysis. Your API key is stored locally in Tampermonkey. Analytics data (no PII) is stored locally for your own tracking.

## Templates

| Template | When to Use |
|---|---|
| **A — Quick Resolution** | Short thread, user confirmed fix, positive tone |
| **B — Resolved After Long Thread** | Longer thread, user confirmed, positive/neutral tone |
| **C — Workaround Accepted** | Agent offered a workaround, user accepted positively |
| **D — Resolved After Escalation** | Issue resolved via GitHub/patch/update |
| **E — Graceful Close** | Not a good experience — close without asking for review |
| **F — Delayed Follow-Up** | Multi-day thread resolved — check in before asking |

## Installation

### Prerequisites

- [Tampermonkey](https://www.tampermonkey.net/) browser extension installed in Chrome, Firefox, Edge, or Safari
- An OpenAI API key ([get one here](https://platform.openai.com/api-keys))

### Steps

1. Open Tampermonkey in your browser and go to the **Dashboard**
2. Click the **"+"** tab (or "Create a new script")
3. Delete any default code in the editor
4. Copy the entire contents of [`tampermonkey/review-helper.user.js`](tampermonkey/review-helper.user.js) and paste it into the editor
5. Press **Ctrl+S** (or Cmd+S) to save
6. Navigate to any WordPress.org support topic — you'll see the **"📊 Analyze Thread"** button in the bottom-right corner
7. Click the **⚙️** button (or click Analyze — it'll prompt you) to enter your OpenAI API key
8. You're ready to go!

### Alternative: Direct Install

If you're viewing this on GitHub, you can click the raw link for the `.user.js` file and Tampermonkey should offer to install it automatically.

## Usage

1. Open a WordPress.org support thread (e.g., `https://wordpress.org/support/topic/example-thread/`)
2. Click the **"📊 Analyze Thread"** button (bottom-right corner)
3. Wait a few seconds for the AI analysis
4. Review the results panel:
   - **Sentiment result** — Good ✅, Bad ❌, or Inconclusive ⚠️
   - **Confidence score** — how certain the AI is about its assessment
   - **AI reasoning** — a one-line explanation of why it reached this conclusion
   - **Signals detected** — specific things the AI noticed in the conversation
   - **Recommended template** — with a copy button
5. Click **"📋 Copy Template"** to copy the text to your clipboard
6. Paste into the reply box, replace `[REVIEW_LINK]` with the plugin's review URL (auto-detected when possible), and send
7. Click the **"📈"** button (bottom-right) anytime to view your analytics dashboard

## Analytics Dashboard

The built-in analytics dashboard tracks your usage locally — no data is sent anywhere.

**What's tracked (no PII):**
- Thread URL, plugin slug, sentiment result, confidence score
- Which template was recommended and whether you copied it
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

The script uses GPT-4o Mini, which costs roughly **$0.00015 per thread analysis** (less than a penny per hundred threads). A typical month of support work would cost well under $1.

## Privacy & Security

- Your OpenAI API key is stored locally in Tampermonkey's storage — it never leaves your browser except in API calls to OpenAI
- Thread content is sent to OpenAI for analysis — these are public forum threads
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
- [x] AI-powered sentiment analysis via OpenAI GPT-4o Mini
- [x] Template recommendation with confidence scoring
- [x] Copy-to-clipboard functionality
- [x] Clean overlay UI with AI reasoning display
- [x] Secure API key management
- [x] Auto-detect plugin review link from forum page
- [x] Local analytics dashboard with CSV export

### Phase 2: Chrome Extension (Planned)
- [ ] Sidebar panel instead of overlay
- [ ] Template customization in extension settings
- [ ] Team/shared analytics — centralized data for managers
- [ ] Team sharing — export/import template packs

## Contributing

This is a personal productivity tool, but suggestions and improvements are welcome. Open an issue or submit a pull request.

## License

MIT — see [LICENSE](LICENSE) for details.
