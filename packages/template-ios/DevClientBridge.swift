import AVFoundation
import Foundation
import UIKit
import Vision

enum DevClientBridge {
    static let extraDevServerUrl = "RAYACT_DEV_SERVER"
    private static let prefsName = "rayact_dev_client"
    private static let keyUrl = "dev_server_url"
    private static let keyRecent = "recent_urls"
    private static let serviceType = "_rayact._tcp."

    private static var prefs: UserDefaults { UserDefaults.standard }
    private static weak var activeViewController: UIViewController?
    private static weak var activeSession: RayactEngineSession?
    private static weak var launcherSession: RayactEngineSession?
    private static weak var devHostViewController: DevLauncherController?
    private static var openProjectCallback: ((String) -> Void)?
    private static var reloadProjectCallback: (() -> Void)?
    private static var showLauncherCallback: (() -> Void)?

    private static let discoveryLock = NSLock()
    private static var discovered: [String: [String: Any]] = [:]
    private static var browser: NetServiceBrowser?

    private static var devCallResultStorage: [CChar] = [0]

    static let devCallCallback: RayactNativeBridge.DevCallFn = { methodPtr, dataJsonPtr in
        let method = methodPtr.map { String(cString: $0) } ?? ""
        let dataJson = dataJsonPtr.map { String(cString: $0) }
        let result = devCallFromNative(method: method, dataJson: dataJson)
        devCallResultStorage = Array(result.utf8CString)
        return devCallResultStorage.withUnsafeBufferPointer { $0.baseAddress }
    }

    static func initBridge(launcher: RayactEngineSession?) {
        if let launcher { launcherSession = launcher }
    }

    static func registerDevHost(
        controller: DevLauncherController,
        openProject: @escaping (String) -> Void,
        reloadProject: @escaping () -> Void,
        showLauncher: @escaping () -> Void
    ) {
        devHostViewController = controller
        openProjectCallback = openProject
        reloadProjectCallback = reloadProject
        showLauncherCallback = showLauncher
    }

    static func clearDevHost(_ controller: DevLauncherController) {
        if devHostViewController === controller {
            devHostViewController = nil
            openProjectCallback = nil
            reloadProjectCallback = nil
            showLauncherCallback = nil
        }
    }

    static func showLauncher() {
        if let cb = showLauncherCallback {
            DispatchQueue.main.async { cb() }
        } else {
            print("[DevClientBridge] showLauncher: no dev host registered")
        }
    }

    static func tryShowLauncherFromFinishActivity() -> Bool {
        guard showLauncherCallback != nil, let launcher = launcherSession, let active = activeSession else { return false }
        if active === launcher { return false }
        showLauncher()
        return true
    }

    static func reloadCurrentProject() {
        if let cb = reloadProjectCallback {
            DispatchQueue.main.async { cb() }
        } else {
            print("[DevClientBridge] reloadCurrentProject: no dev host registered")
        }
    }

    static func openProjectFromNative(url: String) {
        let cleaned = cleanUrl(url)
        guard !cleaned.isEmpty else { return }
        prefs.set(cleaned, forKey: keyUrl)
        addRecent(cleaned)
        if let cb = openProjectCallback {
            DispatchQueue.main.async { cb(cleaned) }
        } else {
            print("[DevClientBridge] openProjectFromNative: no dev host registered url=\(cleaned)")
        }
    }

    static func attach(_ controller: UIViewController, session: RayactEngineSession) {
        activeViewController = controller
        activeSession = session
    }

    static func detach(_ controller: UIViewController, session: RayactEngineSession? = nil) {
        if activeViewController === controller { activeViewController = nil }
        if let session {
            if activeSession === session { activeSession = nil }
            if launcherSession === session { launcherSession = nil }
        }
    }

    static func savedDevServerUrl() -> String? {
        prefs.string(forKey: keyUrl).map(cleanUrl)
    }

