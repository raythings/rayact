import React from 'react';
import { ExternalView, type ExternalViewProps } from '@rayact/react';

export type WebViewSource =
  | { uri: string; html?: never; baseUrl?: never }
  | { html: string; baseUrl?: string; uri?: never };

export interface WebViewMessageEvent {
  nativeEvent: { data: string };
}

export interface WebViewNavigation {
  url: string;
  canGoBack: boolean;
  canGoForward: boolean;
}

export interface WebViewProps extends Omit<ExternalViewProps, 'kind'> {
  source: WebViewSource;
  onMessage?: (event: WebViewMessageEvent) => void;
  injectedJavaScript?: string;
  injectedJavaScriptBeforeContentLoaded?: string;
  onLoadStart?: (event: { nativeEvent: { url: string } }) => void;
  onLoadEnd?: (event: { nativeEvent: { url: string } }) => void;
  onError?: (event: { nativeEvent: { description: string } }) => void;
  onNavigationStateChange?: (state: WebViewNavigation) => void;
  javaScriptEnabled?: boolean;
  originWhitelist?: string[];
  scrollEnabled?: boolean;
}

export interface WebViewHandle {
  postMessage(message: string): void;
  injectJavaScript(script: string): void;
  reload(): void;
  goBack(): void;
  goForward(): void;
  stopLoading(): void;
}

type NativeEnvelope = { type: string; data?: string };

export const WebView = React.forwardRef<WebViewHandle, WebViewProps>(function WebView(
  props,
  forwardedRef,
) {
  const {
    source,
    onMessage,
    onLoadStart,
    onLoadEnd,
    onError,
    onNavigationStateChange,
    javaScriptEnabled = true,
    originWhitelist = ['http://*', 'https://*'],
    scrollEnabled = true,
    ...rest
  } = props;
  const [command, setCommand] = React.useState('');
  const sequence = React.useRef(0);
  const issue = React.useCallback((name: string, payload = '') => {
    sequence.current += 1;
    setCommand(`${name}${payload ? `:${payload}` : ''}#${sequence.current}`);
  }, []);

  React.useImperativeHandle(forwardedRef, () => ({
    postMessage: message => issue('post', message),
    injectJavaScript: script => issue('inject', script),
    reload: () => issue('reload'),
    goBack: () => issue('goBack'),
    goForward: () => issue('goForward'),
    stopLoading: () => issue('stopLoading'),
  }), [issue]);

  const onNativeEvent = React.useCallback((raw: string) => {
    let envelope: NativeEnvelope;
    try {
      envelope = JSON.parse(raw) as NativeEnvelope;
    } catch {
      return;
    }
    switch (envelope.type) {
      case 'message':
        onMessage?.({ nativeEvent: { data: envelope.data ?? '' } });
        break;
      case 'loadStart':
        onLoadStart?.({ nativeEvent: { url: envelope.data ?? '' } });
        break;
      case 'loadEnd':
        onLoadEnd?.({ nativeEvent: { url: envelope.data ?? '' } });
        break;
      case 'error':
        onError?.({ nativeEvent: { description: envelope.data ?? '' } });
        break;
      case 'navigationStateChange':
        try {
          onNavigationStateChange?.(JSON.parse(envelope.data ?? '{}') as WebViewNavigation);
        } catch {
          // Ignore malformed platform-view events.
        }
        break;
    }
  }, [onError, onLoadEnd, onLoadStart, onMessage, onNavigationStateChange]);

  const nativeProps = {
    ...rest,
    kind: 'webview',
    sourceUri: 'uri' in source ? source.uri : undefined,
    sourceHtml: 'html' in source ? source.html : undefined,
    baseUrl: 'html' in source ? source.baseUrl : undefined,
    injectedJavaScript: props.injectedJavaScript,
    injectedJavaScriptBeforeContentLoaded: props.injectedJavaScriptBeforeContentLoaded,
    javaScriptEnabled,
    originWhitelist: originWhitelist.join(','),
    scrollEnabled,
    command,
    onNativeEvent,
  };
  return React.createElement(ExternalView, nativeProps as ExternalViewProps);
});

export default WebView;
