import React from 'react';
import { View, useBackHandler } from '@rayact/react';
import { DevLauncherProvider } from './DevLauncherContext.js';
import { DevMenu } from './DevMenu.js';
import { useDevLauncher } from './DevLauncherContext.js';
import { InspectorPickBar, clearInspectorHighlight } from './inspector.js';

type OverlayGlobal = typeof globalThis & {
  __rayactDecorateRoot?: (node: React.ReactNode) => React.ReactNode;
};

// This module is imported before the user's development entry module. The
// renderer consults the decorator when the project calls render(<App />), so
// the overlay lives in the project's own runtime and observes that runtime's
// node tree, scheduler diagnostics, revision, HMR state, and native modules.
const g = globalThis as OverlayGlobal;

function ProjectDevToolsSurface() {
  const launcher = useDevLauncher();
  // Hardware back leaves inspector pick mode (the compact "tap to inspect"
  // bar) instead of navigating the project underneath it.
  useBackHandler(() => {
    if (launcher.devMenuOpen || !launcher.inspectorPickMode) return false;
    clearInspectorHighlight();
    launcher.setInspectorPickMode(false);
    launcher.setInspectorOpen(false);
    return true;
  });
  if (!launcher.devMenuOpen && !launcher.inspectorPickMode) return null;
  return (
    <View
      id="__rayact_devtools_root"
      style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 2_000_000, pointerEvents: 'none' }}
    >
      {launcher.devMenuOpen ? <DevMenu /> : <InspectorPickBar />}
    </View>
  );
}

g.__rayactDecorateRoot = (projectNode: React.ReactNode) => (
  <DevLauncherProvider>
    <View id="__rayact_project_wrapper" style={{ flexGrow: 1, position: 'relative' }}>
      {projectNode}
      <ProjectDevToolsSurface />
    </View>
  </DevLauncherProvider>
);
