import UIKit

final class DevMenuOverlay {
    private let host: NavigationHost
    private let session: RayactEngineSession
    private let panel = UIStackView()
    private let serverLabel = UILabel()

    init(host: NavigationHost, session: RayactEngineSession) {
        self.host = host
        self.session = session

        panel.axis = .vertical
        panel.spacing = 8
        panel.backgroundColor = UIColor(white: 0.12, alpha: 0.93)
        panel.layoutMargins = UIEdgeInsets(top: 24, left: 24, bottom: 24, right: 24)
        panel.isLayoutMarginsRelativeArrangement = true
        panel.layer.cornerRadius = 12
        panel.isHidden = true
        panel.translatesAutoresizingMaskIntoConstraints = false

        let title = UILabel()
        title.text = "Dev Menu"
        title.textColor = .white
        title.font = .systemFont(ofSize: 16, weight: .semibold)

        serverLabel.textColor = UIColor(white: 0.69, alpha: 1)
        serverLabel.font = .systemFont(ofSize: 11)
        serverLabel.numberOfLines = 0

        panel.addArrangedSubview(title)
        panel.addArrangedSubview(serverLabel)
        panel.addArrangedSubview(makeButton("Reload") { [weak self] in
            self?.hide()
            DevClientBridge.reloadCurrentProject()
        })
        panel.addArrangedSubview(makeButton("Back to launcher") { [weak self] in
            self?.hide()
            DevClientBridge.showLauncher()
        })
        panel.addArrangedSubview(makeButton("Close") { [weak self] in
            self?.hide()
        })

        host.addSubview(panel)
        NSLayoutConstraint.activate([
            panel.trailingAnchor.constraint(equalTo: host.trailingAnchor, constant: -24),
            panel.bottomAnchor.constraint(equalTo: host.safeAreaLayoutGuide.bottomAnchor, constant: -96),
            panel.widthAnchor.constraint(lessThanOrEqualToConstant: 280),
        ])
    }

    private func makeButton(_ title: String, action: @escaping () -> Void) -> UIButton {
        var config = UIButton.Configuration.gray()
        config.title = title
        let button = UIButton(configuration: config)
        button.addAction(UIAction { _ in action() }, for: .touchUpInside)
        return button
    }

    func toggle() {
        panel.isHidden ? show() : hide()
    }

    func show() {
        serverLabel.text = "Server: \(DevClientBridge.savedDevServerUrl() ?? "")"
        panel.isHidden = false
    }

    func hide() {
        panel.isHidden = true
    }
}
