import * as React from 'react';
import { Text, View } from 'rayact/react';
import { Link, useRouter } from '@rayact/router';

export default function Home() {
  const router = useRouter();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      <Text id="home-title" style={{ text: { fontSize: 24, fontWeight: 'bold' } }}>
        Router Smoke
      </Text>
      <Link href="/details/42" style={{ text: { fontSize: 18 } }}>
        Open details 42
      </Link>
      <View id="push-99" onPress={() => router.push('/details/99')} style={{ padding: 12 }}>
        <Text style={{ text: { fontSize: 18 } }}>Push details 99</Text>
      </View>
      <Link href="/missing/route" style={{ text: { fontSize: 14 } }}>
        Broken link (not-found)
      </Link>
    </View>
  );
}
