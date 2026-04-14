# TODOS

## Review Helper

### Draft Tone Selector

**What:** Add a dropdown that lets HCs pick the draft tone: 'warm', 'professional', 'casual'.

**Why:** Different HCs have different communication styles. A one-size tone won't fit everyone. Personalizes the AI draft to each HC's voice.

**Context:** v3.0 ships with a single default tone. The AI drafting instructions in SYSTEM_PROMPT could accept a tone parameter that adjusts the writing style. Implementation: add a small dropdown above the textarea (or in settings), pass the selected tone into the prompt. Requires prompt engineering per tone variant and testing across all 3 sentiment types. CEO review proposed this and deferred it pending validation that AI drafting works well at all.

**Effort:** M
**Priority:** P3
**Depends on:** v3.0 AI drafting validated via LLM eval

### Re-analyze with Different Model

**What:** Add a 'Re-analyze with [other model]' button to the results panel.

**Why:** Lets HCs compare draft quality across models without navigating to Settings. Builds intuition for which model produces better drafts. Feeds analytics data on model preference.

**Context:** Currently switching models requires: close panel → open settings → change model → save → re-analyze. A one-click button in the results panel would make this instant. Could show a small model picker inline, or just cycle to the next model. The analytics already track `modelUsed` per analysis, so comparison data would accumulate naturally.

**Effort:** S
**Priority:** P3
**Depends on:** v3.0 model selector working

### Export Analysis for Slack/P2

**What:** Add a 'Copy Summary' button that formats the analysis as a shareable snippet for Slack or P2 posts.

**Why:** Kay's intrapreneurship goal. Sharing per-thread analysis results with team leads demonstrates the tool's value and builds the case for wider adoption. The analytics dashboard shows aggregate data, but per-thread sharing makes individual interactions visible to decision-makers.

**Context:** Format could be: "Thread: [URL] | Sentiment: good (87%) | Summary: [one-liner] | Action: AI draft copied". Simple clipboard copy with markdown formatting. Slack and P2 both render markdown. Could live as a small button in the results panel footer, next to the "Powered by Groq" line.

**Effort:** S
**Priority:** P2
**Depends on:** v3.0 summary field working

## Completed
