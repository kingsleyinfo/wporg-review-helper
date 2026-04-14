# Changelog

All notable changes to WPorg Review Helper will be documented in this file.

## [3.0.0] - 2026-04-12
- **AI-drafted messages**: The AI now drafts a personalized review request message for each thread, shown in an editable textarea. Copy it, tweak it, or fall back to templates.
- **Thread summary**: One-line summary of the thread (issue + resolution) shown at the top of the results panel.
- **Model selector**: Choose between llama-3.1-8b-instant, llama-3.3-70b-versatile (new default), or gemma2-9b-it in Settings.
- **Loading skeleton**: Panel opens immediately on click with a loading indicator, fills when the API responds.
- **Prior review collapse**: When a user has already reviewed, the AI draft is collapsed with a "Show draft anyway" toggle instead of hidden entirely.
- **Context-length warning**: Amber tip shown for long threads when using the 8B model, suggesting the 70B model.
- **Partial JSON recovery**: If the AI returns malformed JSON, sentiment and template are extracted via regex so you still get a usable result.
- **XSS fix**: All AI response fields (reasoning, signals, summary, draft) are now HTML-escaped before rendering. Shared `escapeHTML()` utility.
- **DRY refactor**: Extracted `setupOverlayDismiss()`, `copyToClipboard()`, `getModel()`/`setModel()` shared utilities.
- **Enhanced analytics**: New fields tracked — draftGenerated, draftCopied, draftEdited, templateFallback, modelUsed. "AI Draft Rate" row in dashboard. CSV export includes all new columns.
- **Accessibility**: `role="dialog"`, `aria-modal`, `aria-labelledby`, `aria-live` region for copy feedback, `aria-label` on textarea and buttons, focus management on panel open, screen-reader-only utility class.
- **Dynamic footer**: Shows actual model name instead of hardcoded "Llama 3.1".
- **Default model changed**: From llama-3.1-8b-instant to llama-3.3-70b-versatile for better draft quality.

## [2.7.0] - 2026-03-23
- Split Template E into E + G for better bad-sentiment handling

## [2.6.0]
- Add troubleshooting mode detection and HC last responder check

## [2.5.0]
- Add prior review check — auto-detect if user already reviewed the plugin

## [2.4.0]
- Switch from OpenAI to Groq free API (Llama 3.1-8b-instant)

## [2.3.0]
- Add grey area / neutral sentiment path

## [2.2.0]
- Add local analytics dashboard

## [2.1.0]
- Auto-detect plugin and generate review link

## [2.0.0]
- Replace keyword matching with OpenAI GPT-4o Mini sentiment analysis

## [1.0.0]
- Initial release: Tampermonkey review helper script
