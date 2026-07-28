import AVFoundation
import Foundation
import UIKit
import Vision

final class RayactBarcodeScannerRegistration: RayactPlatformModuleRegistration {
    private let scanner = RayactBarcodeScannerModule()

    func register(with registry: RayactPlatformRegistry) {
        registry.registerModule("barcode-scanner") { [scanner] method, payload, completion in
            switch method {
            case "isAvailable":
                #if targetEnvironment(simulator)
                completion(.success(Data("false".utf8)))
                #else
                completion(.success(Data((AVCaptureDevice.default(for: .video) != nil ? "true" : "false").utf8)))
                #endif
            case "startScan":
                scanner.start(payload: payload)
                completion(.success(Data("true".utf8)))
            case "pollScan":
                completion(.success(Data(scanner.state.utf8)))
            default:
                completion(.failure(NSError(
                    domain: "RayactBarcodeScanner",
                    code: 1,
                    userInfo: [NSLocalizedDescriptionKey: "Unknown barcode-scanner method '\(method)'"]
                )))
            }
        }
    }
}

private final class RayactBarcodeScannerModule {
    private let lock = NSLock()
    private var stateStorage = #"{"status":"idle"}"#

    var state: String {
        lock.lock()
        defer { lock.unlock() }
        return stateStorage
    }

    func start(payload: Data) {
        guard status != "pending" else {
            setState(["status": "error", "error": "A barcode scan is already in progress"])
            return
        }
        let object = (try? JSONSerialization.jsonObject(with: payload)) as? [String: Any]
        let formats = (object?["formats"] as? [String]) ?? []
        setState(["status": "pending"])
        DispatchQueue.main.async { [weak self] in
            self?.requestPermissionAndPresent(formats: formats)
        }
    }

    private var status: String {
        guard let data = state.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return "error"
        }
        return object["status"] as? String ?? "error"
    }

    private func requestPermissionAndPresent(formats: [String]) {
        #if targetEnvironment(simulator)
        setState(["status": "error", "error": "Barcode scanning requires a physical iOS device"])
        #else
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            present(formats: formats)
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
                DispatchQueue.main.async {
                    if granted {
                        self?.present(formats: formats)
                    } else {
                        self?.setState(["status": "error", "error": "Camera permission was denied"])
                    }
                }
            }
        case .denied, .restricted:
            setState(["status": "error", "error": "Camera permission is unavailable or denied"])
        @unknown default:
            setState(["status": "error", "error": "Camera permission status is unsupported"])
        }
        #endif
    }

    private func present(formats: [String]) {
        guard let presenter = RayactPlatformRegistry.foregroundViewController() else {
            setState(["status": "error", "error": "No foreground view controller is available"])
            return
        }
        let scanner = RayactBarcodeScannerViewController(formats: formats)
        scanner.onResult = { [weak self] data, format in
            self?.setState(["status": "success", "data": data, "format": format])
        }
        scanner.onCancel = { [weak self] in
            self?.setState(["status": "canceled"])
        }
        scanner.onError = { [weak self] message in
            self?.setState(["status": "error", "error": message])
        }
        scanner.modalPresentationStyle = .fullScreen
        presenter.present(scanner, animated: true)
    }

    private func setState(_ value: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: value),
              let json = String(data: data, encoding: .utf8) else { return }
        lock.lock()
        stateStorage = json
        lock.unlock()
    }
}

