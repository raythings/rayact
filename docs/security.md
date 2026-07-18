# Security

Install only published `0.0.3` tarballs represented in the signed release set.
Rayact verifies native artifact SHA-256 values during prebuild; release CI also
checks provenance, SBOM/license policy, vulnerabilities, and reproducibility.
Never bypass an ABI or checksum failure.

Optional modules are least-privilege packages: generic engines contain no MMKV,
Secure Store, or crash-reporter registrations. Crash uploads require HTTPS and
explicit runtime consent. Secrets belong in `@rayact/secure-store`, not built-in
plain KV, logs, config files, or crash messages.

Report vulnerabilities privately through the repository security advisory
channel. Rayact acknowledges reports within two business days, triages within
five, and targets critical fixes within seven days. Avoid opening a public issue
until a coordinated fix is available.
