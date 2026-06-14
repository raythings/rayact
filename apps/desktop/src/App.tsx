import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  AvoidKeyboard,
  Badge,
  Button,
  Checkbox,
  Chip,
  Divider,
  ExtendedFab,
  Fab,
  Icon,
  IconButton,
  List,
  Modal,
  NavigationBar,
  NavigationBarItem,
  NavigationRail,
  ProgressIndicator,
  RadioButton,
  SafeArea,
  SearchBar,
  SegmentedButton,
  Slider,
  ScrollView,
  StatusBar,
  Switch,
  Text,
  TextInput,
  useTheme,
  View,
  render,
  cycleColorSchemePreference,
  useColorSchemePreference
} from '@rayact/react';
import smokeAsset from './assets/smoke-note.txt';
import '@rayact/shared/material-icons';
import '../styles.css';

type WorkerMessage = {
  type?: string;
  text?: string;
  message?: string;
  payload?: unknown;
  received?: unknown;
};

type GlobalWithWorkers = typeof globalThis & {
  initRaylib?: (width: number, height: number, title: string) => void;
  spawnWorker?: (worker: string | Record<string, unknown>, initialData?: unknown) => number;
  postToWorker?: (workerId: number, data: unknown) => void;
  terminateWorker?: (workerId: number) => void;
  onWorkerMessage?: (workerId: number, data: WorkerMessage) => void;
  __rayactSetColorScheme?: (mode: 'dark' | 'light' | 'system', seed?: number) => void;
  __RAYACT_RUN_WASM_SMOKE__?: boolean;
  __RAYACT_QA_WINDOW_READY__?: boolean;
};

const checks = [
  'Asset import from src/assets',
  'spawnWorker JS file asset',
  'Native worker descriptor',
  'TextInput host node',
  'ScrollView/List wrappers',
  'Modal/SafeArea/StatusBar/AvoidKeyboard',
  'Gradient, shadow, and glass CSS',
  'Mouse wheel scroll',
  'Click-drag scroll',
  'Clipped child hit testing',
  'onScroll callback path',
  'Release build asset paths',
  'Dev-server asset serving',
  'Component state updates',
  'Pressable primitive behavior',
  'M3 AppBar, NavigationBar, NavigationRail',
  'M3 Badge, Chip, Card, Divider',
  'M3 Checkbox, Switch, RadioButton',
  'M3 FAB, Extended FAB, IconButton',
  'M3 SearchBar, Slider, SegmentedButton'
] as const;

const navItems = [
  { label: 'Home', icon: 'home' },
  { label: 'Build', icon: 'build' },
  { label: 'QA', icon: 'fact_check' }
] as const;

function formatAssetBytes(bytes: Uint8Array): string {
  const preview = new TextDecoder().decode(bytes.slice(0, 48)).replace(/\s+/g, ' ').trim();
  return `${bytes.byteLength} bytes: ${preview}`;
}

function maybeRunWasmWorkerPathSmoke() {
  const host = globalThis as GlobalWithWorkers;
  if (!host.__RAYACT_RUN_WASM_SMOKE__ || typeof host.spawnWorker !== 'function') return;
  const id = host.spawnWorker('../../../../wasm3/test/lang/fib32.wasm', { source: 'qa-screen' });
  host.terminateWorker?.(id);
}

