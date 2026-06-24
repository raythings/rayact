import UIKit

final class RayactScreenViewController: UIViewController {
    private let session: RayactEngineSession
    private var surfaceView: RayactSurfaceView?

    private(set) var surfaceId = 0
    var onSurfaceReady: ((Int) -> Void)?
    private var surfaceReadyFired = false

    init(session: RayactEngineSession) {
        self.session = session
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func rayactSurfaceView() -> RayactSurfaceView? { surfaceView }

    override func loadView() {
        let view = RayactSurfaceView(session: session)
        view.onSurfaceReady = { [weak self] sid in
            guard let self, !self.surfaceReadyFired, sid > 0 else { return }
            self.surfaceReadyFired = true
            self.surfaceId = sid
            view.pushToFront()
            self.onSurfaceReady?(sid)
        }
        surfaceView = view
        self.view = view
    }
}
