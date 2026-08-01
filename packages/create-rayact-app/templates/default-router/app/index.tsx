import React from 'react';
import { View, Text, Icon } from 'rayact/react';
import { Platform } from 'rayact/shared';
import { Link } from '@rayact/router';

export default function Home() {
  return (
    <View className="screen">
      <Text className="title" style={{ text: { fontSize: 24 } }}>
        __PROJECT_NAME__
      </Text>
      <Text className="subtitle" style={{ text: { fontSize: 15 } }}>
        {`File-based routing on ${Platform.OS}`}
      </Text>
      <View className="tap-row">
        <Icon name="explore" size={28} color={0xFFF176FF} />
        <Text className="subtitle" style={{ text: { fontSize: 15 } }}>
          Edit app/index.tsx — add files to app/ to add routes
        </Text>
      </View>
      <Link href="/details/42" className="link" style={{ text: { fontSize: 17 } }}>
        Open details →
      </Link>
    </View>
  );
}
