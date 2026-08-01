import * as React from 'react';
import { Text, View } from 'rayact/react';
import { Link, usePathname } from '@rayact/router';

export default function NotFound() {
  const pathname = usePathname();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      <Text id="not-found-title" style={{ text: { fontSize: 22 } }}>Custom not found</Text>
      <Text style={{ text: { fontSize: 14 } }}>{pathname}</Text>
      <Link href="/" style={{ text: { fontSize: 16 } }}>
        Home
      </Link>
    </View>
  );
}
