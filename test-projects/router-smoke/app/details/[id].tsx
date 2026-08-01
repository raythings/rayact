import * as React from 'react';
import { Text, View } from 'rayact/react';
import { useLocalSearchParams, usePathname, useRouter } from '@rayact/router';

export default function Details() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const pathname = usePathname();
  const router = useRouter();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      <Text id="details-title" style={{ text: { fontSize: 22 } }}>{`Details ${id}`}</Text>
      <Text style={{ text: { fontSize: 14 } }}>{`pathname: ${pathname}`}</Text>
      <View id="go-back" onPress={() => router.back()} style={{ padding: 12 }}>
        <Text style={{ text: { fontSize: 16 } }}>Back</Text>
      </View>
    </View>
  );
}
