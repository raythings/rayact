# Navigation

`@rayact/navigation` runs **real react-navigation** (`@react-navigation/core`)
on Rayact — same mental model and hooks as React Native, with Rayact-native
navigators for stacks and tabs (screen transitions render through the native
animation system).

```sh
# already vendored in scaffolded projects; add the dependency like any other @rayact package
```

## Stack

```tsx
import {
  NavigationContainer,
  createStackNavigator,
  useNavigation,
} from '@rayact/navigation';
import { View, Text, Button, render } from 'rayact/react';

type RootParams = { Home: undefined; Details: { id: string } };
const Stack = createStackNavigator<RootParams>();

function Home() {
  const nav = useNavigation();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Button label="Open details" onPress={() => nav.navigate('Details', { id: '42' })} />
    </View>
  );
}

function Details({ route }: { route: { params: { id: string } } }) {
  return <Text>{`Details for ${route.params.id}`}</Text>;
}

render(
  <NavigationContainer>
    <Stack.Navigator>
      <Stack.Screen name="Home" component={Home} options={{ title: 'Home' }} />
      <Stack.Screen name="Details" component={Details} />
    </Stack.Navigator>
  </NavigationContainer>
);
```

`createNativeStackNavigator` is an alias of `createStackNavigator` — there is
one native-backed stack implementation. Screen `options` support `title`,
header visibility, and a Rayact `animation` option
(`'slide' | 'fade' | 'none'`-style stack transitions).

## Tabs

```tsx
import { createBottomTabNavigator } from '@rayact/navigation';

const Tabs = createBottomTabNavigator();

<Tabs.Navigator>
  <Tabs.Screen name="Feed" component={Feed} options={{ tabBarIcon: 'home' }} />
  <Tabs.Screen name="Settings" component={Settings} options={{ tabBarIcon: 'settings' }} />
</Tabs.Navigator>
```

Tab bars render with the Material `NavigationBar` component; icons are
Material Symbols names. `createMaterialTopTabNavigator` is currently an alias
of the bottom-tab navigator.

## Hooks & actions

Re-exported straight from react-navigation, identical semantics:

`useNavigation`, `useRoute`, `useFocusEffect`, `useIsFocused`,
`useNavigationState`, `CommonActions`, `StackActions`, `TabActions`.

## Back handling

Android hardware back (and desktop Escape) integrates through `BackHandler`:

```ts
import { useBackHandler } from '@rayact/navigation';   // re-export of rayact/react's

useBackHandler(() => {
  if (canGoBack) { goBack(); return true; }   // handled
  return false;                                // let the platform close/minimize
});
```

Navigation containers pop the stack on back automatically; register handlers
only for custom behavior (dismissing sheets, guarding unsaved state).

## Rotation & resize

Navigators re-layout on window resize and device rotation — scenes are not
fixed-size. No configuration needed.
