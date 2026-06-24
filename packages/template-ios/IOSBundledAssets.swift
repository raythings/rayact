import Foundation

enum IOSBundledAssets {
    private static let assetRootName = "runtime"
    private static let stampKey = "rayact_ios_bundled_assets_stamp"
    private static let appJsName = "app.js"

    static func extractIfNeeded() {
        let fm = FileManager.default
        guard let bundleRoot = Bundle.main.resourceURL?.appendingPathComponent(assetRootName, isDirectory: true) else {
            return
        }
        let stamp = bundleStamp(for: bundleRoot)
        let defaults = UserDefaults.standard
        if defaults.string(forKey: stampKey) == stamp, runtimeFilesPresent(), appJsPresent() {
            return
        }

        // The native engine loads these via filesystem paths relative to its
        // working directory (the Documents dir) — e.g. ./resources/fonts/
        // MaterialIcons-Regular.ttf for icons and ./css/* for importCSS. So the
        // bundle's `runtime/` contents must land directly in Documents, with the
        // `runtime/` prefix stripped (mirrors Android's RayactBundledAssets,
        // which strips its ASSET_ROOT prefix into filesDir). Keeping the prefix
        // left icons + CSS unresolvable (blank navbar, collapsed layout).
        let targetRoot = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!

        do {
            try copyTree(from: bundleRoot, to: targetRoot)
            defaults.set(stamp, forKey: stampKey)
        } catch {
            print("[rayact-ios] failed to extract bundled runtime assets: \(error)")
        }
    }

    private static func runtimeFilesPresent() -> Bool {
        let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
        let fonts = docs.appendingPathComponent("resources/fonts", isDirectory: true)
        return (try? FileManager.default.contentsOfDirectory(atPath: fonts.path))?.isEmpty == false
    }

    private static func appJsPresent() -> Bool {
        Bundle.main.url(forResource: "app", withExtension: "js") != nil
    }

    private static func bundleStamp(for url: URL) -> String {
        let resourceValues = try? url.resourceValues(forKeys: [.contentModificationDateKey, .fileSizeKey])
        let modified = resourceValues?.contentModificationDate?.timeIntervalSince1970 ?? 0
        let size = resourceValues?.fileSize ?? 0
        let appJsStamp: String
        if let appJs = Bundle.main.url(forResource: "app", withExtension: "js"),
           let values = try? appJs.resourceValues(forKeys: [.contentModificationDateKey, .fileSizeKey]) {
            appJsStamp = "\(values.contentModificationDate?.timeIntervalSince1970 ?? 0)-\(values.fileSize ?? 0)"
        } else {
            appJsStamp = "missing"
        }
        return "\(modified)-\(size)-\(appJsStamp)"
    }

    private static func copyTree(from source: URL, to destination: URL) throws {
        let fm = FileManager.default
        let contents = try fm.contentsOfDirectory(at: source, includingPropertiesForKeys: [.isDirectoryKey], options: [])
        for item in contents {
            let dest = destination.appendingPathComponent(item.lastPathComponent)
            let isDirectory = (try? item.resourceValues(forKeys: [.isDirectoryKey]).isDirectory) == true
            if isDirectory {
                try fm.createDirectory(at: dest, withIntermediateDirectories: true)
                try copyTree(from: item, to: dest)
            } else {
                try? fm.removeItem(at: dest)
                try fm.copyItem(at: item, to: dest)
            }
        }
    }
}
