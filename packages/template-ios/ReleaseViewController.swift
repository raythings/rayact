import UIKit

final class ReleaseViewController: UIViewController {
    private var session: RayactEngineSession?
    private var navigationHost: NavigationHost?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        let dataPath = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!.path
        guard let session = RayactEngineSession.create(dataPath: dataPath) else {
            fatalError("Failed to create Rayact engine session")
        }
        self.session = session
        let host = NavigationHost(session: session, parent: self)
        host.installRoot(RayactSurfaceView(session: session))
        host.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(host)
        NSLayoutConstraint.activate([
            host.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            host.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            host.topAnchor.constraint(equalTo: view.topAnchor),
            host.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
        navigationHost = host

        let loaded: Bool
        if let url = Bundle.main.url(forResource: "app", withExtension: "qjsbc"),
           let data = try? Data(contentsOf: url), !data.isEmpty {
            loaded = session.loadBytecode(data)
        } else if let url = Bundle.main.url(forResource: "app", withExtension: "js"),
                  let source = try? String(contentsOf: url, encoding: .utf8) {
            loaded = session.loadSource(source)
        } else {
            loaded = false
        }
        precondition(loaded, "Failed to load embedded Rayact project")
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        session?.acquireGraphics()
    }

    override func viewWillDisappear(_ animated: Bool) {
        session?.releaseGraphics()
        super.viewWillDisappear(animated)
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        navigationHost?.syncSurfacesToCurrentLayout()
    }

    deinit {
        navigationHost?.dispose()
        session?.destroy()
    }
}
