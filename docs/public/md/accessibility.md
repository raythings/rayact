# Accessibility

Rayact components accept role, label, hint, state/value, actions, focusability, tab order, live-region, and text-scaling props. `useReducedMotion()` follows the host preference and `setAccessibilityFocus()` moves semantic focus programmatically.

The renderer forwards semantic metadata into a synchronized accessibility snapshot. Android exposes virtual TalkBack nodes and actions, iOS exposes accessibility-container elements for VoiceOver, and Web maintains a hidden semantic DOM over the canvas.

Stable promotion requires recorded results for keyboard/controller traversal, focus restoration, 200% text scaling, reduced motion, contrast, TalkBack, iOS and macOS VoiceOver, and the Web semantic DOM. A source implementation or local build does not satisfy that release gate by itself.
