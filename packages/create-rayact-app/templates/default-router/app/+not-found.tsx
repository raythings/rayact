import React from 'react';
import { View, Text } from 'rayact/react';
import { Link, usePathname } from '@rayact/router';

export default function NotFound() {
  const pathname = usePathname();
  return (
    <View className="screen">
      <Text className="title" style={{ text: { fontSize: 22 } }}>Not found</Text>
      <Text className="subtitle" style={{ text: { fontSize: 14 } }}>{`No route matches ${pathname}`}</Text>
      <Link href="/" className="link" style={{ text: { fontSize: 16 } }}>
        Go home
      </Link>
    </View>
  );
}
