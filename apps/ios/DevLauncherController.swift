import UIKit

final class DevLauncherController: UIViewController {
    private enum ActivePane { case launcher, project }

    private let rootContainer = UIView()
    private var launcherSession: RayactEngineSession!
    private var launcherHost: NavigationHost!

    private var projectSession: RayactEngineSession?
    private var projectHost: NavigationHost?
    private var projectUrl: String?
    private var activePane: ActivePane = .launcher
    private var projectLoadGeneration = 0
    private var shakeDetector: DevShakeDetector?
    private var destroyed = false
    private var projectBackBlockedUntil: TimeInterval = 0
    private var launcherBackBlockedUntil: TimeInterval = 0

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        rootContainer.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(rootContainer)
        NSLayoutConstraint.activate([
            rootContainer.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            rootContainer.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            rootContainer.topAnchor.constraint(equalTo: view.topAnchor),
            rootContainer.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])

        let dataPath = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!.path
        guard let session = RayactEngineSession.create(dataPath: dataPath) else {
            fatalError("Failed to create Rayact engine session")
        }
        launcherSession = session
        launcherHost = createHost(session: session)

        DevClientBridge.initBridge(launcher: launcherSession)
        DevClientBridge.registerDevHost(
            controller: self,
            openProject: { [weak self] url in self?.openProject(url: url) },
            reloadProject: { [weak self] in self?.reloadProject() },
            showLauncher: { [weak self] in self?.showLauncher() }
        )

        let edge = UIScreenEdgePanGestureRecognizer(target: self, action: #selector(handleBackGesture))
        edge.edges = .left
        view.addGestureRecognizer(edge)

        if let initialUrl = launchDevServerUrl(), !initialUrl.isEmpty {
            openProject(url: initialUrl)
        } else {
            loadLauncherJs()
            showLauncher()
        }
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        activeSession()?.acquireGraphics()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        if let session = activeSession() {
            DevClientBridge.attach(self, session: session)
        }
        // Be first responder so shake (motionShake) reaches motionEnded below.
        becomeFirstResponder()
    }

    override func viewWillDisappear(_ animated: Bool) {
        activeSession()?.releaseGraphics()
        super.viewWillDisappear(animated)
    }

    deinit {
        destroyed = true
        projectLoadGeneration += 1
        stopProjectDebugTools()
        destroyProjectSession()
        DevClientBridge.clearDevHost(self)
        if launcherSession != nil {
            DevClientBridge.detach(self, session: launcherSession)
            launcherSession.destroy()
        }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        activeHost()?.syncSurfacesToCurrentLayout()
    }

    override var prefersStatusBarHidden: Bool { false }

    private func launchDevServerUrl() -> String? {
        if let url = UserDefaults.standard.string(forKey: DevClientBridge.extraDevServerUrl), !url.isEmpty {
            return url
        }
        return nil
    }

