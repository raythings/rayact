# @rayact/crash-reporter

Privacy-first crash storage for Rayact. Reports stay local unless upload mode is configured with HTTPS and runtime consent is explicitly granted.

```sh
npm install @rayact/crash-reporter@0.0.3
```

```ts
import {
  configureCrashReporter,
  setCrashConsent,
  listCrashReports,
  exportCrashReport,
  deleteCrashReport,
  flushCrashReports,
} from '@rayact/crash-reporter';

configureCrashReporter({ mode: 'local' });
setCrashConsent('denied');
```

Upload mode requires an HTTPS endpoint and `setCrashConsent('granted')` at
runtime. Unknown or denied consent sends no traffic. Envelopes are allowlisted,
redacted, and capped at 64 KiB; native signal handlers write only a fixed
16-byte marker to a pre-opened file descriptor for recovery on the next launch.
See the [crash privacy guide](https://rayact.dev/crash-reporting).

## License

MIT
