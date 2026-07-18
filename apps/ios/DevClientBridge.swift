import AVFoundation
import Darwin
import Foundation
import UIKit
import Vision

enum DevClientBridge {
    static let extraDevServerUrl = "RAYACT_DEV_SERVER"
    private static let prefsName = "rayact_dev_client"
    private static let keyUrl = "dev_server_url"
    private static let keyRecent = "recent_urls"
    private static let keyDevToolsEnabled = "devtools_enabled"
    private static let serviceType = "_rayact._tcp."

    private static var prefs: UserDefaults { UserDefaults.standard }
    private static weak var activeViewController: UIViewController?
    private static weak var activeSession: RayactEngineSession?
    private static weak var launcherSession: RayactEngineSession?
    private static weak var devHostViewController: DevLauncherController?
    private static var openProjectCallback: ((String) -> Void)?
    private static var reloadProjectCallback: (() -> Void)?
    private static var showLauncherCallback: (() -> Void)?
    private static weak var projectDevToolsSession: RayactEngineSession?
    private static var projectDevToolsUrl = ""
    private static var projectBundleFormat = "js"

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

    static func bundledNativeModuleNames() -> Set<String> {
        let candidates = [
            Bundle.main.resourceURL?.appendingPathComponent("runtime/native-modules.json"),
            FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first?
                .appendingPathComponent("runtime/native-modules.json")
        ].compactMap { $0 }
        for url in candidates {
            guard let data = try? Data(contentsOf: url),
                  let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let modules = root["nativeModules"] as? [[String: Any]] else { continue }
            return Set(modules.compactMap { item in
                guard let name = item["name"] as? String, !name.isEmpty else { return nil }
                return name
            })
        }
        return []
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
            if projectDevToolsSession === session {
                projectDevToolsSession = nil
                projectDevToolsUrl = ""
                projectBundleFormat = "js"
            }
        }
    }

    static func configureProjectDevTools(session: RayactEngineSession, serverUrl: String, bundleFormat: String) {
        projectDevToolsSession = session
        projectDevToolsUrl = serverUrl
        projectBundleFormat = bundleFormat
        if bundleFormat == "qjsbc" {
            session.disableDevTools()
        } else if prefs.object(forKey: keyDevToolsEnabled) == nil || prefs.bool(forKey: keyDevToolsEnabled) {
            session.enableDevTools(serverUrl: serverUrl, title: "Rayact: \(serverUrl)")
        } else {
            session.disableDevTools()
        }
    }

    private static func devToolsStateJson() -> String {
        let forcedOff = projectBundleFormat == "qjsbc"
        let state: [String: Any] = [
            "enabled": !forcedOff && (projectDevToolsSession?.isDevToolsEnabled() == true),
            "forcedOff": forcedOff,
            "bundleFormat": projectBundleFormat,
            "reason": forcedOff ? "Rayact DevTools are disabled for bytecode projects to preserve performance." : "",
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: state) else { return "{}" }
        return String(data: data, encoding: .utf8) ?? "{}"
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
            let manifestValidated = data?["manifestValidated"] as? Bool == true
            print("[DevClientBridge] openProjectDirect url=\(url) manifestValidated=\(manifestValidated)")
            if manifestValidated {
                let cleaned = DevServerLoader.normalizeBase(url)
                openProjectFromNative(url: cleaned)
                let obj: [String: Any] = ["ok": true, "url": cleaned]
                guard let jsonData = try? JSONSerialization.data(withJSONObject: obj),
                      let json = String(data: jsonData, encoding: .utf8) else { return "{\"ok\":true}" }
                return json
            }
            return validateAndOpenProject(url: url)
        case "reloadWithProjectBundle":
            if let url = prefs.string(forKey: keyUrl), !url.isEmpty {
                print("[DevClientBridge] reloadWithProjectBundle url=\(url)")
                reloadCurrentProject()
            }
            return nil
        case "returnToLauncher":
            _ = showLauncher()
            return nil
        case "getAppInfo":
            return appInfoJson()
        case "openExternalUrl":
            guard let raw = data?["url"] as? String,
                  let url = URL(string: raw.trimmingCharacters(in: .whitespacesAndNewlines)),
                  let scheme = url.scheme?.lowercased(),
                  ["http", "https", "mailto"].contains(scheme) else { return false }
            DispatchQueue.main.async {
                UIApplication.shared.open(url, options: [:])
            }
            return true
        case "getPerformanceMetrics":
            return performanceMetricsJson()
        case "getDevToolsState":
            return devToolsStateJson()
        case "setDevToolsEnabled":
            let requested = data?["enabled"] as? Bool ?? false
            if projectBundleFormat != "qjsbc" {
                prefs.set(requested, forKey: keyDevToolsEnabled)
                if let session = projectDevToolsSession, session.isAlive() {
                    if requested { session.enableDevTools(serverUrl: projectDevToolsUrl, title: "Rayact: \(projectDevToolsUrl)") }
                    else { session.disableDevTools() }
                }
            }
            return devToolsStateJson()
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
            "bundleId": Bundle.main.bundleIdentifier ?? "com.rayact.app",
            "nativeAppVersion": Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0.0.3",
            "rayactVersion": "0.0.3",
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: info),
              let json = String(data: data, encoding: .utf8) else { return "{}" }
        return json
    }

    private static func performanceMetricsJson() -> String {
        var metrics: [String: Any] = [
            "cpuPercent": processCpuPercent(),
            "memoryMb": processMemoryMb(),
            "gpuBackend": "Metal",
        ]
        // -1 before the first frame's command buffer has completed (or, in
        // principle, on a Metal driver that never fills GPUStartTime/EndTime)
        // — omit rather than report a bogus 0/negative value.
        let gpuMs = RayactNativeBridge.getGpuFrameTimeMs()
        if gpuMs >= 0 { metrics["gpuFrameTimeMs"] = gpuMs }
        if let namePtr = RayactNativeBridge.getGpuDeviceNamePtr() {
            let name = String(cString: namePtr)
            if !name.isEmpty { metrics["gpuDeviceName"] = name }
        }
        guard let data = try? JSONSerialization.data(withJSONObject: metrics),
              let json = String(data: data, encoding: .utf8) else { return "{}" }
        return json
    }

    private static func processCpuPercent() -> Double {
        var threads: thread_act_array_t?
        var count: mach_msg_type_number_t = 0
        guard task_threads(mach_task_self_, &threads, &count) == KERN_SUCCESS,
              let threads else { return 0 }
        defer {
            vm_deallocate(mach_task_self_, vm_address_t(UInt(bitPattern: threads)),
                          vm_size_t(count) * vm_size_t(MemoryLayout<thread_t>.size))
        }
        var total = 0.0
        for index in 0..<Int(count) {
            var info = thread_basic_info()
            var infoCount = mach_msg_type_number_t(MemoryLayout<thread_basic_info>.size / MemoryLayout<natural_t>.size)
            let result = withUnsafeMutablePointer(to: &info) { pointer in
                pointer.withMemoryRebound(to: integer_t.self, capacity: Int(infoCount)) {
                    thread_info(threads[index], thread_flavor_t(THREAD_BASIC_INFO), $0, &infoCount)
                }
            }
            if result == KERN_SUCCESS && (info.flags & TH_FLAGS_IDLE) == 0 {
                total += Double(info.cpu_usage) / Double(TH_USAGE_SCALE) * 100
            }
        }
        return min(100, max(0, total / Double(max(1, ProcessInfo.processInfo.activeProcessorCount))))
    }

    private static func processMemoryMb() -> Double {
        var info = task_vm_info_data_t()
        var count = mach_msg_type_number_t(MemoryLayout<task_vm_info_data_t>.size / MemoryLayout<natural_t>.size)
        let result = withUnsafeMutablePointer(to: &info) { pointer in
            pointer.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
                task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), $0, &count)
            }
        }
        return result == KERN_SUCCESS ? Double(info.phys_footprint) / 1_048_576.0 : 0
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
        // NetService may resolve successfully without populating hostName on
        // the simulator. Use its resolved IPv4 socket address in that case so
        // Bonjour-discovered servers still reach the launcher list.
        let host = service.hostName?
            .trimmingCharacters(in: CharacterSet(charactersIn: "."))
        let resolvedHost = (host?.isEmpty == false && host?.contains(":") == false)
            ? host
            : ipv4Address(for: service)
        guard let resolvedHost, !resolvedHost.isEmpty else { return }

        let txt = service.txtRecordData().flatMap(NetService.dictionary(fromTXTRecord:)) ?? [:]
        let appKey = txt["appKey"].flatMap { String(data: $0, encoding: .utf8) } ?? ""
        let serverUrl = "http://\(resolvedHost):\(service.port)"
        let entry: [String: Any] = [
            "url": serverUrl,
            "name": service.name,
            "appKey": appKey,
        ]
        noteDiscovered(name: service.name, entry: entry)
        DevServerLoader.prefetch(baseUrl: serverUrl)
    }

    private static func ipv4Address(for service: NetService) -> String? {
        for data in service.addresses ?? [] {
            let value: String? = data.withUnsafeBytes { raw in
                guard let base = raw.baseAddress,
                      raw.count >= MemoryLayout<sockaddr_in>.size else { return nil }
                let address = base.assumingMemoryBound(to: sockaddr_in.self).pointee
                guard address.sin_family == sa_family_t(AF_INET) else { return nil }
                var sinAddr = address.sin_addr
                var buffer = [CChar](repeating: 0, count: Int(INET_ADDRSTRLEN))
                guard inet_ntop(AF_INET, &sinAddr, &buffer, socklen_t(INET_ADDRSTRLEN)) != nil else {
                    return nil
                }
                return String(cString: buffer)
            }
            if let value { return value }
        }
        return nil
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
