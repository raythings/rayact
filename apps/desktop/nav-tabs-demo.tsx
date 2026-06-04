import React from 'react';
import { View, Text, render, useTheme, BackHandler } from '@rayact/react';
import {
  NavigationContainer,
  createStackNavigator,
  useIsFocused,
  useNavigation,
  type StackAnimation,
} from '@rayact/navigation';

const Stack = createStackNavigator();

type AnimationOption = { value: StackAnimation; label: string };

const ANIMATIONS: AnimationOption[] = [
  { value: 'slide_from_right', label: 'Slide from right' },
  { value: 'fade', label: 'Fade' },
  { value: 'slide_from_bottom', label: 'Slide from bottom' },
  { value: 'scale', label: 'Scale' },
  { value: 'none', label: 'None' },
];

function pickAnimation(): StackAnimation {
  return ANIMATIONS[Math.floor(Math.random() * ANIMATIONS.length)].value;
}

function useBackPressToExit(enabled: boolean, windowMs = 1500): void {
  const lastRef = React.useRef(0);
  React.useEffect(() => {
    if (!enabled) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const now = Date.now();
      if (now - lastRef.current < windowMs) {
        BackHandler.exitApp();
        return true;
      }
      lastRef.current = now;
      return true;
    });
    return () => sub.remove();
  }, [enabled, windowMs]);
}

function HomeScreen() {
  const nav = useNavigation<any>();
  const isFocused = useIsFocused();
  const t = useTheme();
  useBackPressToExit(isFocused);
  return (
    <View style={{ flex: 1, backgroundColor: t.surface, padding: 48, gap: 24, alignItems: 'flex-start' }}>
      <Text text="Home" style={{ color: t.onSurface, fontSize: 56 }} />
      <Text
        text="react-navigation StackRouter on rayact - engine-driven transitions"
        style={{ color: t.onSurfaceVariant, fontSize: 22 }}
      />
      <Text
        text="Tap a button to push a screen with a random transition. Press back to pop."
        style={{ color: t.onSurfaceVariant, fontSize: 18 }}
      />
      <Text
        text="Press back twice in 1.5s to exit (handled by app-registered BackHandler)."
        style={{ color: t.onSurfaceVariant, fontSize: 16, fontStyle: 'italic' } as any}
      />
      <View
        onPress={() => {
          nav.navigate('Animated', { from: 'Home', animation: pickAnimation() });
        }}
        style={{
          width: 360, height: 96, backgroundColor: 0x6750a4ff, borderRadius: 28,
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Text text="Push (random transition)" style={{ color: 0xffffffff, fontSize: 24 }} />
      </View>
      <View
        onPress={() => {
          for (let i = 0; i < 5; i++) {
            setTimeout(
              () => nav.navigate('Animated', { from: 'Home', animation: pickAnimation() }),
              i * 30,
            );
          }
        }}
        style={{
          width: 360, height: 72, backgroundColor: 0x4a5a92ff, borderRadius: 24,
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Text text="Push 5 (deep stack test)" style={{ color: 0xffffffff, fontSize: 20 }} />
      </View>
    </View>
  );
}

function AnimatedScreen({ route }: { route: { params?: { from?: string; animation?: StackAnimation } } }) {
  const nav = useNavigation<any>();
  const t = useTheme();
  const animation = (route.params?.animation ?? 'slide_from_right') as StackAnimation;
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: t.surfaceContainerHigh,
        padding: 48,
        gap: 24,
        alignItems: 'flex-start',
      }}
    >
      <Text text="Details" style={{ color: t.onSurface, fontSize: 56 }} />
      <Text
        text={`from: ${route.params?.from ?? '?'}`}
        style={{ color: t.onSurfaceVariant, fontSize: 22 }}
      />
      <Text
        text={`animation: ${animation}`}
        style={{ color: t.onSurfaceVariant, fontSize: 22 }}
      />
      <View
        onPress={() => nav.goBack()}
        style={{
          width: 400, height: 96, backgroundColor: 0x8ad0ffff, borderRadius: 28,
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Text text="← Back" style={{ color: 0x000000ff, fontSize: 28 }} />
      </View>
      <View
        onPress={() =>
          nav.push('Animated', { from: 'Animated', animation: pickAnimation() } as any)
        }
        style={{
          width: 400, height: 72, backgroundColor: 0x6750a4ff, borderRadius: 24,
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Text text="Push another" style={{ color: 0xffffffff, fontSize: 20 }} />
      </View>
    </View>
  );
}

function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Home">
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen
          name="Animated"
          component={AnimatedScreen}
          options={({ route }: any) => ({
            animation: (route.params?.animation ?? 'slide_from_right') as StackAnimation,
            animationDuration: 280,
          })}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const host = globalThis as any;
if (typeof host.initRaylib === 'function') host.initRaylib(900, 720, 'Rayact Navigation Demo');
console.log('NAV_DEMO: importing @rayact/navigation...');
try {
  console.log('NAV_DEMO: calling render(<App />)...');
  render(<App />);
  console.log('NAV_DEMO: render() returned');
} catch (e: any) {
  console.log('NAV_DEMO_ERROR: ' + (e && (e.stack || e.message || String(e))));
}