    static func handle(method: String, data: [String: Any]?) -> Any? {
        switch method {
        case "setDevServerUrl":
            guard let url = data?["url"] as? String else { return nil }
            let cleaned = cleanUrl(url)
            print("[DevClientBridge] setDevServerUrl url=\(cleaned)")
            prefs.set(cleaned, forKey: keyUrl)
            addRecent(cleaned)
            return nil
        case "toggleDevMenu":
            let session = (activeSession ?? launcherSession).flatMap { $0.isAlive() ? $0 : nil }
            session?.nativeToggleDevMenu()
            return nil
        case "getDevServerUrl":
            return savedDevServerUrl() ?? ""
        case "getRecentEntries":
            return recentEntriesJson()
        case "removeRecentUrl":
            guard let url = data?["url"] as? String else { return nil }
            let recent = recentList().filter { $0 != url }
            if let jsonData = try? JSONSerialization.data(withJSONObject: recent),
               let json = String(data: jsonData, encoding: .utf8) {
                prefs.set(json, forKey: keyRecent)
            }
            return nil
        case "getDiscoveredServers":
            discoveryLock.lock()
            let values = Array(discovered.values)
            discoveryLock.unlock()
            guard let jsonData = try? JSONSerialization.data(withJSONObject: values),
                  let json = String(data: jsonData, encoding: .utf8) else { return "[]" }
            return json
        case "startDiscovery":
            startDiscovery()
            return nil
        case "stopDiscovery":
            stopDiscovery()
            return nil
        case "openProjectDirect":
            guard let url = (data?["url"] as? String).map(cleanUrl), !url.isEmpty else {
                return errorJson("Invalid server URL")
            }
            print("[DevClientBridge] openProjectDirect url=\(url)")
            return validateAndOpenProject(url: url)
        case "reloadWithProjectBundle":
            if let url = prefs.string(forKey: keyUrl), !url.isEmpty {
                print("[DevClientBridge] reloadWithProjectBundle url=\(url)")
                reloadCurrentProject()
            }
            return nil
        case "getAppInfo":
            return appInfoJson()
        case "getConnectError":
            return DevServerLoader.lastError ?? ""
        case "isConnectLoading":
            return DevServerLoader.loading
        case "scanQR":
            startQrScan()
            return nil
        default:
            return nil
        }
    }

    fileprivate static func noteDiscovered(name: String, entry: [String: Any]) {
        discoveryLock.lock()
        discovered[name] = entry
        discoveryLock.unlock()
    }

    fileprivate static func removeDiscovered(name: String) {
        discoveryLock.lock()
        discovered.removeValue(forKey: name)
        discoveryLock.unlock()
    }