private final class RayactBarcodeScannerViewController:
    UIViewController,
    AVCaptureVideoDataOutputSampleBufferDelegate
{
    var onResult: ((String, String) -> Void)?
    var onCancel: (() -> Void)?
    var onError: ((String) -> Void)?

    private let captureSession = AVCaptureSession()
    private let queue = DispatchQueue(label: "dev.rayact.barcode-scanner")
    private let symbologies: [VNBarcodeSymbology]
    private var previewLayer: AVCaptureVideoPreviewLayer?
    private var handled = false

    init(formats: [String]) {
        symbologies = Self.symbologies(for: formats)
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        guard let device = AVCaptureDevice.default(for: .video) else {
            finishWithFailure("No camera is available")
            return
        }
        do {
            let input = try AVCaptureDeviceInput(device: device)
            guard captureSession.canAddInput(input) else {
                finishWithFailure("Camera input is unavailable")
                return
            }
            captureSession.addInput(input)
        } catch {
            finishWithFailure(error.localizedDescription)
            return
        }

        let output = AVCaptureVideoDataOutput()
        guard captureSession.canAddOutput(output) else {
            finishWithFailure("Camera output is unavailable")
            return
        }
        output.setSampleBufferDelegate(self, queue: queue)
        captureSession.addOutput(output)

        let preview = AVCaptureVideoPreviewLayer(session: captureSession)
        preview.videoGravity = .resizeAspectFill
        preview.frame = view.bounds
        view.layer.addSublayer(preview)
        previewLayer = preview

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
        previewLayer?.frame = view.bounds
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        queue.async { [captureSession] in captureSession.startRunning() }
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        queue.async { [captureSession] in captureSession.stopRunning() }
    }

    @objc private func cancelTapped() {
        guard !handled else { return }
        handled = true
        dismiss(animated: true) { self.onCancel?() }
    }

    func captureOutput(
        _ output: AVCaptureOutput,
        didOutput sampleBuffer: CMSampleBuffer,
        from connection: AVCaptureConnection
    ) {
        guard !handled, let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        let request = VNDetectBarcodesRequest { [weak self] request, error in
            guard let self, !self.handled else { return }
            if let error {
                self.finishWithFailure(error.localizedDescription)
                return
            }
            guard let observation = (request.results as? [VNBarcodeObservation])?.first,
                  let payload = observation.payloadStringValue,
                  !payload.isEmpty else { return }
            self.handled = true
            let format = Self.formatName(observation.symbology)
            DispatchQueue.main.async {
                self.dismiss(animated: true) {
                    self.onResult?(payload, format)
                }
            }
        }
        request.symbologies = symbologies
        do {
            try VNImageRequestHandler(cvPixelBuffer: pixelBuffer, options: [:]).perform([request])
        } catch {
            finishWithFailure(error.localizedDescription)
        }
    }

    private func finishWithFailure(_ message: String) {
        guard !handled else { return }
        handled = true
        DispatchQueue.main.async {
            self.dismiss(animated: true) {
                self.onError?(message)
            }
        }
    }

    private static func symbologies(for formats: [String]) -> [VNBarcodeSymbology] {
        let mapped = formats.compactMap { format -> VNBarcodeSymbology? in
            switch format {
            case "aztec": return .aztec
            case "codabar": return .codabar
            case "code128": return .code128
            case "code39": return .code39
            case "code93": return .code93
            case "dataMatrix": return .dataMatrix
            case "ean13", "upcA": return .ean13
            case "ean8": return .ean8
            case "itf": return .i2of5
            case "pdf417": return .pdf417
            case "qr": return .qr
            case "upcE": return .upce
            default: return nil
            }
        }
        return mapped.isEmpty
            ? [.qr, .aztec, .codabar, .code128, .code39, .code93, .dataMatrix,
               .ean13, .ean8, .i2of5, .pdf417, .upce]
            : Array(Set(mapped))
    }

    private static func formatName(_ symbology: VNBarcodeSymbology) -> String {
        switch symbology {
        case .aztec: return "aztec"
        case .codabar: return "codabar"
        case .code128: return "code128"
        case .code39, .code39Checksum, .code39FullASCII, .code39FullASCIIChecksum: return "code39"
        case .code93, .code93i: return "code93"
        case .dataMatrix: return "dataMatrix"
        case .ean13: return "ean13"
        case .ean8: return "ean8"
        case .i2of5, .i2of5Checksum, .itf14: return "itf"
        case .pdf417, .microPDF417: return "pdf417"
        case .qr, .microQR: return "qr"
        case .upce: return "upcE"
        default: return "unknown"
        }
    }
}
