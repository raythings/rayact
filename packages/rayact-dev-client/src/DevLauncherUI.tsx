import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Button, ScrollView } from '@rayact/react';
import { useDevLauncher } from './DevLauncherContext.js';

type Tab = 'connect' | 'recent' | 'discover';

function StatusBanner() {
  const launcher = useDevLauncher();
  if (launcher.connecting) {
    return <Text style={{ text: { color: 0xFF80CBC4FF, fontSize: 12 } }}>Connecting…</Text>;
  }
  if (launcher.connectError) {
    return <Text style={{ text: { color: 0xFFFF6B6BFF, fontSize: 12 } }}>{launcher.connectError}</Text>;
  }
  return null;
}

export function DevLauncherUI() {
  const launcher = useDevLauncher();
  const [tab, setTab] = useState<Tab>('connect');
  const [input, setInput] = useState(launcher.url);

  useEffect(() => {
    if (launcher.url) setInput(launcher.url);
  }, [launcher.url]);

  const connect = (url: string) => {
    launcher.clearConnectError();
    launcher.connectToUrl(url);
  };

  return (
    <View style={{ flexGrow: 1, backgroundColor: 0x121212FF, padding: 16, gap: 12 }}>
      <Text style={{ text: { color: 0xFFFFFFFF, fontSize: 24 } }}>Rayact Dev Client</Text>
      <StatusBanner />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {(['connect', 'recent', 'discover'] as Tab[]).map(t => (
          <Text
            key={t}
            style={{ text: { color: tab === t ? 0xFF80CBC4FF : 0xFFB0B0B0FF, fontSize: 14 } }}
            onPress={() => setTab(t)}
          >
            {t}
          </Text>
        ))}
      </View>

      {tab === 'connect' && (
        <View style={{ gap: 8 }}>
          <Text style={{ text: { color: 0xFFB0B0B0FF, fontSize: 12 } }}>Dev server URL</Text>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="http://192.168.1.5:8081"
            style={{ backgroundColor: 0xFF2A2A2AFF, padding: 12 }}
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button label="Connect" onPress={() => connect(input)} />
            <Button label="Scan QR" onPress={launcher.onScanQR} />
          </View>
        </View>
      )}

      {tab === 'recent' && (
        <ScrollView style={{ flexGrow: 1 }}>
          {launcher.recentEntries.length === 0 ? (
            <Text style={{ text: { color: 0xFF888888FF, fontSize: 14 } }}>No recent servers</Text>
          ) : launcher.recentEntries.map(entry => (
            <Button
              key={entry.url}
              label={`${entry.url} (${launcher.recentReachability[entry.url] ?? 'checking'})`}
              onPress={() => connect(entry.url)}
            />
          ))}
        </ScrollView>
      )}

      {tab === 'discover' && (
        <ScrollView style={{ flexGrow: 1 }}>
          {launcher.discoveredServers.length === 0 ? (
            <Text style={{ text: { color: 0xFF888888FF, fontSize: 14 } }}>Searching LAN for _rayact._tcp...</Text>
          ) : launcher.discoveredServers.map(server => (
            <Button
              key={server.url}
              label={`${server.name} — ${server.url}`}
              onPress={() => connect(server.url)}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}
