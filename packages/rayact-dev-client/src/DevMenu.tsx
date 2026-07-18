import React from 'react';
import { NavigationIndependentTree } from '@react-navigation/core';
import { View, Text, Icon, BottomSheet, Switch, useBackHandler } from '@rayact/react';
import { NavigationContainer, createStackNavigator, useNavigation } from '@rayact/navigation';
import { useDevLauncher } from './DevLauncherContext.js';
import { DiagnosticsPanel } from './DiagnosticsPanel.js';
import { clearInspectorHighlight } from './inspector.js';

type ToolRoutes = {
  Home: undefined;
  Diagnostics: undefined;
};

const ToolsStack = createStackNavigator<ToolRoutes>();
const colors = {
  surface: 0xFA1C1C1FFF,
  surfaceRaised: 0xFF292929FF,
  border: 0xFF3B3B3FFF,
  text: 0xFFF5F5F5FF,
  muted: 0xFFA6A6A6FF,
  accent: 0xFFB9A2FFFF,
  danger: 0xFFFF8A80FF,
};

function ActionRow({ title, detail, onPress, tone = 'default' }: {
  title: string;
  detail?: string;
  onPress: () => void;
  tone?: 'default' | 'danger';
}) {
  return (
    <View
      style={{
        backgroundColor: colors.surfaceRaised,
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: colors.border,
        gap: 3,
      }}
      capturesInput
      onPress={onPress}
    >
      <Text style={{ text: { color: tone === 'danger' ? colors.danger : colors.text, fontSize: 13, fontWeight: 600 } }}>{title}</Text>
      {detail ? <Text style={{ text: { color: colors.muted, fontSize: 10 } }}>{detail}</Text> : null}
    </View>
  );
}

function SectionLabel({ children }: { children: string }) {
  return <Text style={{ text: { color: colors.muted, fontSize: 10, fontWeight: 700, letterSpacing: 0.8 } }}>{children}</Text>;
}

function HomeScreen() {
  const launcher = useDevLauncher();
  const navigation = useNavigation() as { navigate(name: keyof ToolRoutes): void };
  return (
    <View style={{ flexGrow: 1, padding: 14, gap: 9 }}>
      <SectionLabel>PROJECT</SectionLabel>
      <ActionRow title="Reload project" detail="Re-evaluate the current development bundle" onPress={launcher.reload} />
      <ActionRow title="Back to launcher" detail="Disconnect and choose another development server" onPress={launcher.returnToLauncher} />
      <SectionLabel>TOOLS</SectionLabel>
      <View
        style={{
          backgroundColor: colors.surfaceRaised,
          paddingHorizontal: 14,
          paddingVertical: 12,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: colors.border,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
        capturesInput
      >
        <View style={{ gap: 3, flexShrink: 1 }}>
          <Text style={{ text: { color: colors.text, fontSize: 13, fontWeight: 600 } }}>Rayact DevTools</Text>
          <Text style={{ text: { color: launcher.devToolsState.forcedOff ? colors.accent : colors.muted, fontSize: 10 } }}>
            {launcher.devToolsState.reason || (launcher.devToolsState.enabled
              ? 'Disable for better startup, frame pacing, and memory performance'
              : 'Disabled for better performance; enable when active debugging is needed')}
          </Text>
        </View>
        <Switch
          selected={launcher.devToolsState.enabled}
          disabled={launcher.devToolsState.forcedOff}
          onPress={() => launcher.setDevToolsEnabled(!launcher.devToolsState.enabled)}
        />
      </View>
      <View
        style={{
          backgroundColor: colors.surfaceRaised,
          paddingHorizontal: 14,
          paddingVertical: 12,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: colors.border,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
        capturesInput
      >
        <View style={{ gap: 3, flexShrink: 1 }}>
          <Text style={{ text: { color: colors.text, fontSize: 13, fontWeight: 600 } }}>Tap to inspect</Text>
          <Text style={{ text: { color: colors.muted, fontSize: 10 } }}>
            Closes this menu and highlights elements as you tap them
          </Text>
        </View>
        <Switch
          selected={launcher.inspectorPickMode}
          onPress={() => {
            if (launcher.inspectorPickMode) {
              clearInspectorHighlight();
              launcher.setInspectorPickMode(false);
              launcher.setInspectorOpen(false);
              return;
            }
            // Entering pick mode dismisses the sheet so the project is
            // tappable; the floating pick bar takes over from here.
            launcher.setInspectorPickMode(true);
            launcher.setInspectorOpen(true);
            launcher.setDevMenuOpen(false);
          }}
        />
      </View>
      <ActionRow title="Performance" detail="Frame pacing, CPU, memory, HMR and runtime information" onPress={() => navigation.navigate('Diagnostics')} />
    </View>
  );
}

function ToolBack({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }} capturesInput onPress={onBack}>
        <Icon name="chevron_left" size={20} color={colors.accent} />
        <Text style={{ text: { color: colors.accent, fontSize: 12 } }}>Back</Text>
      </View>
      <Text style={{ text: { color: colors.text, fontSize: 13, fontWeight: 700 } }}>{title}</Text>
    </View>
  );
}

function DiagnosticsScreen() {
  const navigation = useNavigation() as { goBack(): void };
  return (
    <View style={{ flexGrow: 1 }}>
      <ToolBack title="Performance" onBack={() => navigation.goBack()} />
      <DiagnosticsPanel visible embedded />
    </View>
  );
}

export function DevMenu() {
  const launcher = useDevLauncher();
  const closeMenu = () => {
    if (!launcher.inspectorPickMode) {
      clearInspectorHighlight();
      launcher.setInspectorOpen(false);
    }
    launcher.setDevMenuOpen(false);
  };
  // Hardware back closes the developer menu before the press can fall
  // through to the project's navigation (or exit to the launcher). The
  // embedded tools navigator registers the navigation-back hook, so deeper
  // tool screens still pop first; this only fires once that stack is at
  // its root.
  useBackHandler(() => {
    if (!launcher.devMenuOpen) return false;
    closeMenu();
    return true;
  });
  if (!launcher.devMenuOpen) return null;

  return (
    <BottomSheet
      open
      zIndex={2_000_002}
      onRequestClose={closeMenu}
      style={{
      height: 560,
      maxHeight: '82%',
      backgroundColor: colors.surface,
      padding: 0,
      overflow: 'hidden',
    }}>
      <View
        style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingTop: 28, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}
        capturesInput
      >
        <View style={{ gap: 2 }}>
          <Text style={{ text: { color: colors.text, fontSize: 15, fontWeight: 700 } }}>Developer tools</Text>
          <Text style={{ text: { color: colors.muted, fontSize: 9 } }}>{launcher.url || 'Project runtime'}</Text>
        </View>
      </View>
      <View style={{ flexGrow: 1, backgroundColor: colors.surface, overflow: 'hidden' }}>
        <NavigationIndependentTree>
          <NavigationContainer>
            <ToolsStack.Navigator embedded initialRouteName="Home" screenOptions={{ animation: 'fade', animationDuration: 140, lazy: false }}>
              <ToolsStack.Screen name="Home" component={HomeScreen} />
              <ToolsStack.Screen name="Diagnostics" component={DiagnosticsScreen} />
            </ToolsStack.Navigator>
          </NavigationContainer>
        </NavigationIndependentTree>
      </View>
    </BottomSheet>
  );
}
