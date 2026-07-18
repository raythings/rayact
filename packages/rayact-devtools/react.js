export const REACT_DEVTOOLS_BACKEND_SETUP_ID = 'virtual:rayact-react-devtools-backend';

export function reactDevtoolsBackendSource() {
  return String.raw`
import * as ReactDevToolsBackendModule from 'react-devtools-core';
const ReactDevToolsBackend = ReactDevToolsBackendModule.default || ReactDevToolsBackendModule;
const { initialize, connectWithCustomMessagingProtocol } = ReactDevToolsBackend;
class EventScope {
  constructor() { this.listeners = new Set(); }
  addEventListener(listener) { this.listeners.add(listener); }
  removeEventListener(listener) { this.listeners.delete(listener); }
  emit(value) { for (const listener of this.listeners) listener(value); }
}
class Domain {
  constructor(name) { this.name = name; this.onMessage = new EventScope(); }
  sendMessage(message) {
    const binding = globalThis[dispatcher.BINDING_NAME];
    if (typeof binding !== 'function') throw new Error('React DevTools frontend binding is unavailable');
    binding(JSON.stringify({ domain: this.name, message }));
  }
}
const dispatcher = globalThis.__FUSEBOX_REACT_DEVTOOLS_DISPATCHER__ || {
  BINDING_NAME: '__CHROME_DEVTOOLS_FRONTEND_BINDING__', domains: new Map(),
  onDomainInitialization: new EventScope(),
  initializeDomain(name) { const domain = new Domain(name); this.domains.set(name, domain); this.onDomainInitialization.emit(domain); return domain; },
  sendMessage(name, serializedMessage) {
    const domain = this.domains.get(name);
    if (!domain) throw new Error('React DevTools domain is not initialized: ' + name);
    domain.onMessage.emit(JSON.parse(serializedMessage));
  }
};
globalThis.__FUSEBOX_REACT_DEVTOOLS_DISPATCHER__ = dispatcher;
if (!globalThis.__RAYACT_REACT_DEVTOOLS_INITIALIZED__) {
  globalThis.__RAYACT_REACT_DEVTOOLS_INITIALIZED__ = true;
  initialize(undefined, false, undefined);
}
let connectDomain = globalThis.__RAYACT_CONNECT_REACT_DEVTOOLS_DOMAIN__;
if (!connectDomain) {
  let disconnectBackend = null;
  connectDomain = function(domain) {
    if (disconnectBackend) disconnectBackend();
    disconnectBackend = connectWithCustomMessagingProtocol({
      onSubscribe(listener) { domain.onMessage.addEventListener(listener); },
      onUnsubscribe(listener) { domain.onMessage.removeEventListener(listener); },
      onMessage(event, payload) { domain.sendMessage({ event, payload }); },
      isReloadAndProfileSupported: false, isProfiling: false
    });
  };
  globalThis.__RAYACT_CONNECT_REACT_DEVTOOLS_DOMAIN__ = connectDomain;
  dispatcher.onDomainInitialization.addEventListener(domain => { if (domain.name === 'react-devtools') connectDomain(domain); });
}
if (typeof globalThis[dispatcher.BINDING_NAME] === 'function' && !dispatcher.domains.has('react-devtools')) {
  connectDomain(dispatcher.initializeDomain('react-devtools'));
}
`;
}
