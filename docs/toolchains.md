# Supported toolchains for 0.0.3

- Node.js 22 and 24 LTS.
- Android API 26 minimum, compile/target API 36, AGP 8.9.1, JDK 17, NDK 27.3.13750724.
- iOS 16 or newer and Apple Silicon macOS 13 or newer, using Xcode 26 and the iOS 26 SDK for distribution. Intel macOS and Rosetta are not supported targets.
- Latest two stable Chrome and Edge releases in a secure context with WebGPU, hardware acceleration, and COOP/COEP. Safari and Firefox are experimental.

Tier-1 release gates run ten controlled samples per target. They enforce first-interactive-frame, reload, frame-time/jank, CPU/RSS, reload/project-switch memory growth, lifecycle/resize endurance, and network-loss recovery budgets documented in the Phase 6 roadmap.
