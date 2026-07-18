import UIKit

final class DevLauncherController: UIViewController {
    private enum ActivePane { case launcher, project }

    private let initialDevServerUrl: String?
    private let rootContainer = UIView()
    private var launcherSession: RayactEngineSession!
    private var launcherHost: NavigationHost!

    private var projectSession: RayactEngineSession?
    private var projectHost: NavigationHost?
    private var projectUrl: String?
    private var projectLoadingView: UIView?
    private var activePane: ActivePane = .launcher
    private var projectLoadGeneration = 0
    private var shakeDetector: DevShakeDetector?
    private var destroyed = false
    private var reloadInProgress = false
    private var projectBackBlockedUntil: TimeInterval = 0
    private var launcherBackBlockedUntil: TimeInterval = 0

    init(initialDevServerUrl: String? = nil) {
        self.initialDevServerUrl = initialDevServerUrl
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) {
        initialDevServerUrl = nil
        super.init(coder: coder)
    }

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

        if let initialUrl = initialDevServerUrl, !initialUrl.isEmpty {
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
        hideProjectLoading()
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

    override func viewWillTransition(
        to size: CGSize,
        with coordinator: UIViewControllerTransitionCoordinator
    ) {
        super.viewWillTransition(to: size, with: coordinator)
        coordinator.animate(alongsideTransition: nil) { [weak self] _ in
            guard let self, let host = self.activeHost(), let session = self.activeSession() else { return }
            host.syncSurfacesToCurrentLayout()
            session.host.renderScheduler.requestFrame()
        }
    }

    override var prefersStatusBarHidden: Bool { false }

    private func showLauncher() {
        projectLoadGeneration += 1
        hideProjectLoading()
        let hadProject = activePane == .project
        stopProjectDebugTools()
        if hadProject {
            projectSession?.nativeBlurTextInput()
            // Dispose while this host is still mounted so every child native
            // navigation controller is removed before the session changes.
            projectHost?.dispose()
            unmountCurrentPane()
        }
        destroyProjectSession()
        if hadProject {
            rebuildLauncherSession()
        }
        activePane = .launcher
        launcherBackBlockedUntil = uptimeMs() + 1200
        mountPane(.launcher, host: launcherHost, session: launcherSession)
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.launcherHost.syncSurfacesToCurrentLayout()
            self.launcherSession.host.renderScheduler.requestFrame()
        }
    }

    private func openProject(url: String) {
        let normalized = url.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: "\\/", with: "/")
        guard !normalized.isEmpty else { return }

        projectLoadGeneration += 1
        let generation = projectLoadGeneration
        showProjectLoading(url: normalized)

        if activePane == .project {
            stopProjectDebugTools()
            projectSession?.nativeBlurTextInput()
            // Dispose before detach so child native screens cannot survive
            // into the replacement JS runtime.
            projectHost?.dispose()
            unmountCurrentPane()
        } else {
            parkLauncherPane()
        }
        destroyProjectSession()

        projectUrl = normalized
        let dataPath = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!.path
        guard let session = RayactEngineSession.create(dataPath: dataPath) else {
            fatalError("Failed to create Rayact project session")
        }
        projectSession = session
        let host = createHost(session: session)
        projectHost = host

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self else { return }
            let result = Result { try DevServerLoader.fetchBootstrap(baseUrl: normalized) }
            if self.destroyed || generation != self.projectLoadGeneration { return }

