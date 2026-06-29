/**
 * NewsWebViewModal — 뉴스 원문을 앱 *내부* 웹뷰로 본다(외부 브라우저 대신, 사용자 요청).
 *
 * 풀스크린 Modal: 상단 바(‹ 뒤로 + 출처 + ⤴ 브라우저) + WebView. 상단 '뒤로'는 웹뷰 내
 * 히스토리가 있으면 한 단계 뒤로(기사 안에서 링크 탐색 후), 없으면 모달을 닫아 원래 화면으로
 * 돌아간다. 안드로이드 하드웨어 백(onRequestClose)도 같은 동작.
 */

import { useRef, useState } from "react";
import { View, Modal, Pressable, Text, ActivityIndicator, StyleSheet, Linking } from "react-native";
import { WebView } from "react-native-webview";
import { tokens } from "../theme/tokens";

export interface NewsWebViewModalProps {
  visible: boolean;
  /** 열 기사 URL. null 이면 렌더 안 함. */
  url: string | null;
  /** 상단 제목(출처명 등). */
  title?: string;
  onClose: () => void;
  testID?: string;
}

export function NewsWebViewModal({ visible, url, title, onClose, testID = "news-webview" }: NewsWebViewModalProps) {
  const ref = useRef<WebView>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [loading, setLoading] = useState(true);

  // 웹뷰 히스토리가 있으면 그 안에서 뒤로, 없으면 모달 닫기(원래 화면 복귀).
  const handleBack = () => {
    if (canGoBack && ref.current) ref.current.goBack();
    else onClose();
  };

  if (!url) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleBack}>
      <View style={styles.container} testID={testID}>
        <View style={styles.header}>
          <Pressable
            onPress={handleBack}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel="뒤로"
            testID={`${testID}-back`}
          >
            <Text style={styles.backText}>‹ 뒤로</Text>
          </Pressable>
          <Text style={styles.title} numberOfLines={1}>
            {title ?? "뉴스"}
          </Text>
          <Pressable
            onPress={() => void Linking.openURL(url)}
            style={styles.extBtn}
            accessibilityRole="button"
            accessibilityLabel="브라우저로 열기"
            testID={`${testID}-ext`}
          >
            <Text style={styles.extText}>⤴</Text>
          </Pressable>
        </View>

        <View style={styles.body}>
          <WebView
            ref={ref}
            source={{ uri: url }}
            onNavigationStateChange={(s) => setCanGoBack(!!s.canGoBack)}
            onLoadStart={() => setLoading(true)}
            onLoadEnd={() => setLoading(false)}
            startInLoadingState
            testID={`${testID}-web`}
          />
          {loading ? (
            <View style={styles.loading} testID={`${testID}-loading`}>
              <ActivityIndicator color={tokens.color.primary} />
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.color.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.sm,
    paddingHorizontal: tokens.space.md,
    paddingVertical: tokens.space.sm,
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
  },
  backBtn: { paddingVertical: 4, paddingRight: tokens.space.sm },
  backText: { fontSize: tokens.font.size.md, fontWeight: tokens.font.weight.bold, color: tokens.color.primary },
  title: { flex: 1, fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.medium, color: tokens.color.textSecondary },
  extBtn: { paddingHorizontal: tokens.space.sm, paddingVertical: 4 },
  extText: { fontSize: tokens.font.size.lg, color: tokens.color.textSecondary },
  body: { flex: 1 },
  loading: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: tokens.color.bg,
  },
});
