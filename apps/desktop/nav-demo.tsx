// Demo: the REAL react-navigation driving rayact, via @rayact/navigation.
// One shared React tree + context across screens; navigation logic is
// react-navigation's (StackRouter / useNavigationBuilder), the view is rayact.
import React from 'react';
import { View, Text, Button, render, useTheme } from '@rayact/react';
import {
  NavigationContainer,
  createStackNavigator,
  useNavigation,
} from '@rayact/navigation';

const Stack = createStackNavigator();

function HomeScreen() {
  const nav = useNavigation<any>();
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.surface, padding: 48, gap: 20 }}>
      <Text text="Home" style={{ color: t.onSurface, fontSize: 32 }} />
      <Text text="react-navigation StackRouter on rayact" style={{ color: t.onSurfaceVariant }} />
      <Button label="Go to Details →" onPress={() => nav.navigate('Details', { from: 'Home' })} />
    </View>
  );
}

function DetailsScreen() {
  const nav = useNavigation<any>();
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.surfaceContainerHigh, padding: 48, gap: 20 }}>
      <Text text="Details" style={{ color: t.onSurface, fontSize: 32 }} />
      <Text text="Same React tree — useTheme() shared from the root" style={{ color: t.onSurfaceVariant }} />
      <Button label="← Back" onPress={() => nav.goBack()} />
    </View>
  );
}

function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Home">
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Details" component={DetailsScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const host = globalThis as any;
if (typeof host.initRaylib === 'function') host.initRaylib(900, 650, 'Rayact Navigation Demo');
try {
  render(<App />);
} catch (e: any) {
  console.log('NAV_DEMO_ERROR: ' + (e && (e.stack || e.message || String(e))));
}
