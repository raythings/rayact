import UIKit

final class NavigationHost: UIView {
    private let session: RayactEngineSession
    weak var parentController: UIViewController?

    private(set) var rootSurfaceId = 0
    private var rootSurfaceView: RayactSurfaceView?
    private var screensBySurfaceId: [Int: RayactScreenViewController] = [:]
    private var childScreens: [RayactScreenViewController] = []

    var engineSession: RayactEngineSession { session }
    var host: RayactHost { session.host }

    init(session: RayactEngineSession, parent: UIViewController) {
        self.session = session
        self.parentController = parent
        super.init(frame: .zero)
        session.host.setNavigationHost(self)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        if window != nil {
            session.host.setNavigationHost(self)
        }
    }

    override func willMove(toWindow newWindow: UIWindow?) {
        if newWindow == nil {
            session.host.clearNavigationHost(self)
        }
        super.willMove(toWindow: newWindow)
    }

    func installRoot(_ root: RayactSurfaceView, onReady: ((Int) -> Void)? = nil) {
        guard root.superview !== self else { return }
        rootSurfaceView = root
        root.translatesAutoresizingMaskIntoConstraints = false
        addSubview(root)
        NSLayoutConstraint.activate([
            root.leadingAnchor.constraint(equalTo: leadingAnchor),
            root.trailingAnchor.constraint(equalTo: trailingAnchor),
            root.topAnchor.constraint(equalTo: topAnchor),
            root.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])
        root.onSurfaceReady = { [weak self] sid in
            guard let self else { return }
            self.rootSurfaceId = sid
            root.pushToFront()
            onReady?(sid)
        }
        if root.surfaceId > 0 {
            rootSurfaceId = root.surfaceId
            root.pushToFront()
            onReady?(root.surfaceId)
        }
    }

    func syncSurfacesToCurrentLayout() {
        setNeedsLayout()
        layoutIfNeeded()
        rootSurfaceView?.syncSurfaceSizeFromLayout()
        for screen in childScreens {
            screen.rayactSurfaceView()?.syncSurfaceSizeFromLayout()
        }
    }

    @discardableResult
    func pushScreen() -> RayactScreenViewController {
        let screen = RayactScreenViewController(session: session)
        guard let parent = parentController else { return screen }
        parent.addChild(screen)
        screen.view.translatesAutoresizingMaskIntoConstraints = false
        addSubview(screen.view)
        NSLayoutConstraint.activate([
            screen.view.leadingAnchor.constraint(equalTo: leadingAnchor),
            screen.view.trailingAnchor.constraint(equalTo: trailingAnchor),
            screen.view.topAnchor.constraint(equalTo: topAnchor),
            screen.view.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])
        screen.didMove(toParent: parent)
        childScreens.append(screen)
        return screen
    }

    func noteSurfaceReady(_ screen: RayactScreenViewController, surfaceId: Int) {
        if surfaceId > 0 {
            screensBySurfaceId[surfaceId] = screen
        }
    }

    @discardableResult
    func popScreen() -> Bool {
        guard let entry = screensBySurfaceId.keys.sorted().last else { return false }
        return releaseSurface(surfaceId: entry)
    }

    func pushedCount() -> Int { screensBySurfaceId.count }

    @discardableResult
    func releaseSurface(surfaceId: Int) -> Bool {
        guard surfaceId > 0, surfaceId != rootSurfaceId else { return false }
        guard let screen = screensBySurfaceId.removeValue(forKey: surfaceId) else { return false }
        childScreens.removeAll { $0 === screen }
        screen.willMove(toParent: nil)
        screen.view.removeFromSuperview()
        screen.removeFromParent()
        return true
    }

    func orderSurfaces(surfaceIds: [Int]) {
        for surfaceId in surfaceIds {
            if surfaceId == rootSurfaceId {
                if let root = rootSurfaceView {
                    bringSubviewToFront(root)
                }
                continue
            }
            if let screen = screensBySurfaceId[surfaceId] {
                bringSubviewToFront(screen.view)
            }
        }
        setNeedsLayout()
    }

    func topFragmentSurfaceId() -> Int {
        screensBySurfaceId.keys.sorted().last ?? 0
    }
}