    private static func cleanUrl(_ url: String) -> String {
        url.replacingOccurrences(of: "\\/", with: "/").trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func recentList() -> [String] {
        guard let raw = prefs.string(forKey: keyRecent),
              let data = raw.data(using: .utf8),
              let arr = try? JSONSerialization.jsonObject(with: data) as? [String] else {
            return []
        }
        return arr.map(cleanUrl).uniqued()
    }

    private static func recentEntriesJson() -> String {
        let entries = recentList().map { ["url": $0] }
        guard let data = try? JSONSerialization.data(withJSONObject: entries),
              let json = String(data: data, encoding: .utf8) else { return "[]" }
        return json
    }

    private static func addRecent(_ url: String) {
        var list = recentList().filter { $0 != url }
        list.insert(url, at: 0)
        if list.count > 10 { list = Array(list.prefix(10)) }
        if let data = try? JSONSerialization.data(withJSONObject: list),
           let json = String(data: data, encoding: .utf8) {
            prefs.set(json, forKey: keyRecent)
        }
    }

    private static func appInfoJson() -> String {
        let info: [String: Any] = [
            "bundleId": Bundle.main.bundleIdentifier ?? "com.rayact.ios",
            "nativeAppVersion": Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0.1.0",
            "rayactVersion": "0.1.0",
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: info),
              let json = String(data: data, encoding: .utf8) else { return "{}" }
        return json
    }

    private static func errorJson(_ message: String) -> String {
        let obj: [String: Any] = ["ok": false, "error": message]
        guard let data = try? JSONSerialization.data(withJSONObject: obj),
              let json = String(data: data, encoding: .utf8) else { return "{\"ok\":false}" }
        return json
    }

    private static func validateAndOpenProject(url: String) -> String {
        let cleaned = DevServerLoader.normalizeBase(cleanUrl(url))
        guard !cleaned.isEmpty, DevServerLoader.probeManifest(baseUrl: cleaned) else {
            return errorJson("Invalid server URL")
        }
        openProjectFromNative(url: cleaned)
        let obj: [String: Any] = ["ok": true, "url": cleaned]
        guard let data = try? JSONSerialization.data(withJSONObject: obj),
              let json = String(data: data, encoding: .utf8) else { return "{\"ok\":true}" }
        return json
    }

    private static func startDiscovery() {
        stopDiscovery()
        discoveryLock.lock()
        discovered.removeAll()
        discoveryLock.unlock()
        let b = NetServiceBrowser()
        b.delegate = DiscoveryDelegate.shared
        b.searchForServices(ofType: serviceType, inDomain: "")
        browser = b
    }

    private static func stopDiscovery() {
        browser?.stop()
        browser = nil
    }

    fileprivate static func noteResolvedService(_ service: NetService) {
        guard let host = service.hostName?.trimmingCharacters(in: CharacterSet(charactersIn: ".")),
              !host.contains(":") else { return }
        let entry: [String: Any] = [
            "url": "http://\(host):\(service.port)",
            "name": service.name,
            "appKey": "",
        ]
        noteDiscovered(name: service.name, entry: entry)
    }

    private static func startQrScan() {
        guard let vc = activeViewController ?? devHostViewController else {
            print("[DevClientBridge] scanQR: no live view controller")
            return
        }
        DispatchQueue.main.async {
            let scanner = QRScannerViewController()
            scanner.onResult = { raw in
                DispatchQueue.global(qos: .userInitiated).async {
                    let candidates = parseQrCandidates(raw)
                    let best = pickBestServer(candidates) ?? candidates.first
                    if let best {
                        print("[DevClientBridge] scanQR chose \(best) from \(candidates)")
                        openProjectFromNative(url: best)
                    } else {
                        print("[DevClientBridge] scanQR: no candidates in '\(raw)'")
                    }
                }
            }
            scanner.modalPresentationStyle = .fullScreen
            vc.present(scanner, animated: true)
        }
    }

    private static func parseQrCandidates(_ raw: String) -> [String] {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: "\\/", with: "/")
        if trimmed.hasPrefix("["),
           let data = trimmed.data(using: .utf8),
           let arr = try? JSONSerialization.jsonObject(with: data) as? [String] {
            let out = arr.map { DevServerLoader.normalizeBase($0.trimmingCharacters(in: .whitespacesAndNewlines)) }.filter { !$0.isEmpty }
            if !out.isEmpty { return Array(Set(out)) }
        }
        return [DevServerLoader.normalizeBase(trimmed)]
    }

    private static func pickBestServer(_ candidates: [String]) -> String? {
        if candidates.count <= 1 {
            guard let only = candidates.first else { return nil }
            return DevServerLoader.probeManifest(baseUrl: only) ? only : nil
        }
        let group = DispatchGroup()
        let lock = NSLock()
        var winner: String?
        for candidate in candidates {
            group.enter()
            DispatchQueue.global(qos: .userInitiated).async {
                if DevServerLoader.probeManifest(baseUrl: candidate) {
                    lock.lock()
                    if winner == nil { winner = candidate }
                    lock.unlock()
                }
                group.leave()
            }
        }
        _ = group.wait(timeout: .now() + 3)
        return winner
    }
}

