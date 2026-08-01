import * as React from 'react';
import { Text, View } from '@rayact/react';
import { usePathname } from './hooks.js';
import { Link } from './Link.js';

/** Built-in fallback screen used when the app defines no +not-found route. */
export function NotFoundScreen(): React.ReactElement {
  const pathname = usePathname();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 }}>
      <Text style={{ text: { fontSize: 22, fontWeight: 'bold' } }}>Not found</Text>
      <Text style={{ text: { fontSize: 14 } }}>{`No route matches "${pathname}".`}</Text>
      <Link href="/" style={{ text: { fontSize: 16 } }}>
        Go to home screen
      </Link>
    </View>
  );
}
