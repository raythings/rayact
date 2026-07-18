# Crash reporting and privacy

`@rayact/crash-reporter` is local-only by default. Upload requires `mode: "upload"`, an HTTPS endpoint, and explicit runtime consent set to `granted`; unknown or denied consent sends no traffic.

Envelopes use an allowlist and are capped at 64 KiB. Query strings, local user/project paths, emails, IP addresses, and token-like values are removed. Source text, logs, input values, and device/user identifiers are not envelope fields. Upload retries are bounded and stop at the first report that cannot be delivered.

Native signal handling writes one fixed 16-byte marker to a descriptor opened before handlers are installed. The following launch consumes that marker and creates the local report.
