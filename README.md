# WPorg Review Helper

A browser tool that analyzes WordPress.org support threads and recommends review request templates based on customer sentiment.

Built for Happiness Engineers working WooCommerce (and other plugin) support on the WordPress.org forums. It helps you decide **when to ask for a plugin review** and **which template to use**, based on how the support interaction went.

## How It Works

When you click the **"📊 Analyze Thread"** button on any WordPress.org support topic page, the script:

1. **Parses the thread** — identifies the original poster vs. support agents, counts replies, measures thread duration
2. **Runs local sentiment analysis** — scans for positive signals (confirmations, gratitude, emojis), negative signals (frustration, unresolved issues), and contextual patterns (workarounds, escalations, redirects)
3. **Recommends an action** — either ask for a review (with the right template) or close gracefully
4. **Lets you copy the template** — one click copies the recommended text to your clipboard, ready to paste

Everything runs **entirely in your browser**. No data is sent anywhere. No API calls. No tracking.

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

### Steps

1. Open Tampermonkey in your browser and go to the **Dashboard**
2. Click the **"+"** tab (or "Create a new script")
3. Delete any default code in the editor
4. Copy the entire contents of [`tampermonkey/review-helper.user.js`](tampermonkey/review-helper.user.js) and paste it into the editor
5. Press **Ctrl+S** (or Cmd+S) to save
6. Navigate to any WordPress.org support topic — you should see the **"📊 Analyze Thread"** button in the bottom-right corner

### Alternative: Direct Install

If you're viewing this on GitHub, you can click the raw link for the `.user.js` file and Tampermonkey should offer to install it automatically.

## Usage

1. Open a WordPress.org support thread (e.g., `https://wordpress.org/support/topic/example-thread/`)
2. Click the **"📊 Analyze Thread"** button (bottom-right corner)
3. Review the analysis panel:
   - **Sentiment result** — Good ✅, Bad ❌, or Inconclusive ⚠️
   - **Signals detected** — what the script picked up on
   - **Recommended template** — with a copy button
4. Click **"📋 Copy Template"** to copy the text to your clipboard
5. Paste into the reply box, replace `[REVIEW_LINK]` with the plugin's review URL, and send

## Sentiment Analysis Approach

The script uses keyword and pattern matching with weighted scoring:

- **Positive signals** (weighted +2 each): phrases like "that worked," "solved," "thanks so much," plus positive emojis
- **Negative signals** (weighted +2 each): phrases like "still not working," "frustrated," "switching to another plugin"
- **Contextual signals**: feature requests, redirects, workarounds, escalations, ALL CAPS usage
- **Recency bonus** (+5): the most recent user reply carries extra weight — a positive last reply strongly indicates a good experience, and vice versa
- **Inconclusive detection**: if the thread ends with an agent reply and no user confirmation, it's flagged for manual review

## Project Structure

```
wporg-review-helper/
├── README.md
├── LICENSE
├── tampermonkey/
│   └── review-helper.user.js      ← The Tampermonkey userscript (Phase 1)
└── chrome-extension/               ← Placeholder for Phase 2
    └── .gitkeep
```

## Roadmap

### Phase 1: Tampermonkey Script (Current)
- [x] Thread parsing and author detection
- [x] Local sentiment analysis with keyword matching
- [x] Template recommendation engine
- [x] Copy-to-clipboard functionality
- [x] Clean overlay UI

### Phase 2: Chrome Extension (Planned)
- [ ] Sidebar panel instead of overlay
- [ ] Richer analysis with lightweight local NLP
- [ ] Template customization in extension settings
- [ ] Auto-detect review link based on which plugin forum you're in
- [ ] History/tracking of review requests
- [ ] Team sharing — export/import template packs

## Contributing

This is a personal productivity tool, but suggestions and improvements are welcome. Open an issue or submit a pull request.

## License

MIT — see [LICENSE](LICENSE) for details.
