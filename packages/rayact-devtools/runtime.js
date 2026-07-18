// This module is intentionally tiny. Native development hosts install these
// hooks; production bundles never import this package.
export function registerEvaluatedScript(url, source) {
  const register = globalThis.__rayactRegisterDevScript;
  if (typeof register === 'function') register(String(url), String(source));
}

export function notifyDocumentCommit() {
  globalThis.__rayactNotifyDevtoolsCommit?.();
}

export function reportHostMetadata(nodeId, metadata) {
  globalThis.__rayactSetInspectorMetadata?.(nodeId, metadata);
}
