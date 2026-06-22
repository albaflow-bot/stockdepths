import { useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { tokens } from "../theme/tokens";
import { LegalDocumentView } from "../components/LegalDocumentView";
import { LEGAL_DOCUMENTS, type LegalDocumentId } from "../legal/content";

export interface LegalScreenProps {
  /** Initial document (tests). */
  initialDocId?: LegalDocumentId;
}

/**
 * 약관 tab — the launch-pack legal pages: 참고 조언 안내 / 이용약관 /
 * 개인정보처리방침 (SPEC Task 11). A segmented selector switches documents.
 */
export function LegalScreen({ initialDocId = "disclaimer" }: LegalScreenProps) {
  const [docId, setDocId] = useState<LegalDocumentId>(initialDocId);
  const active = LEGAL_DOCUMENTS.find((d) => d.id === docId) ?? LEGAL_DOCUMENTS[0]!;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} testID="legal-screen">
      <Text style={styles.title}>약관 · 정책</Text>

      <View style={styles.selector} accessibilityRole="tablist">
        {LEGAL_DOCUMENTS.map((doc) => {
          const selected = doc.id === docId;
          return (
            <Pressable
              key={doc.id}
              onPress={() => setDocId(doc.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={doc.shortLabel}
              testID={`legal-tab-${doc.id}`}
              style={[styles.segment, selected ? styles.segmentActive : null]}
            >
              <Text style={[styles.segmentLabel, selected ? styles.segmentLabelActive : null]}>
                {doc.shortLabel}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <LegalDocumentView document={active} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { backgroundColor: tokens.color.bg },
  content: { padding: tokens.space.lg, paddingBottom: tokens.space.xxl },
  title: { fontSize: tokens.font.size.xxl, fontWeight: tokens.font.weight.bold, color: tokens.color.textPrimary, marginBottom: tokens.space.lg },
  selector: { flexDirection: "row", backgroundColor: tokens.color.surfaceAlt, borderRadius: tokens.radius.md, padding: tokens.space.xs, marginBottom: tokens.space.lg },
  segment: { flex: 1, paddingVertical: tokens.space.sm, alignItems: "center", borderRadius: tokens.radius.sm },
  segmentActive: { backgroundColor: tokens.color.surface, borderWidth: 1, borderColor: tokens.color.primary },
  segmentLabel: { fontSize: tokens.font.size.sm, color: tokens.color.textSecondary, fontWeight: tokens.font.weight.medium },
  segmentLabelActive: { color: tokens.color.primary, fontWeight: tokens.font.weight.bold },
});
