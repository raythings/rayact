import React from 'react';
import { View, Text } from 'rayact/react';
import { useLocalSearchParams, useRouter } from '@rayact/router';

export default function Details() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  return (
    <View className="screen">
      <Text className="title" style={{ text: { fontSize: 22 } }}>{`Details ${id}`}</Text>
      <Text className="subtitle" style={{ text: { fontSize: 14 } }}>
        This screen is app/details/[id].tsx
      </Text>
      <Text className="link" style={{ text: { fontSize: 16 } }} onPress={() => router.back()}>
        ← Back
      </Text>
    </View>
  );
}
