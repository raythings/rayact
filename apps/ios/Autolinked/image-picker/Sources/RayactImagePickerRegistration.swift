import Foundation
import PhotosUI
import UIKit
import UniformTypeIdentifiers

final class RayactImagePickerRegistration: RayactPlatformModuleRegistration {
    private let picker = RayactImagePickerModule()

    func register(with registry: RayactPlatformRegistry) {
        registry.registerModule("image-picker") { [picker] method, payload, completion in
            switch method {
            case "requestPermission":
                completion(.success(Data(
                    #"{"granted":true,"canAskAgain":true,"status":"granted"}"#.utf8
                )))
            case "startPicker":
                let options = (try? JSONSerialization.jsonObject(with: payload)) as? [String: Any]
                picker.start(includeBase64: options?["base64"] as? Bool ?? false)
                completion(.success(Data("true".utf8)))
            case "pollPicker":
                completion(.success(Data(picker.state.utf8)))
            default:
                completion(.failure(NSError(
                    domain: "RayactImagePicker",
                    code: 1,
                    userInfo: [NSLocalizedDescriptionKey: "Unknown image-picker method '\(method)'"]
                )))
            }
        }
    }
}

private final class RayactImagePickerModule {
    private let lock = NSLock()
    private var stateStorage = #"{"status":"idle"}"#
    private var delegate: RayactImagePickerDelegate?

    var state: String {
        lock.lock()
        defer { lock.unlock() }
        return stateStorage
    }

    func start(includeBase64: Bool) {
        setState(["status": "pending"])
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            guard let presenter = RayactPlatformRegistry.foregroundViewController() else {
                self.setState(["status": "error", "error": "No foreground view controller is available"])
                return
            }
            var configuration = PHPickerConfiguration(photoLibrary: .shared())
            configuration.filter = .images
            configuration.selectionLimit = 1
            let picker = PHPickerViewController(configuration: configuration)
            let delegate = RayactImagePickerDelegate(includeBase64: includeBase64) { [weak self] result in
                self?.setState(result)
                self?.delegate = nil
            }
            self.delegate = delegate
            picker.delegate = delegate
            presenter.present(picker, animated: true)
        }
    }

    private func setState(_ value: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: value),
              let json = String(data: data, encoding: .utf8) else { return }
        lock.lock()
        stateStorage = json
        lock.unlock()
    }
}

private final class RayactImagePickerDelegate: NSObject, PHPickerViewControllerDelegate {
    private let includeBase64: Bool
    private let complete: ([String: Any]) -> Void

    init(includeBase64: Bool, complete: @escaping ([String: Any]) -> Void) {
        self.includeBase64 = includeBase64
        self.complete = complete
    }

    func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        picker.dismiss(animated: true)
        guard let result = results.first else {
            complete(["status": "canceled"])
            return
        }
        let provider = result.itemProvider
        guard let type = provider.registeredTypeIdentifiers.first(where: {
            UTType($0)?.conforms(to: .image) == true
        }) else {
            complete(["status": "error", "error": "Selected item is not an image"])
            return
        }
        provider.loadDataRepresentation(forTypeIdentifier: type) { [includeBase64, complete] data, error in
            guard let data, let image = UIImage(data: data) else {
                complete([
                    "status": "error",
                    "error": error?.localizedDescription ?? "Unable to decode selected image",
                ])
                return
            }
            let ext = UTType(type)?.preferredFilenameExtension ?? "img"
            let fileName = provider.suggestedName.map { "\($0).\(ext)" } ?? "image.\(ext)"
            let url = FileManager.default.temporaryDirectory
                .appendingPathComponent(UUID().uuidString)
                .appendingPathExtension(ext)
            do {
                try data.write(to: url, options: .atomic)
                var asset: [String: Any] = [
                    "uri": url.absoluteString,
                    "mimeType": UTType(type)?.preferredMIMEType ?? "image/*",
                    "width": Int(image.size.width * image.scale),
                    "height": Int(image.size.height * image.scale),
                    "fileName": fileName,
                ]
                if includeBase64 { asset["base64"] = data.base64EncodedString() }
                complete(["status": "success", "assets": [asset]])
            } catch {
                complete(["status": "error", "error": error.localizedDescription])
            }
        }
    }
}
