import '@rayact/shared/material-icons';

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Button,
  NavigationBar,
  NavigationBarItem,
  Icon,
  useSafeAreaInsets,
} from '@rayact/react';
import { useDevLauncher } from './DevLauncherContext.js';
import { CombinedServerList } from './components/CombinedServerList.js';
import { themeColors } from './devLauncherTheme.js';
import {
  inputStyle,
  modalOverlayStyle,
  modalStyle,
  pageStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
  sectionStyle,
} from './devLauncherStyles.js';
import { getAppInfo } from './native.js';
import { getOfficialApp, getBundledModules } from './officialApp.js';

type Tab = 'connect' | 'about';

const DEV_CLIENT_VERSION = '0.1.0';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'connect', label: 'Connect', icon: 'link' },
  { id: 'about', label: 'About', icon: 'info' },
];

function IncompatibleModal() {
  const launcher = useDevLauncher();
  const colors = themeColors(launcher.theme);

  if (!launcher.incompatibleModalVisible) return null;

  return (
    <View
      style={{ ...modalOverlayStyle, backgroundColor: 0x99000000 }}
      onPress={() => launcher.setIncompatibleModalVisible(false)}
    >
      <View
        style={{ ...modalStyle, backgroundColor: colors.surfaceContainer }}
        onPress={() => {}}
      >
        <Text style={{ text: { color: colors.onSurface, fontSize: 18, fontWeight: 600 } }}>
          Incompatible server
        </Text>
        <Text style={{ text: { color: colors.onSurface, fontSize: 14 } }}>
          This app is missing native modules required by the project:
        </Text>
        <View style={{ gap: 6 }}>
          {launcher.incompatibleModules.map(m => (
            <Text
              key={m.name}
              style={{ text: { color: colors.onSurface, fontSize: 14 } }}
            >
              {m.jsPackage ? `${m.name} (${m.jsPackage})` : m.name}
            </Text>
          ))}
        </View>
        <View
          style={{ ...primaryButtonStyle, backgroundColor: colors.primary, marginTop: 8 }}
          onPress={() => launcher.setIncompatibleModalVisible(false)}
        >
          <Text style={{ text: { color: colors.onPrimary, fontSize: 15, fontWeight: 600 } }}>OK</Text>
        </View>
      </View>
    </View>
  );
}

