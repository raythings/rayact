import Foundation
import QuartzCore
import os.signpost

final class RayactRenderScheduler {
    private let session: RayactEngineSession
    private let surfaceCountLock = NSLock()
    private var surfaceCount = 0
    private var driver: DisplayLinkDriver?

    init(session: RayactEngineSession) {
        self.session = session
    }

    func retainSurface() {
        surfaceCountLock.lock()
        surfaceCount += 1
        let shouldStart = surfaceCount == 1
        surfaceCountLock.unlock()
        if shouldStart {
            DispatchQueue.main.async { [weak self] in
                guard let self else { return }
                self.surfaceCountLock.lock()
                if self.surfaceCount > 0 && self.driver == nil {
                    self.driver = DisplayLinkDriver(session: self.session)
                    self.driver?.start()
                }
                self.surfaceCountLock.unlock()
            }
        }
    }

    func releaseSurface() {
        surfaceCountLock.lock()
        surfaceCount = max(0, surfaceCount - 1)
        let remaining = surfaceCount
        surfaceCountLock.unlock()
        if remaining == 0 {
            DispatchQueue.main.async { [weak self] in
                self?.driver?.stop()
                self?.driver = nil
            }
        }
    }

    func stopRendering() {
        surfaceCountLock.lock()
        surfaceCount = 0
        surfaceCountLock.unlock()
        DispatchQueue.main.async { [weak self] in
            self?.driver?.stop()
            self?.driver = nil
        }
    }

    func requestFrame() {
        DispatchQueue.main.async { [weak self] in
            self?.driver?.requestFrame()
        }
    }

    func traceNextFrame(_ name: String) {
        DispatchQueue.main.async { [weak self] in
            self?.driver?.traceNextFrame(name)
        }
    }

    // One persistent CADisplayLink, driven by `isPaused`. While the engine
    // reports `continuous` (an animation/transition/rAF is in flight) the link
    // stays unpaused and fires every vsync — vsync-locked, no per-frame object
    // churn. When idle it pauses and a delayed timer re-arms it for the next
    // due JS timer (or a 60Hz fallback poll). Previously a brand-new
    // CADisplayLink was allocated every frame, causing phase jitter / stutter.
    private final class DisplayLinkDriver: NSObject {
        private let session: RayactEngineSession
        private var running = false
        private var displayLink: CADisplayLink?
        private var lastFrameTimeNanos: Int64 = 0
        private var nextTraceName: String?
        private var timerWorkItem: DispatchWorkItem?

        init(session: RayactEngineSession) {
            self.session = session
            super.init()
        }

        func start() {
            running = true
            if displayLink == nil {
                let link = CADisplayLink(target: self, selector: #selector(handleFrame(_:)))
                link.isPaused = true
                link.add(to: .main, forMode: .common)
                displayLink = link
            }
            requestFrame()
        }

        func stop() {
            running = false
            timerWorkItem?.cancel()
            timerWorkItem = nil
            displayLink?.invalidate()
            displayLink = nil
        }

        func requestFrame() {
            guard running else { return }
            timerWorkItem?.cancel()
            timerWorkItem = nil
            displayLink?.isPaused = false
        }

        func traceNextFrame(_ name: String) {
            nextTraceName = name
            requestFrame()
        }

        @objc private func handleFrame(_ link: CADisplayLink) {
            guard running else { return }

            let traceName = nextTraceName
            nextTraceName = nil
            if let traceName {
                os_signpost(.event, log: RayactRenderScheduler.perfLog, name: "Frame", "%{public}s", traceName)
            }

            let frameTimeNanos = Int64(link.timestamp * 1_000_000_000)
            let prev = lastFrameTimeNanos
            lastFrameTimeNanos = frameTimeNanos
            let deltaNanos = prev > 0 ? frameTimeNanos - prev : 16_666_667

            let continuous = session.nativeRenderFrame(frameTimeNanos: frameTimeNanos, deltaNanos: deltaNanos)

            if continuous {
                // Keep the link running — it fires again next vsync.
                return
            }

            // Idle: pause the link and re-arm via the next due JS timer (or a
            // 60Hz fallback) so timers/late-scheduled animations still wake us.
            link.isPaused = true
            let delayMs = session.nativeNextJSTimerDelayMs()
            let delay = delayMs >= 0 ? max(0.001, Double(delayMs) / 1000.0) : 1.0 / 60.0
            let work = DispatchWorkItem { [weak self] in
                guard let self, self.running else { return }
                self.displayLink?.isPaused = false
            }
            timerWorkItem = work
            DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: work)
        }
    }
}

extension RayactRenderScheduler {
    static let perfLog = OSLog(subsystem: "com.rayact.ios", category: "RayactPerf")
}
