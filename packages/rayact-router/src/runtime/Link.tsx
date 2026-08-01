import * as React from 'react';
import { Pressable, Text } from '@rayact/react';
import type { Href } from './href.js';
import { router } from './imperative.js';

export interface LinkProps {
  href: Href;
  /** Replace the current screen instead of navigating. */
  replace?: boolean;
  /** Always push a new screen, even for a repeated route. */
  push?: boolean;
  style?: Record<string, unknown> | Array<Record<string, unknown> | null | undefined>;
  className?: string;
  onPress?: () => void;
  children?: React.ReactNode;
}

/**
 * Declarative navigation. String children render as pressable Text; anything
 * else is wrapped in a Pressable.
 */
export function Link(props: LinkProps): React.ReactElement {
  const { href, replace, push, style, className, onPress, children } = props;
  const handlePress = () => {
    onPress?.();
    if (replace) router.replace(href);
    else if (push) router.push(href);
    else router.navigate(href);
  };
  if (typeof children === 'string' || typeof children === 'number') {
    return (
      <Text style={style as never} className={className} onPress={handlePress}>
        {String(children)}
      </Text>
    );
  }
  return (
    <Pressable style={style as never} className={className} onPress={handlePress}>
      {children}
    </Pressable>
  );
}

export interface RedirectProps {
  href: Href;
}

/** Immediately replaces the current route when rendered. */
export function Redirect({ href }: RedirectProps): null {
  React.useEffect(() => {
    router.replace(href);
    // Href object identity is unstable across renders; redirect once per target path.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeof href === 'string' ? href : href.pathname]);
  return null;
}