function ConnectPage() {
  const launcher = useDevLauncher();
  const colors = themeColors(launcher.theme);
  const [input, setInput] = useState(launcher.url);

  useEffect(() => {
    setInput(launcher.url);
  }, [launcher.url]);

  return (
    <View style={{ ...pageStyle, backgroundColor: colors.surface, flexGrow: 1, gap: 0 }}>
      <View style={sectionStyle}>
        <Text style={{ text: { color: colors.onSurface, fontSize: 14, fontWeight: 600 } }}>
          Connect to dev server
        </Text>
        <Text style={{ text: { color: colors.onSurface, fontSize: 14 } }}>
          Start a local development server with: npx rayact dev
        </Text>
        <Text style={{ text: { color: colors.onSurface, fontSize: 14 } }}>
          Then, enter the dev server URL when it appears here.
        </Text>
        <TextInput
          value={input}
          onChangeText={(v) => {
            setInput(v);
            launcher.setUrl(v);
          }}
          placeholder="192.168.1.50:8081"
          style={{
            ...inputStyle,
            backgroundColor: colors.surfaceContainer,
            color: colors.onSurface,
          }}
        />
        {launcher.connectError ? (
          <Text style={{ text: { color: colors.error, fontSize: 14, marginBottom: 12 } }}>
            {launcher.connectError}
          </Text>
        ) : null}
        {launcher.connecting ? (
          <Text style={{ text: { color: colors.onSurfaceVariant, fontSize: 12 } }}>
            Connecting…
          </Text>
        ) : null}
        <View style={{ gap: 12, marginTop: 4 }}>
          <Button
            label="Connect"
            onPress={() => launcher.openProject(input)}
            style={{ ...primaryButtonStyle, backgroundColor: colors.primary }}
          />
          <Text style={{ text: { color: colors.onSurface, fontSize: 14, textAlign: 'center' } }}>Or</Text>
          <View
            onPress={launcher.onScanQR}
            style={{ ...secondaryButtonStyle, backgroundColor: colors.surfaceContainer }}
          >
            <Text style={{ text: { color: 0xffffffff, fontSize: 15, fontWeight: 600 } }}>
              Scan QR code
            </Text>
          </View>
        </View>
      </View>

      <View style={{ ...sectionStyle, paddingLeft: 6, paddingRight: 6 }}>
        <Text style={{ text: { color: colors.onSurface, fontSize: 14, fontWeight: 600, marginBottom: 4 } }}>
          Servers
        </Text>
        <Text style={{ text: { color: colors.onSurface, fontSize: 14, marginBottom: 8 } }}>
          Swipe left on a saved row to delete.
        </Text>
      </View>

      <ScrollView style={{ flexGrow: 1, flexShrink: 1, minHeight: 0, width: '100%' }}>
        <View style={{ paddingLeft: 6, paddingRight: 6, paddingBottom: 16, width: '100%' }}>
          <CombinedServerList
            theme={launcher.theme}
            parseUrl={launcher.parseUrl}
            discoveredServers={launcher.discoveredServers}
            recentEntries={launcher.recentEntries}
            recentReachability={launcher.recentReachability}
            openProject={launcher.openProject}
            setUrl={launcher.setUrl}
            showIncompatibleModalForUrl={launcher.showIncompatibleModalForUrl}
            removeRecentItem={launcher.removeRecentItem}
          />
        </View>
      </ScrollView>
    </View>
  );
}