            let payload = try? result.get()
            let bundleFormat = payload?.bundleFormat ?? "js"
            let loaded: Bool
            if let payload {
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
                self.reloadInProgress = false
                if bundleFormat == "qjsbc" { ProjectHmrClient.stop() }
                else { ProjectHmrClient.start(serverUrl: normalized, engineSession: session) }
                DevClientBridge.configureProjectDevTools(
                    session: session,
                    serverUrl: normalized,
                    bundleFormat: bundleFormat
                )
            }
        }
    }

    private func reloadProject() {
        guard !reloadInProgress else { return }
        let url = projectUrl ?? DevClientBridge.savedDevServerUrl()
        guard let url, !url.isEmpty else { return }
        reloadInProgress = true
        // A bootstrap is not safely re-entrant: React and the project's module
        // graph can already be partially initialized (especially after a runtime
        // exception). Recreate the project session so reload is a recovery path,
        // not another eval in the corrupted QuickJS context.
        openProject(url: url)
    }

    private func switchToProjectPane(session: RayactEngineSession) {
        parkLauncherPane()
        activePane = .project
        guard let host = projectHost else { return }
        mountPane(.project, host: host, session: session)
        hideProjectLoading()
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            host.syncSurfacesToCurrentLayout()
            session.host.renderScheduler.traceNextFrame("project.first.frame")
            session.host.renderScheduler.requestFrame()
        }
    }

    private func parkLauncherPane() {
        launcherSession?.nativeBlurTextInput()
        if launcherHost.superview === rootContainer {
            launcherHost.removeFromSuperview()
        }
        if launcherSession.isAlive() {
            launcherSession.releaseGraphics()
        }
    }

    private func createHost(session: RayactEngineSession) -> NavigationHost {
        let host = NavigationHost(session: session, parent: self)
        host.installRoot(RayactSurfaceView(session: session))
        return host
    }

    private func showProjectLoading(url: String) {
        hideProjectLoading()

        let container = UIView()
        container.translatesAutoresizingMaskIntoConstraints = false
        container.backgroundColor = UIColor(red: 10 / 255, green: 14 / 255, blue: 20 / 255, alpha: 1)
        container.isUserInteractionEnabled = true

        let spinner = UIActivityIndicatorView(style: .large)
        spinner.color = .white
        spinner.startAnimating()

        let title = UILabel()
        title.text = "Preparing project"
        title.textColor = .white
        title.font = .systemFont(ofSize: 22, weight: .semibold)
        title.textAlignment = .center

        let server = UILabel()
        server.text = url
        server.textColor = UIColor(red: 148 / 255, green: 163 / 255, blue: 184 / 255, alpha: 1)
        server.font = .systemFont(ofSize: 13)
        server.textAlignment = .center
        server.numberOfLines = 2
        server.lineBreakMode = .byTruncatingMiddle

        let stack = UIStackView(arrangedSubviews: [spinner, title, server])
        stack.translatesAutoresizingMaskIntoConstraints = false
        stack.axis = .vertical
        stack.alignment = .center
        stack.spacing = 10
        stack.setCustomSpacing(22, after: spinner)

        container.addSubview(stack)
        rootContainer.addSubview(container)
        NSLayoutConstraint.activate([
            container.leadingAnchor.constraint(equalTo: rootContainer.leadingAnchor),
            container.trailingAnchor.constraint(equalTo: rootContainer.trailingAnchor),
            container.topAnchor.constraint(equalTo: rootContainer.topAnchor),
            container.bottomAnchor.constraint(equalTo: rootContainer.bottomAnchor),
            stack.centerXAnchor.constraint(equalTo: container.centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: container.centerYAnchor),
            stack.leadingAnchor.constraint(greaterThanOrEqualTo: container.leadingAnchor, constant: 32),
            stack.trailingAnchor.constraint(lessThanOrEqualTo: container.trailingAnchor, constant: -32),
        ])
        container.accessibilityViewIsModal = true
        container.bringSubviewToFront(stack)
        rootContainer.bringSubviewToFront(container)
        projectLoadingView = container
    }

    private func hideProjectLoading() {
        projectLoadingView?.removeFromSuperview()
        projectLoadingView = nil
    }

    private func rebuildLauncherSession() {
        let oldSession = launcherSession!
        let oldHost = launcherHost!
        if oldHost.superview === rootContainer {
            oldHost.removeFromSuperview()
        }
        DevClientBridge.detach(self, session: oldSession)
        if oldSession.isAlive() { oldSession.releaseGraphics() }
        oldSession.destroy()

        let dataPath = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!.path
        guard let session = RayactEngineSession.create(dataPath: dataPath) else {
            fatalError("Failed to recreate Rayact launcher session")
        }
        launcherSession = session
        launcherHost = createHost(session: session)
        DevClientBridge.initBridge(launcher: session)
        loadLauncherJs()
    }

    private func mountPane(_ pane: ActivePane, host: NavigationHost, session: RayactEngineSession) {
        session.acquireGraphics()
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
        DevClientBridge.attach(self, session: session)
        if pane == .project {
            startProjectDebugTools(session: session, host: host)
        }
    }

    private func unmountCurrentPane() {
        guard let host = activeHost(), let session = activeSession() else { return }
        session.nativeBlurTextInput()
        if host.superview === rootContainer {
            host.removeFromSuperview()
        }
        session.releaseGraphics()
    }

    private func destroyProjectSession() {
        guard let session = projectSession else { return }
        session.disableDevTools()
        session.nativeBlurTextInput()
        if projectHost?.superview === rootContainer { projectHost?.dispose() }
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
        if let url = Bundle.main.url(forResource: "app", withExtension: "qjsbc"),
           let data = try? Data(contentsOf: url), !data.isEmpty {
            launcherSession.loadBytecode(data)
            return
        }
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