    private func showLauncher() {
        projectLoadGeneration += 1
        let hadProject = activePane == .project
        if hadProject {
            stopProjectDebugTools()
            unmountCurrentPane()
        }
        activePane = .launcher
        launcherBackBlockedUntil = uptimeMs() + 1200
        mountPane(.launcher, host: launcherHost, session: launcherSession)
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.launcherHost.syncSurfacesToCurrentLayout()
            self.launcherSession.host.renderScheduler.requestFrame()
            if hadProject { self.destroyProjectSession() }
        }
    }

    private func openProject(url: String) {
        let normalized = url.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: "\\/", with: "/")
        guard !normalized.isEmpty else { return }

        projectLoadGeneration += 1
        let generation = projectLoadGeneration

        if activePane == .project {
            stopProjectDebugTools()
            unmountCurrentPane()
            destroyProjectSession()
        }

        projectUrl = normalized
        let session = ensureProjectSession()
        ensureProjectHost(session: session)

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self else { return }
            let result = Result { try DevServerLoader.fetchBootstrap(baseUrl: normalized) }
            if self.destroyed || generation != self.projectLoadGeneration { return }

            let loaded: Bool
            if let payload = try? result.get() {
                if payload.bundleFormat == "qjsbc" {
                    loaded = session.loadBytecode(payload.bytes)
                } else if let source = String(data: payload.bytes, encoding: .utf8) {
                    loaded = session.loadDevBootstrap(serverUrl: normalized, source: source)
                } else {
                    loaded = false
                }
            } else {
                let message: String
                switch result {
                case .failure(let error): message = error.localizedDescription
                case .success: message = "Failed to load dev server"
                }
                loaded = session.loadSource(Self.errorScreenSource(message: message))
            }

            DispatchQueue.main.async {
                if self.destroyed || generation != self.projectLoadGeneration { return }
                if !loaded { print("[RayactPerf] bundle.eval.rejected") }
                if self.destroyed || generation != self.projectLoadGeneration { return }
                self.switchToProjectPane(session: session)
                ProjectHmrClient.start(serverUrl: normalized, engineSession: session)
            }
        }
    }

    private func reloadProject() {
        let url = projectUrl ?? DevClientBridge.savedDevServerUrl()
        guard let url, !url.isEmpty else { return }
        if activePane == .project, let session = projectSession, session.isAlive() {
            ProjectHmrClient.stop()
            reloadProjectInPlace(url: url, session: session)
        } else {
            openProject(url: url)
        }
    }

    private func reloadProjectInPlace(url: String, session: RayactEngineSession) {
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                let payload = try DevServerLoader.fetchBootstrap(baseUrl: url)
                if payload.bundleFormat == "qjsbc" {
                    _ = session.loadBytecode(payload.bytes)
                } else if let source = String(data: payload.bytes, encoding: .utf8) {
                    _ = session.loadDevBootstrap(serverUrl: url, source: source)
                }
            } catch {
                print("[RayactPerf] reloadProjectInPlace failed: \(error)")
            }
            DispatchQueue.main.async {
                ProjectHmrClient.start(serverUrl: url, engineSession: session)
                self.projectHost?.syncSurfacesToCurrentLayout()
                session.host.renderScheduler.requestFrame()
            }
        }
    }

    private func switchToProjectPane(session: RayactEngineSession) {
        let launcherWasMounted = launcherHost.superview === rootContainer
        activePane = .project
        guard let host = projectHost else { return }
        mountPane(.project, host: host, session: session)
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            host.syncSurfacesToCurrentLayout()
            session.host.renderScheduler.traceNextFrame("project.first.frame")
            session.host.renderScheduler.requestFrame()
            if launcherWasMounted {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.12) {
                    if self.activePane == .project, self.launcherHost.superview === self.rootContainer {
                        self.launcherHost.removeFromSuperview()
                        self.launcherSession.releaseGraphics()
                    }
                }
            }
        }
    }

    private func ensureProjectSession() -> RayactEngineSession {
        if let projectSession { return projectSession }
        let dataPath = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!.path
        guard let session = RayactEngineSession.create(dataPath: dataPath) else {
            fatalError("Failed to create Rayact project session")
        }
        projectSession = session
        return session
    }

    private func ensureProjectHost(session: RayactEngineSession) {
        guard projectHost == nil else { return }
        projectHost = createHost(session: session)
    }

    private func createHost(session: RayactEngineSession) -> NavigationHost {
        let host = NavigationHost(session: session, parent: self)
        host.installRoot(RayactSurfaceView(session: session))
        return host
    }

    private func mountPane(_ pane: ActivePane, host: NavigationHost, session: RayactEngineSession) {
        if host.superview === rootContainer {
            rootContainer.bringSubviewToFront(host)
        } else if host.superview != nil {
            host.removeFromSuperview()
            rootContainer.addSubview(host)
            host.translatesAutoresizingMaskIntoConstraints = false
            NSLayoutConstraint.activate([
                host.leadingAnchor.constraint(equalTo: rootContainer.leadingAnchor),
                host.trailingAnchor.constraint(equalTo: rootContainer.trailingAnchor),
                host.topAnchor.constraint(equalTo: rootContainer.topAnchor),
                host.bottomAnchor.constraint(equalTo: rootContainer.bottomAnchor),
            ])
        } else {
            rootContainer.addSubview(host)
            host.translatesAutoresizingMaskIntoConstraints = false
            NSLayoutConstraint.activate([
                host.leadingAnchor.constraint(equalTo: rootContainer.leadingAnchor),
                host.trailingAnchor.constraint(equalTo: rootContainer.trailingAnchor),
                host.topAnchor.constraint(equalTo: rootContainer.topAnchor),
                host.bottomAnchor.constraint(equalTo: rootContainer.bottomAnchor),
            ])
        }
        session.acquireGraphics()
        DevClientBridge.attach(self, session: session)
        if pane == .project {
            startProjectDebugTools(session: session, host: host)
        }
    }

    private func unmountCurrentPane() {
        guard let host = activeHost(), let session = activeSession() else { return }
        if host.superview === rootContainer {
            host.removeFromSuperview()
        }
        session.releaseGraphics()
    }

    private func destroyProjectSession() {
        guard let session = projectSession else { return }
        if projectHost?.superview === rootContainer {
            projectHost?.removeFromSuperview()
        }
        DevClientBridge.detach(self, session: session)
        if session.isAlive() { session.releaseGraphics() }
        session.destroy()
        projectSession = nil
        projectHost = nil
        projectUrl = nil
    }

    private func startProjectDebugTools(session: RayactEngineSession, host: NavigationHost) {
        session.host.attachDevMenuOverlay(host)
        shakeDetector?.stop()
        shakeDetector = DevShakeDetector(session: session)
        shakeDetector?.start()
    }

    private func stopProjectDebugTools() {
        ProjectHmrClient.stop()
        shakeDetector?.stop()
        shakeDetector = nil
        projectBackBlockedUntil = 0
    }

    @objc private func handleBackGesture() {
        _ = handleDevHostBack()
    }

    @discardableResult
    private func handleDevHostBack() -> Bool {
        let now = uptimeMs()
        if activePane == .project {
            if now < projectBackBlockedUntil { return true }
            projectBackBlockedUntil = now + 600
            if let session = projectSession {
                session.nativeOnBackPressed()
                session.host.renderScheduler.requestFrame()
            }
            return true
        }
        if now < launcherBackBlockedUntil { return true }
        return false
    }

    // DevShakeDetector (accelerometer) only fires on a real device. The
    // simulator's Device ▸ Shake — and a real device's shake — also deliver a
    // UIKit motionShake up the responder chain, so handle it here (this is the
    // root VC, always in the chain) to toggle the active session's dev menu.
    override var canBecomeFirstResponder: Bool { true }

    override func motionEnded(_ motion: UIEvent.EventSubtype, with event: UIEvent?) {
        if motion == .motionShake {
            activeSession()?.nativeToggleDevMenu()
            return
        }
        super.motionEnded(motion, with: event)
    }

    private func activeSession() -> RayactEngineSession? {
        switch activePane {
        case .launcher: return launcherSession
        case .project: return projectSession
        }
    }

    private func activeHost() -> NavigationHost? {
        switch activePane {
        case .launcher: return launcherHost
        case .project: return projectHost
        }
    }

    private func loadLauncherJs() {
        guard let url = Bundle.main.url(forResource: "app", withExtension: "js"),
              let src = try? String(contentsOf: url, encoding: .utf8) else { return }
        launcherSession.loadDevClient(src)
    }

    private func uptimeMs() -> TimeInterval {
        ProcessInfo.processInfo.systemUptime * 1000
    }

    private static func errorScreenSource(message: String) -> String {
        let quoted = (try? JSONEncoder().encode(message))
            .flatMap { String(data: $0, encoding: .utf8) } ?? "\"\(message)\""
        return """
        var root = createView({ backgroundColor: 0x2B1111FF, padding: 24, gap: 12, flexGrow: 1 });
        appendChild(root, createText('Rayact dev server error', { text: { color: 0xFFFFFFFF, fontSize: 24 } }));
        appendChild(root, createText(\(quoted), { text: { color: 0xFFB4B4FF, fontSize: 14 } }));
        setRootNode(root);
        """
    }
}