function AboutPage() {
  const launcher = useDevLauncher();
  const colors = themeColors(launcher.theme);
  const [bundleId, setBundleId] = useState('—');
  const [nativeVersion, setNativeVersion] = useState('—');
  const [rayactVersion, setRayactVersion] = useState('—');

  useEffect(() => {
    void getAppInfo().then(info => {
      setBundleId(info.bundleId || '—');
      setNativeVersion(info.nativeAppVersion || '—');
      setRayactVersion(info.rayactVersion || '—');
    }).catch(() => {});
  }, []);

  const cardBorder = colors.isDark ? 0x1affffff : 0x14000000;
  const official = getOfficialApp();
  const bundledModules = getBundledModules();

  return (
    <ScrollView style={{ ...pageStyle, backgroundColor: colors.surface, flexGrow: 1 }}>
      <Text style={{ text: { color: colors.onSurface, fontSize: 18, fontWeight: 600, marginBottom: 16 } }}>
        About
      </Text>

      {official.displayName ? (
        <View style={{ ...sectionStyle, backgroundColor: colors.surfaceContainer, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: cardBorder, marginBottom: 16 }}>
          <Text style={{ text: { color: colors.onSurface, fontSize: 17, fontWeight: 600 } }}>{official.displayName}</Text>
          {official.creditTitle ? (
            <Text style={{ text: { color: colors.onSurfaceVariant, fontSize: 13, marginTop: 4 } }}>{official.creditTitle}</Text>
          ) : null}
          {(official.links ?? []).map(link => (
            <Text key={link.id} style={{ text: { color: colors.onSurfaceVariant, fontSize: 13, marginTop: 8 } }}>
              {link.label}: {link.url}
            </Text>
          ))}
        </View>
      ) : null}

      <View style={{ ...sectionStyle, backgroundColor: colors.surfaceContainer, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: cardBorder, marginBottom: 16 }}>
        <Text style={{ text: { color: colors.onSurfaceVariant, fontSize: 12, fontWeight: 600, letterSpacing: 0.4 } }}>PACKAGE</Text>
        <View style={{ gap: 6, marginTop: 12 }}>
          <Text style={{ text: { color: colors.onSurface, fontSize: 14 } }}>Dev client (npm)</Text>
          <Text style={{ text: { color: colors.onSurface, fontSize: 15, fontWeight: 500 } }}>
            Version {nativeVersion !== '—' ? nativeVersion : DEV_CLIENT_VERSION}
          </Text>
        </View>
      </View>

      <View style={{ ...sectionStyle, backgroundColor: colors.surfaceContainer, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: cardBorder, marginBottom: 16 }}>
        <Text style={{ text: { color: colors.onSurfaceVariant, fontSize: 12, fontWeight: 600, letterSpacing: 0.4 } }}>NATIVE APP</Text>
        <View style={{ gap: 6, marginTop: 12 }}>
          <Text style={{ text: { color: colors.onSurface, fontSize: 14 } }}>Identifier</Text>
          <Text style={{ text: { color: colors.onSurface, fontSize: 15, fontWeight: 500 } }}>{bundleId}</Text>
        </View>
        <View style={{ gap: 6, marginTop: 14 }}>
          <Text style={{ text: { color: colors.onSurface, fontSize: 14 } }}>Version</Text>
          <Text style={{ text: { color: colors.onSurfaceVariant, fontSize: 15, fontWeight: 500 } }}>{nativeVersion}</Text>
        </View>
      </View>

      <View style={{ ...sectionStyle, backgroundColor: colors.surfaceContainer, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: cardBorder }}>
        <Text style={{ text: { color: colors.onSurfaceVariant, fontSize: 12, fontWeight: 600, letterSpacing: 0.4 } }}>RAYACT</Text>
        <View style={{ gap: 6, marginTop: 12 }}>
          <Text style={{ text: { color: colors.onSurface, fontSize: 14 } }}>Runtime</Text>
          <Text style={{ text: { color: colors.onSurfaceVariant, fontSize: 15, fontWeight: 500 } }}>{rayactVersion}</Text>
        </View>
      </View>

      {bundledModules.length > 0 ? (
        <View style={{ ...sectionStyle, backgroundColor: colors.surfaceContainer, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: cardBorder, marginTop: 16 }}>
          <Text style={{ text: { color: colors.onSurfaceVariant, fontSize: 12, fontWeight: 600, letterSpacing: 0.4 } }}>BUNDLED NATIVE MODULES</Text>
          <View style={{ gap: 6, marginTop: 12 }}>
            {bundledModules.map(m => (
              <Text key={m.name} style={{ text: { color: colors.onSurface, fontSize: 14 } }}>
                {m.jsPackage ? `${m.name} · ${m.jsPackage}` : m.name}
              </Text>
            ))}
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

function DevLauncherNavBar({ tab, onTabChange }: { tab: Tab; onTabChange: (tab: Tab) => void }) {
  const launcher = useDevLauncher();
  const colors = themeColors(launcher.theme);

  return (
    <NavigationBar ignoreSafeAreaView style={{ flexShrink: 0 }}>
      {TABS.map(item => {
        const selected = tab === item.id;
        return (
          <NavigationBarItem
            key={item.id}
            label={item.label}
            selected={selected}
            className="dev-launcher-nav-item"
            onPress={() => onTabChange(item.id)}
          >
            <Icon
              name={item.icon}
              size={24}
              color={selected ? colors.primary : colors.onSurfaceVariant}
              filled={selected}
            />
          </NavigationBarItem>
        );
      })}
    </NavigationBar>
  );
}

export function DevLauncherUI() {
  const launcher = useDevLauncher();
  const colors = themeColors(launcher.theme);
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('connect');

  return (
    <View style={{ flexGrow: 1, backgroundColor: colors.surface }}>
      <View
        style={{
          flexGrow: 1,
          flexShrink: 1,
          minHeight: 0,
          paddingTop: insets.top,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        }}
      >
        {tab === 'connect' ? <ConnectPage /> : <AboutPage />}
      </View>
      <IncompatibleModal />
      <DevLauncherNavBar tab={tab} onTabChange={setTab} />
    </View>
  );
}
