/**
 * 테스트(jsdom/react-native-web) 환경용 react-native-webview 스텁.
 * 실제 네이티브 WebView 는 테스트에서 못 띄우므로, uri 만 들고 있는 더미 View 로 대체한다.
 * vitest.config.ts 의 resolve.alias 가 'react-native-webview' → 이 파일로 매핑.
 */
import { forwardRef, useImperativeHandle } from "react";
import { View } from "react-native";

export const WebView = forwardRef(function WebView(props: Record<string, unknown>, ref) {
  useImperativeHandle(ref, () => ({ goBack: () => {}, goForward: () => {}, reload: () => {} }));
  return <View testID={(props["testID"] as string) ?? "webview"} />;
});

export default WebView;
