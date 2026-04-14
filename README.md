# WPorg Review Helper

A browser tool that analyzes WordPress.org support threads using AI, drafts personalized review request messages, and recommends templates based on customer sentiment.

Built for Happiness Engineers working WooCommerce (and other plugin) support on the WordPress.org forums. It helps you decide **when to ask for a plugin review**, **drafts a personalized message**, and falls back to **pre-written templates** when needed.

## How It Works

When you click the **"📊 Analyze Thread"** button on any WordPress.org support topic page, the script:

1. **Parses the thread** — identifies the original poster vs. support agents, counts replies, measures thread duration
2. **Opens the panel immediately** — with a loading skeleton so you see progress right away
3. **Sends the conversation to Groq AI** — using your chosen model (default: Llama 3.3-70B) with a detailed decision framework
4. **Checks for prior reviews** — simultaneously scrapes the plugin's review pages to see if the user has already left a review (runs in parallel with the AI call)
5. **Displays results** — thread summary, sentiment, confidence, an **editable AI-drafted message** in a textarea, reasoning, signals, and fallback templates
6. **Lets you copy the draft or a template** — one click copies text to your clipboard, ready to paste. Edit the draft inline if you want to personalize it further.

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
   - **Thread summary** — one-line overview of the issue and resolution
   - **Sentiment result** — Good ✅, Grey Area 🤔, or Bad ❌
   - **Confidence score** — how certain the AI is
   - **Prior review check** — ⚠️ if user already reviewed, ✅ if clear
   - **AI-drafted message** — editable textarea with a personalized review request (auto-fills author name and review link)
   - **AI reasoning + signals** — why it reached this conclusion
   - **Fallback templates** — pre-written options below the draft
5. Edit the draft if needed, then click **"📋 Copy Draft"** (or copy a template instead)
6. Paste into the reply box and send
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

## Model Selection

Choose your AI model in ⚙️ Settings:

| Model | Speed | Quality | Best for |
|---|---|---|---|
| **llama-3.3-70b-versatile** (default) | ~8s | Best drafts, most accurate sentiment | Daily use |
| llama-3.1-8b-instant | ~3s | Good enough for short threads | Quick checks |
| gemma2-9b-it | ~5s | Alternative style | Variety |

All models run on Groq's free tier — **completely free**, no credit card required. The free tier allows up to 30 requests per minute and 14,400 requests per day.

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

### Phase 1: Tampermonkey Script (Current — v3.0)
- [x] Thread parsing and author detection
- [x] AI-powered sentiment analysis via Groq — free tier, no cost
- [x] AI-drafted personalized review request messages (v3.0)
- [x] Thread summary — one-line issue + resolution overview (v3.0)
- [x] Model selector — choose between 3 Groq models (v3.0)
- [x] Template recommendation with confidence scoring
- [x] Editable draft textarea with copy button (v3.0)
- [x] Copy-to-clipboard functionality (draft + templates)
- [x] Clean overlay UI with loading skeleton (v3.0)
- [x] Secure API key management
- [x] Auto-detect plugin review link from forum page
- [x] Local analytics dashboard with CSV export
- [x] AI Draft Rate tracking in analytics (v3.0)
- [x] Grey area / neutral sentiment detection with HC judgment path
- [x] Prior review check — auto-detect if user already reviewed the plugin
- [x] WCAG 2.1 AA accessibility — dialog roles, focus management, screen reader support (v3.0)

### Phase 2: Chrome Extension (Planned)
- [ ] Sidebar panel instead of overlay
- [ ] Template customization in extension settings
- [ ] Team/shared analytics — centralized data for managers
- [ ] Team sharing — export/import template packs

## Contributing

This is a personal productivity tool, but suggestions and improvements are welcome. Open an issue or submit a pull request.

## License

MIT — see [LICENSE](LICENSE) for details.