function App() {
  const t = useTheme();
  const [count, setCount] = useState(0);
  const [text, setText] = useState('Rayact');
  const [sliderValue, setSliderValue] = useState(0.5);
  const [searchText, setSearchText] = useState('');
  const deferredSearch = useDeferredValue(searchText);
  const [assetStatus, setAssetStatus] = useState('loading asset bytes');
  const [workerStatus, setWorkerStatus] = useState('workers not started');
  const [scrollStatus, setScrollStatus] = useState('not scrolled yet');
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedChip, setSelectedChip] = useState('Assist');
  const [toggleEnabled, setToggleEnabled] = useState(true);
  const [radioValue, setRadioValue] = useState('A');
  const [navValue, setNavValue] = useState('Home');
  const [railOpen, setRailOpen] = useState(false);
  const themePreference = useColorSchemePreference();

  const filteredChecks = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    if (!query) return checks;
    return checks.filter(item => item.toLowerCase().includes(query));
  }, [deferredSearch]);

  useEffect(() => {
    let alive = true;
    smokeAsset.bytes()
      .then(bytes => {
        if (alive) setAssetStatus(formatAssetBytes(bytes));
      })
      .catch(error => {
        if (alive) setAssetStatus(`asset read failed: ${error instanceof Error ? error.message : String(error)}`);
      });

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const host = globalThis as GlobalWithWorkers;
    maybeRunWasmWorkerPathSmoke();

    if (typeof host.spawnWorker !== 'function') {
      setWorkerStatus('spawnWorker unavailable in this host');
      return;
    }

    const previousHandler = host.onWorkerMessage;
    const pending = new Map<number, string>();
    const statuses: string[] = [];
    let jsWorkerId = 0;
    let nativeWorkerId = 0;

    function updateStatus(workerId: number, data: WorkerMessage) {
      const label = pending.get(workerId) ?? `worker ${workerId}`;
      const text = data.text ?? data.message ?? data.type ?? 'message';
      statuses.push(`${label}: ${text}`);
      setWorkerStatus(statuses.slice(-4).join(' | '));
    }

    host.onWorkerMessage = (workerId, data) => {
      updateStatus(workerId, data);
      previousHandler?.(workerId, data);
    };

    try {
      jsWorkerId = host.spawnWorker('../workers/qa_worker.js', { text: 'js worker bundled' });
      pending.set(jsWorkerId, 'js');
      host.postToWorker?.(jsWorkerId, { text: 'ping from React' });

      nativeWorkerId = host.spawnWorker({ type: 'native', name: 'qa.echo' }, { text: 'native worker registered' });
      pending.set(nativeWorkerId, 'native');
      host.postToWorker?.(nativeWorkerId, { text: 'native ping' });
    } catch (error) {
      setWorkerStatus(`worker start failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    return () => {
      host.onWorkerMessage = previousHandler;
      if (jsWorkerId) host.terminateWorker?.(jsWorkerId);
      if (nativeWorkerId) host.terminateWorker?.(nativeWorkerId);
    };
  }, []);

  const toggleTheme = () => {
    cycleColorSchemePreference();
  };

  const themeToggleLabel =
    themePreference === 'system' ? 'brightness_auto' : t.dark ? 'light_mode' : 'dark_mode';

  return (
    <SafeArea className="qa-root">
      <StatusBar barStyle={t.dark ? 'light' : 'dark'} backgroundColor={t.surfaceContainerLowest} />
      <View className="qa-shell">
        <NavigationRail open={railOpen} className="qa-rail">
          <View
            className={railOpen ? 'qa-rail-menu qa-rail-menu-open' : 'qa-rail-menu'}
            onPress={() => setRailOpen(value => !value)}
          >
            <Icon
              key={railOpen ? 'menu-open' : 'menu-closed'}
              name={railOpen ? 'menu_open' : 'menu'}
              style={{ width: 24, height: 24 }}
              size={24}
              color={t.onSurfaceVariant}
            />
          </View>
          {navItems.map(item => {
            const selected = navValue === item.label;
            return (
              <NavigationBarItem
                key={item.label}
                label={item.label}
                open={railOpen}
                selected={selected}
                onPress={() => setNavValue(item.label)}
              >
                <Icon
                  key={`${item.label}-${selected ? 'selected' : 'inactive'}`}
                  name={item.icon}
                  size={24}
                  color={selected ? t.onSecondaryContainer : t.onSurfaceVariant}
                  variant={selected ? 'filled' : 'outlined'}
                />
              </NavigationBarItem>
            );
          })}
        </NavigationRail>

        <AvoidKeyboard
          className="qa-content"
          behavior="padding"
          onPress={() => {
            if (railOpen) setRailOpen(false);
          }}
        >
          <View className="qa-app-bar">
            <View className="qa-title-block">
              <Text text="Rayact Cross-Platform QA" className="qa-title" />
              <Text text="One desktop surface for assets, workers, components, and style parsing." className="qa-copy" />
            </View>
            <Badge value={count} className="qa-badge" />
            <IconButton className="qa-icon-button" onPress={toggleTheme}>
              <Icon name={themeToggleLabel} size={24} color={t.onSurface} />
            </IconButton>
            <IconButton className="qa-icon-button" onPress={() => setCount(value => value + 1)}>
              <Icon name="help" size={24} color={t.onSurfaceVariant} />
            </IconButton>
            <ActivityIndicator animating color={t.primary} size="small" className="qa-spinner" />
          </View>

          <View className="qa-main">
            <ScrollView
              className="qa-panel qa-scroll"
              onScroll={(event) => {
                const value = event as { y?: number };
                setScrollStatus(`y=${Math.round(value.y ?? 0)}`);
              }}
            >
              <Text text="Component coverage" className="qa-section-title" />
              <List
                className="qa-list"
                data={filteredChecks}
                keyExtractor={item => item}
                renderItem={({ item, index }) => (
                  <View className="qa-list-row" onPress={() => setCount(value => value + 1)}>
                    <Text text={`${index + 1}.`} className="qa-list-index" />
                    <Text text={item} className="qa-list-text" />
                  </View>
                )}
              />
            </ScrollView>

            <View className="qa-panel qa-card">
              <Text text="Runtime checks" className="qa-section-title" />
              <Text text={`Pressable View clicks: ${count}`} className="qa-status" />
              <Text text={`Asset: ${assetStatus}`} className="qa-status" />
              <Text text={`Workers: ${workerStatus}`} className="qa-status" />
              <Text text={`Scroll: ${scrollStatus}`} className="qa-status" />
              <Divider className="qa-divider" />
              <SearchBar
                className="qa-search"
                style={{ color: t.onSurface }}
                placeholder="Search components"
                value={searchText}
                onChangeText={setSearchText}
                trailing={searchText ? <Icon name="close" size={20} color={t.onSurfaceVariant} /> : undefined}
              />
              <View className="qa-chip-row">
                {['Assist', 'Filter', 'Input'].map(item => (
                  <Chip
                    key={item}
                    label={item}
                    selected={selectedChip === item}
                    className="qa-chip"
                    onPress={() => setSelectedChip(item)}
                  />
                ))}
              </View>
              <View className="qa-control-grid">
                <View className="qa-control-row">
                  <Checkbox
                    checked={toggleEnabled}
                    className="qa-check"
                    onPress={() => setToggleEnabled(value => !value)}
                  />
                  <Text text="Checkbox" className="qa-status" />
                </View>
                <View className="qa-control-row">
                  <Switch
                    checked={toggleEnabled}
                    className="qa-switch"
                    onPress={() => setToggleEnabled(value => !value)}
                  />
                  <Text text="Switch" className="qa-status" />
                </View>
                <View className="qa-control-row">
                  <RadioButton
                    checked={radioValue === 'A'}
                    className="qa-radio"
                    onPress={() => setRadioValue(value => value === 'A' ? 'B' : 'A')}
                  />
                  <Text text={`Radio ${radioValue}`} className="qa-status" />
                </View>
              </View>
              <View className="qa-chip-row">
                <SegmentedButton label="Day" selected={navValue === 'Home'} className="qa-segment" onPress={() => setNavValue('Home')} />
                <SegmentedButton label="Week" selected={navValue === 'Build'} className="qa-segment" onPress={() => setNavValue('Build')} />
                <SegmentedButton label="Month" selected={navValue === 'QA'} className="qa-segment" onPress={() => setNavValue('QA')} />
              </View>
              <ProgressIndicator progress={count % 10 / 10} className="qa-progress" />
              <Slider value={sliderValue} min={0} max={1} className="qa-slider" onValueChange={setSliderValue} />
              <TextInput
                value={text}
                placeholder="Type to test TextInput"
                className="qa-input"
                onChangeText={setText}
              />
              <Text text={`TextInput value: ${text}`} className="qa-status" />
              <View className="qa-actions">
                <Button label="Increment" className="qa-button" onPress={() => setCount(value => value + 1)} />
                <Button label="Modal" className="qa-button qa-button-secondary" onPress={() => setModalVisible(true)} />
                <ExtendedFab label="Create" className="qa-extended-fab" onPress={() => setCount(value => value + 1)} />
                <Fab className="qa-fab" onPress={() => setModalVisible(true)}>
                  <Icon name="add" size={24} color={t.onPrimaryContainer} />
                </Fab>
              </View>
            </View>
          </View>

          <NavigationBar className="qa-nav-bar">
            {navItems.map(item => {
              const selected = navValue === item.label;
              return (
                <NavigationBarItem
                  key={item.label}
                  label={item.label}
                  selected={selected}
                  className="qa-nav-item"
                  onPress={() => setNavValue(item.label)}
                >
                  <Icon
                    key={`${item.label}-${selected ? 'selected' : 'inactive'}`}
                    name={item.icon}
                    size={24}
                    color={selected ? t.onSecondaryContainer : t.onSurfaceVariant}
                    variant={selected ? 'filled' : 'outlined'}
                  />
                </NavigationBarItem>
              );
            })}
          </NavigationBar>
        </AvoidKeyboard>

        <Modal visible={modalVisible} className="qa-modal" onRequestClose={() => setModalVisible(false)}>
          <View className="qa-modal-card">
            <Text text="Modal host node is mounted" className="qa-modal-title" />
            <Text text="This also verifies request-close wiring when the host provides it." className="qa-modal-copy" />
            <Button label="Close" className="qa-button" onPress={() => setModalVisible(false)} />
          </View>
        </Modal>
      </View>
    </SafeArea>
  );
}

const host = globalThis as GlobalWithWorkers;
if (!host.__RAYACT_QA_WINDOW_READY__ && typeof host.initRaylib === 'function') {
  host.initRaylib(1000, 720, 'Rayact Cross-Platform QA');
  host.__RAYACT_QA_WINDOW_READY__ = true;
}

render(<App />);
