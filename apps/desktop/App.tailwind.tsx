// raym3 v2 — multi-page Tailwind CSS demo (React / @rayact/react)

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Button,
  Image,
  render,
  useColorScheme,
  useColorSchemePreference,
  setColorSchemePreference,
  cycleColorSchemePreference,
  useAnimatedValue,
} from '@rayact/react';
import type { ColorSchemePreference } from '@rayact/react';
import avatarAsset from './avatar.png';
import './tailwind.css';

type PageId = 'dashboard' | 'components' | 'settings' | 'profile';

const NAV_ITEMS: { id: PageId; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'components', label: 'Components' },
  { id: 'settings', label: 'Settings' },
  { id: 'profile', label: 'Profile' },
];

function themeToggleLabel(pref: ColorSchemePreference, isDark: boolean): string {
  if (pref === 'system') return 'System';
  return isDark ? 'Dark' : 'Light';
}

function Header() {
  const pref = useColorSchemePreference();
  const isDark = useColorScheme();

  return (
    <View className="flex flex-row items-center bg-slate-100 dark:bg-slate-800 px-6 py-4 border-b border-slate-200 dark:border-slate-700">
      <Text text="rayact" className="text-xl font-bold text-indigo-600 dark:text-indigo-400" />
      <View className="flex-1" />
      <Button
        text={themeToggleLabel(pref, isDark)}
        className="text-sm text-slate-600 dark:text-slate-300 px-3 py-1 rounded-lg bg-slate-200 dark:bg-slate-700"
        onPress={() => cycleColorSchemePreference()}
      />
      <Text text="Docs" className="text-sm text-slate-500 dark:text-slate-400 px-3" />
      <Text text="GitHub" className="text-sm text-slate-500 dark:text-slate-400 px-3" />
    </View>
  );
}

function Sidebar({ activePage, onNavigate }: { activePage: PageId; onNavigate: (page: PageId) => void }) {
  return (
    <View className="flex flex-col bg-slate-100 dark:bg-slate-800 w-48 py-4 gap-1 border-r border-slate-200 dark:border-slate-700">
      {NAV_ITEMS.map((item) => {
        const isActive = item.id === activePage;
        return (
          <View
            key={item.id}
            className={
              isActive
                ? 'flex flex-row items-center px-4 py-2 mx-2 rounded-lg bg-indigo-600'
                : 'flex flex-row items-center px-4 py-2 mx-2 rounded-lg'
            }
            onPress={() => onNavigate(item.id)}
          >
            <Text
              text={item.label}
              className={
                isActive
                  ? 'text-white text-sm font-medium'
                  : 'text-slate-600 dark:text-slate-400 text-sm'
              }
            />
          </View>
        );
      })}
    </View>
  );
}

function Shell({
  activePage,
  onNavigate,
  children,
}: {
  activePage: PageId;
  onNavigate: (page: PageId) => void;
  children: React.ReactNode;
}) {
  return (
    <View
      className="flex flex-col flex-1 bg-slate-50 dark:bg-slate-900 overflow-hidden"
    >
      <Header />
      <View className="flex flex-row flex-1">
        <Sidebar activePage={activePage} onNavigate={onNavigate} />
        <View className="flex flex-col flex-1 p-8 gap-6 overflow-hidden">{children}</View>
      </View>
    </View>
  );
}

const THUMB_TRAVEL = 20;

function SettingToggle({
  label,
  sub,
  initial = false,
  themeToggle = false,
}: {
  label: string;
  sub: string;
  initial?: boolean;
  themeToggle?: boolean;
}) {
  const isDark = useColorScheme();
  const [active, setActive] = useState(themeToggle ? isDark : initial);

  useEffect(() => {
    if (themeToggle) setActive(isDark);
  }, [themeToggle, isDark]);

  const thumbMargin = useAnimatedValue(active ? THUMB_TRAVEL : 0, { duration: 180 });

  const handlePress = () => {
    if (themeToggle) {
      const next = !isDark;
      setColorSchemePreference(next ? 'dark' : 'light');
      setActive(next);
    } else {
      setActive((v) => !v);
    }
  };

  return (
    <View className="flex flex-row items-center px-6 py-4 border-b border-slate-700">
      <View className="flex flex-col flex-1 gap-1">
        <Text text={label} className="text-base text-white" />
        <Text text={sub} className="text-sm text-slate-400" />
      </View>
      <View
        className={active ? 'bg-indigo-600 rounded-full' : 'bg-slate-600 rounded-full'}
        style={{
          width: 44,
          height: 24,
          flexDirection: 'row',
          justifyContent: 'flex-start',
          alignItems: 'center',
          padding: 2,
        }}
        onPress={handlePress}
      >
        <View
          className="rounded-full"
          style={{
            backgroundColor: 0xffffffff,
            width: 20,
            height: 20,
            margin: { left: thumbMargin },
          }}
        />
      </View>
    </View>
  );
}

