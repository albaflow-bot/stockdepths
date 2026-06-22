import { View, Text, StyleSheet } from "react-native";
import { tokens } from "../theme/tokens";
import type { LegalDocument } from "../legal/content";

export interface LegalDocumentViewProps {
  document: LegalDocument;
}

/** Renders a legal document with readable typography (title / intro / sections). */
export function LegalDocumentView({ document }: LegalDocumentViewProps) {
  return (
    <View testID={`legal-doc-${document.id}`}>
      <Text style={styles.title}>{document.title}</Text>
      <Text style={styles.updated}>최종 업데이트 {document.lastUpdated}</Text>
      <Text style={styles.intro}>{document.intro}</Text>
      {document.sections.map((section, i) => (
        <View key={i} style={styles.section}>
          <Text style={styles.heading}>{section.heading}</Text>
          {section.paragraphs.map((p, j) => (
            <Text key={j} style={styles.paragraph}>
              {p}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: tokens.font.size.xl, fontWeight: tokens.font.weight.bold, color: tokens.color.textPrimary },
  updated: { fontSize: tokens.font.size.xs, color: tokens.color.textMuted, marginTop: 2, marginBottom: tokens.space.md },
  intro: { fontSize: tokens.font.size.md, color: tokens.color.textPrimary, lineHeight: 24, marginBottom: tokens.space.lg },
  section: { marginBottom: tokens.space.lg },
  heading: { fontSize: tokens.font.size.md, fontWeight: tokens.font.weight.bold, color: tokens.color.textPrimary, marginBottom: tokens.space.sm },
  paragraph: { fontSize: tokens.font.size.sm, color: tokens.color.textSecondary, lineHeight: 22, marginBottom: tokens.space.sm },
});