private final class DiscoveryDelegate: NSObject, NetServiceBrowserDelegate, NetServiceDelegate {
    static let shared = DiscoveryDelegate()

    func netServiceBrowser(_ browser: NetServiceBrowser, didFind service: NetService, moreComing: Bool) {
        service.delegate = self
        service.resolve(withTimeout: 5)
    }

    func netServiceBrowser(_ browser: NetServiceBrowser, didRemove service: NetService, moreComing: Bool) {
        DevClientBridge.removeDiscovered(name: service.name)
    }

    func netServiceDidResolveAddress(_ sender: NetService) {
        DevClientBridge.noteResolvedService(sender)
    }
}

private extension Array where Element: Hashable {
    func uniqued() -> [Element] {
        var seen = Set<Element>()
        return filter { seen.insert($0).inserted }
    }
}

func devCallFromNative(method: String, dataJson: String?) -> String {
    let data: [String: Any]? = dataJson.flatMap { raw in
        guard !raw.isEmpty, let bytes = raw.data(using: .utf8) else { return nil }
        return try? JSONSerialization.jsonObject(with: bytes) as? [String: Any]
    }
    switch DevClientBridge.handle(method: method, data: data) {
    case nil:
        return "null"
    case let s as String:
        if s.hasPrefix("[") || s.hasPrefix("{") { return s }
        if let data = try? JSONEncoder().encode(s),
           let quoted = String(data: data, encoding: .utf8) { return quoted }
        return "\"\(s)\""
    case let b as Bool:
        return b ? "true" : "false"
    case let value:
        if JSONSerialization.isValidJSONObject(value),
           let data = try? JSONSerialization.data(withJSONObject: value),
           let json = String(data: data, encoding: .utf8) {
            return json
        }
        return "null"
    }
}

private final class QRScannerViewController: UIViewController, AVCaptureVideoDataOutputSampleBufferDelegate {
    var onResult: ((String) -> Void)?

    private let captureSession = AVCaptureSession()
    private let queue = DispatchQueue(label: "com.rayact.qrscan")
    private var handled = false

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black

        guard let device = AVCaptureDevice.default(for: .video),
              let input = try? AVCaptureDeviceInput(device: device) else { return }
        captureSession.addInput(input)
        let output = AVCaptureVideoDataOutput()
        output.setSampleBufferDelegate(self, queue: queue)
        captureSession.addOutput(output)

        let preview = AVCaptureVideoPreviewLayer(session: captureSession)
        preview.videoGravity = .resizeAspectFill
        preview.frame = view.bounds
        view.layer.addSublayer(preview)

        let cancel = UIButton(type: .system)
        cancel.setTitle("Cancel", for: .normal)
        cancel.tintColor = .white
        cancel.translatesAutoresizingMaskIntoConstraints = false
        cancel.addTarget(self, action: #selector(cancelTapped), for: .touchUpInside)
        view.addSubview(cancel)
        NSLayoutConstraint.activate([
            cancel.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 16),
            cancel.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
        ])
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        (view.layer.sublayers?.first { $0 is AVCaptureVideoPreviewLayer })?.frame = view.bounds
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        queue.async { self.captureSession.startRunning() }
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        queue.async { self.captureSession.stopRunning() }
    }

    @objc private func cancelTapped() {
        dismiss(animated: true)
    }

    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        guard !handled else { return }
        guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        let request = VNDetectBarcodesRequest { [weak self] req, _ in
            guard let self, !self.handled,
                  let results = req.results as? [VNBarcodeObservation],
                  let payload = results.first(where: { $0.symbology == .qr })?.payloadStringValue,
                  !payload.isEmpty else { return }
            self.handled = true
            DispatchQueue.main.async {
                self.dismiss(animated: true) {
                    self.onResult?(payload)
                }
            }
        }
        request.symbologies = [.qr]
        try? VNImageRequestHandler(cvPixelBuffer: pixelBuffer, options: [:]).perform([request])
    }
}