function DashboardPage({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  return (
    <>
      <View className="flex flex-col bg-slate-800 rounded-2xl p-8 gap-4 border border-slate-700">
        <Text text="Tailwind CSS in rayact" className="text-3xl font-bold text-white" />
        <Text
          text="Pre-compiled utility classes via importCSS(). Navigate with the sidebar."
          className="text-base text-slate-400"
        />
        <Button
          text="Explore Components"
          className="bg-indigo-600 text-white text-sm font-semibold rounded-lg px-6 py-3"
          onPress={() => onNavigate('components')}
        />
      </View>

      <View className="flex flex-row gap-4">
        {[
          { label: 'Pages', value: '4' },
          { label: 'CSS Rules', value: '130+' },
          { label: 'Render', value: '60fps' },
        ].map((stat) => (
          <View
            key={stat.label}
            className="flex flex-col flex-1 bg-slate-800 rounded-xl p-6 gap-1 border border-slate-700"
          >
            <Text text={stat.value} className="text-2xl font-bold text-indigo-400" />
            <Text text={stat.label} className="text-sm text-slate-500" />
          </View>
        ))}
      </View>

      <View className="flex flex-row items-center bg-emerald-900 border border-emerald-700 rounded-xl px-5 py-4 gap-3">
        <Text
          text="CSS classes resolved from compiled Tailwind output."
          className="text-sm text-emerald-300"
        />
      </View>
    </>
  );
}

function ComponentsPage() {
  return (
    <>
      <Text text="Components" className="text-3xl font-bold text-slate-900 dark:text-white" />

      <View className="flex flex-col bg-slate-800 rounded-xl p-6 gap-4 border border-slate-700">
        <Text text="Buttons" className="text-base font-semibold text-slate-400" />
        <View className="flex flex-row gap-3 items-center">
          <Button
            text="Primary"
            className="bg-indigo-600 text-white text-sm rounded-lg px-4 py-2"
            onPress={() => console.log('Primary clicked')}
          />
          <Button
            text="Secondary"
            className="bg-slate-700 text-slate-200 text-sm rounded-lg px-4 py-2"
            onPress={() => console.log('Secondary clicked')}
          />
          <Button
            text="Danger"
            className="bg-red-600 text-white text-sm rounded-lg px-4 py-2"
            onPress={() => console.log('Danger clicked')}
          />
        </View>
      </View>

      <View className="flex flex-col bg-slate-800 rounded-xl p-6 gap-4 border border-slate-700">
        <Text text="Cards" className="text-base font-semibold text-slate-400" />
        <View className="flex flex-row gap-4">
          {[
            { title: 'Design', sub: 'Layout & spacing', color: 'text-indigo-400' },
            { title: 'Build', sub: 'Components & logic', color: 'text-emerald-400' },
            { title: 'Ship', sub: 'Deploy & monitor', color: 'text-yellow-400' },
          ].map((card) => (
            <View
              key={card.title}
              className="flex flex-col flex-1 bg-slate-900 rounded-lg p-4 gap-2 border border-slate-700"
            >
              <Text text={card.title} className={`text-base font-semibold ${card.color}`} />
              <Text text={card.sub} className="text-sm text-slate-400" />
            </View>
          ))}
        </View>
      </View>
    </>
  );
}

function SettingsPage() {
  return (
    <>
      <Text text="Settings" className="text-3xl font-bold text-slate-900 dark:text-white" />

      <View className="flex flex-col bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <SettingToggle label="Notifications" sub="Receive desktop alerts" initial />
        <SettingToggle label="Dark mode" sub="Use dark color scheme" themeToggle />
        <SettingToggle label="Auto-save" sub="Save changes automatically" />
        <SettingToggle label="Analytics" sub="Share usage data" />
      </View>

      <Button
        text="Save Changes"
        className="bg-indigo-600 text-white text-sm font-semibold rounded-lg px-6 py-3"
        onPress={() => console.log('Settings saved')}
      />
    </>
  );
}

function ProfilePage() {
  return (
    <>
      <View className="flex flex-col bg-slate-800 rounded-2xl p-8 gap-4 border border-slate-700 items-center">
        <View className="rounded-full" style={{ width: 80, height: 80, overflow: 'hidden' }}>
          <Image src={avatarAsset} style={{ width: 80, height: 80 }} />
        </View>
        <Text text="Alex Johnson" className="text-xl font-bold text-white" />
        <Text text="alex@rayact.dev" className="text-sm text-slate-400" />
        <Button
          text="Edit Profile"
          className="bg-slate-700 text-slate-200 text-sm rounded-lg px-6 py-3"
          onPress={() => console.log('Edit profile')}
        />
      </View>

      <View className="flex flex-row gap-4">
        {[
          { label: 'Projects', value: '12' },
          { label: 'Commits', value: '847' },
          { label: 'Reviews', value: '234' },
        ].map((stat) => (
          <View
            key={stat.label}
            className="flex flex-col flex-1 bg-slate-800 rounded-xl p-6 gap-1 border border-slate-700 items-center"
          >
            <Text text={stat.value} className="text-2xl font-bold text-white" />
            <Text text={stat.label} className="text-sm text-slate-500" />
          </View>
        ))}
      </View>
    </>
  );
}

function App() {
  const [page, setPage] = useState<PageId>('dashboard');

  return (
    <Shell activePage={page} onNavigate={setPage}>
      {page === 'dashboard' && <DashboardPage onNavigate={setPage} />}
      {page === 'components' && <ComponentsPage />}
      {page === 'settings' && <SettingsPage />}
      {page === 'profile' && <ProfilePage />}
    </Shell>
  );
}

const host = globalThis as {
  initRaylib?: (w: number, h: number, title: string) => void;
  setRelayoutOnSurfaceResize?: (enabled: boolean) => void;
  setWindowResizable?: (enabled: boolean) => void;
};
if (typeof host.setRelayoutOnSurfaceResize === 'function') {
  host.setRelayoutOnSurfaceResize(true);
}
if (typeof host.setWindowResizable === 'function') {
  host.setWindowResizable(true);
}
if (typeof host.initRaylib === 'function') {
  host.initRaylib(900, 650, 'Rayact - Tailwind CSS');
}

render(<App />);
