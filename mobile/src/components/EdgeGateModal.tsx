import { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet, Platform } from "react-native";
import { tokens, cardShadow } from "../theme/tokens";
import { openExternal } from "./openExternal";
import { addBreadcrumb } from "../resilience/errorLog";
import {
  DIMENSION_LABEL,
  PROHIBITION_TAG_LABEL,
  candidateBadge,
  dimensionBadge,
  type DisplayBadge,
  type EdgeCandidate,
  type EdgeGateResult,
} from "../types/edge";

export interface EdgeGateModalProps {
  visible: boolean;
  result: EdgeGateResult;
  /** Accept the pre-selected recommendation (SPEC §5.4 직면 후 수락). */
  onAccept: (edgeId: string) => void;
  /** Informed override — commit a DIFFERENT candidate than the recommendation. */
  onOverride: (edgeId: string) => void;
  /** 엣지 미감 — proceed without committing an edge (no edge found, or skip). */
  onSkip: () => void;
  /** Injectable external-link opener (default: platform opener). */
  onOpenLink?: (url: string) => void;
}

/**
 * Engineering Edge Gate modal (SPEC §5, Task 3/7). A BLOCKING card the user must
 * face before the detailed SPEC interview: it renders the 2–3 candidate edges with
 * the pre-selected recommendation starred (⭐), an expandable 4-dimension evaluation
 * table per card, verification badges + source links, and the three gate actions.
 *
 * Forced progression (SPEC §5.1 차단형): the modal cannot be dismissed by ESC or by
 * tapping the backdrop — only the Accept / Override / Skip actions move forward. The
 * conclusion is NOT forced (informed override allowed, SPEC §5.4): Skip / Override
 * are always available, even when a recommendation exists.
 */
export function EdgeGateModal({
  visible,
  result,
  onAccept,
  onOverride,
  onSkip,
  onOpenLink = openExternal,
}: EdgeGateModalProps) {
  const { recommendedEdgeId, edgeFound, candidates } = result;
  // Selection starts on the pre-selected recommendation (SPEC §5.2 step 4).
  const [selectedId, setSelectedId] = useState<string | null>(recommendedEdgeId);

  // Re-seed the selection if the gate result changes while mounted.
  useEffect(() => setSelectedId(recommendedEdgeId), [recommendedEdgeId]);

  // 강제진행: swallow ESC on web so the gate can't be dismissed without a decision.
  useEffect(() => {
    if (!visible || Platform.OS !== "web") return;
    const doc = (globalThis as unknown as { document?: Document }).document;
    if (!doc) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        addBreadcrumb("edge-gate ESC blocked (강제진행)");
      }
    };
    doc.addEventListener("keydown", onKey, true);
    return () => doc.removeEventListener("keydown", onKey, true);
  }, [visible]);

  if (!visible) return null;

  const selected = candidates.find((c) => c.id === selectedId) ?? null;
  const canOverride = selected != null && selected.id !== recommendedEdgeId;

  return (
    <View style={styles.backdrop} testID="edge-gate-modal" accessibilityRole="none">
      <View style={styles.sheet}>
        <Text style={styles.title}>공학 엣지 게이트</Text>
        <Text style={styles.subtitle}>
          이 아이디어의 엣지를 먼저 확인하세요. 건너뛸 수는 없지만, 추천을 그대로 받을지·다른
          후보를 고를지·엣지 없이 진행할지는 직접 정합니다.
        </Text>

        {edgeFound ? null : (
          <View style={styles.notFound} testID="edge-gate-not-found">
            <Text style={styles.notFoundText}>
              {result.notFoundReason ?? "검증된 엣지 후보를 찾지 못했습니다."} 아래 후보는 참고용이며,
              엣지 없이 진행하려면 ‘엣지 미감’ 을 선택하세요.
            </Text>
          </View>
        )}

        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          {candidates.map((c) => (
            <CandidateCard
              key={c.id}
              candidate={c}
              recommended={c.id === recommendedEdgeId}
              selected={c.id === selectedId}
              onSelect={() => {
                setSelectedId(c.id);
                addBreadcrumb(`edge-gate select ${c.id}`);
              }}
              onOpenLink={onOpenLink}
            />
          ))}
        </ScrollView>

        <View style={styles.actions}>
          <ActionButton
            label="선택 (추천 수락)"
            testID="edge-gate-accept"
            kind="primary"
            disabled={!edgeFound || !recommendedEdgeId}
            onPress={() => recommendedEdgeId && onAccept(recommendedEdgeId)}
          />
          <ActionButton
            label="다른 후보 선택"
            testID="edge-gate-override"
            kind="secondary"
            disabled={!canOverride}
            onPress={() => selected && onOverride(selected.id)}
          />
          <ActionButton
            label="엣지 미감"
            testID="edge-gate-skip"
            kind="ghost"
            onPress={onSkip}
          />
        </View>
      </View>
    </View>
  );
}

interface CandidateCardProps {
  candidate: EdgeCandidate;
  recommended: boolean;
  selected: boolean;
  onSelect: () => void;
  onOpenLink: (url: string) => void;
}

function CandidateCard({ candidate, recommended, selected, onSelect, onOpenLink }: CandidateCardProps) {
  const [expanded, setExpanded] = useState(recommended); // recommendation opens by default
  const badge = candidateBadge(candidate);

  return (
    <View
      style={[styles.card, selected ? styles.cardSelected : null]}
      testID={`edge-candidate-${candidate.id}`}
    >
      <Pressable
        onPress={onSelect}
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        accessibilityLabel={candidate.title}
        testID={`edge-candidate-select-${candidate.id}`}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>
            {recommended ? "⭐ " : ""}
            {candidate.title}
          </Text>
          <BadgePill badge={badge} testID={`edge-candidate-badge-${candidate.id}`} />
        </View>
        {recommended ? <Text style={styles.recoTag}>추천 (pre-selected)</Text> : null}
        <Text style={styles.field}>
          <Text style={styles.fieldLabel}>데이터 소스 </Text>
          {candidate.dataSource}
        </Text>
        <Text style={styles.field}>
          <Text style={styles.fieldLabel}>파이프라인 </Text>
          {candidate.automationPipeline}
        </Text>
        {candidate.prohibitionTags.length > 0 ? (
          <Text style={styles.dropReason} testID={`edge-candidate-drop-${candidate.id}`}>
            드롭 사유: {candidate.prohibitionTags.map((t) => PROHIBITION_TAG_LABEL[t]).join(", ")}
          </Text>
        ) : null}
      </Pressable>

      <Pressable
        style={styles.toggle}
        onPress={() => setExpanded((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        testID={`edge-eval-toggle-${candidate.id}`}
      >
        <Text style={styles.toggleText}>평가표 {expanded ? "접기 ▲" : "펼치기 ▼"}</Text>
      </Pressable>

      {expanded ? (
        <EvaluationTable candidate={candidate} onOpenLink={onOpenLink} />
      ) : null}
    </View>
  );
}

function EvaluationTable({
  candidate,
  onOpenLink,
}: {
  candidate: EdgeCandidate;
  onOpenLink: (url: string) => void;
}) {
  return (
    <View style={styles.table} testID={`edge-eval-table-${candidate.id}`}>
      <View style={[styles.tr, styles.trHead]}>
        <Text style={[styles.th, styles.colDim]}>차원</Text>
        <Text style={[styles.th, styles.colLevel]}>수준</Text>
        <Text style={[styles.th, styles.colBadge]}>배지</Text>
        <Text style={[styles.th, styles.colSnippet]}>근거</Text>
      </View>
      {candidate.dimensions.map((dim) => {
        const badge = dimensionBadge(dim);
        const v = dim.verification;
        return (
          <View style={styles.tr} key={dim.key}>
            <Text style={[styles.td, styles.colDim]}>{DIMENSION_LABEL[dim.key]}</Text>
            <Text style={[styles.td, styles.colLevel]}>
              {dim.nature === "verifiable" ? (v?.level === "full" ? "풀검증" : "핵심") : "판단"}
            </Text>
            <View style={[styles.td, styles.colBadge]}>
              {badge ? (
                <BadgePill badge={badge} testID={`edge-dim-badge-${candidate.id}-${dim.key}`} />
              ) : (
                <Text style={styles.scoreText}>{dim.score != null ? `${dim.score}/5` : "—"}</Text>
              )}
            </View>
            <View style={[styles.td, styles.colSnippet]}>
              <Text style={styles.snippet}>{v?.snippet ?? dim.assessment}</Text>
              {v?.sourceUrl ? (
                <Pressable
                  onPress={() => onOpenLink(v.sourceUrl!)}
                  accessibilityRole="link"
                  testID={`edge-source-link-${candidate.id}-${dim.key}`}
                >
                  <Text style={styles.link}>출처 보기 ↗</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function BadgePill({ badge, testID }: { badge: DisplayBadge; testID?: string }) {
  const tone =
    badge.kind === "verified"
      ? { bg: tokens.color.positiveBg, fg: tokens.color.positiveFg }
      : badge.kind === "dropped"
        ? { bg: tokens.color.negativeBg, fg: tokens.color.negativeFg }
        : { bg: tokens.color.warningBg, fg: tokens.color.warningFg };
  return (
    <View style={[styles.pill, { backgroundColor: tone.bg }]} testID={testID}>
      <Text style={[styles.pillText, { color: tone.fg }]}>{badge.label}</Text>
    </View>
  );
}

function ActionButton({
  label,
  onPress,
  kind,
  disabled,
  testID,
}: {
  label: string;
  onPress: () => void;
  kind: "primary" | "secondary" | "ghost";
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      testID={testID}
      style={[
        styles.btn,
        kind === "primary" ? styles.btnPrimary : kind === "secondary" ? styles.btnSecondary : styles.btnGhost,
        disabled ? styles.btnDisabled : null,
      ]}
    >
      <Text
        style={[
          styles.btnText,
          kind === "primary" ? styles.btnTextPrimary : styles.btnTextDark,
          disabled ? styles.btnTextDisabled : null,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(15,23,42,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: tokens.space.lg,
    zIndex: 1000,
  },
  sheet: {
    width: "100%",
    maxWidth: 560,
    maxHeight: "90%",
    backgroundColor: tokens.color.bg,
    borderRadius: tokens.radius.lg,
    padding: tokens.space.lg,
    gap: tokens.space.sm,
    ...cardShadow,
  },
  title: { fontSize: tokens.font.size.xl, fontWeight: tokens.font.weight.bold, color: tokens.color.textPrimary },
  subtitle: { fontSize: tokens.font.size.sm, color: tokens.color.textSecondary, lineHeight: 20 },
  notFound: {
    backgroundColor: tokens.color.warningBg,
    borderRadius: tokens.radius.md,
    padding: tokens.space.md,
  },
  notFoundText: { fontSize: tokens.font.size.sm, color: tokens.color.warningFg, lineHeight: 20 },
  list: { marginVertical: tokens.space.sm },
  listContent: { gap: tokens.space.md },
  card: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1.5,
    borderColor: tokens.color.border,
    padding: tokens.space.lg,
    gap: tokens.space.xs,
  },
  cardSelected: { borderColor: tokens.color.primary, backgroundColor: tokens.color.surfaceAlt },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: tokens.space.sm },
  cardTitle: { flex: 1, fontSize: tokens.font.size.lg, fontWeight: tokens.font.weight.bold, color: tokens.color.textPrimary },
  recoTag: { fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.bold, color: tokens.color.primary },
  field: { fontSize: tokens.font.size.sm, color: tokens.color.textPrimary, lineHeight: 20 },
  fieldLabel: { fontWeight: tokens.font.weight.bold, color: tokens.color.textSecondary },
  dropReason: { fontSize: tokens.font.size.xs, color: tokens.color.negativeFg, marginTop: tokens.space.xs },
  toggle: { marginTop: tokens.space.xs, paddingVertical: tokens.space.xs, alignSelf: "flex-start" },
  toggleText: { fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.bold, color: tokens.color.primary },
  table: {
    marginTop: tokens.space.xs,
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.md,
    overflow: "hidden",
  },
  tr: { flexDirection: "row", borderTopWidth: 1, borderTopColor: tokens.color.border },
  trHead: { borderTopWidth: 0, backgroundColor: tokens.color.surfaceAlt },
  th: { fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.bold, color: tokens.color.textSecondary, padding: tokens.space.sm },
  td: { fontSize: tokens.font.size.xs, color: tokens.color.textPrimary, padding: tokens.space.sm },
  colDim: { flex: 2 },
  colLevel: { flex: 1 },
  colBadge: { flex: 1.2, justifyContent: "center" },
  colSnippet: { flex: 3, gap: tokens.space.xs },
  snippet: { fontSize: tokens.font.size.xs, color: tokens.color.textSecondary, lineHeight: 16 },
  scoreText: { fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.bold, color: tokens.color.textPrimary },
  link: { fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.bold, color: tokens.color.primary },
  pill: { paddingVertical: 2, paddingHorizontal: tokens.space.sm, borderRadius: tokens.radius.pill, alignSelf: "flex-start" },
  pillText: { fontSize: tokens.font.size.xs, fontWeight: tokens.font.weight.bold },
  actions: { flexDirection: "row", gap: tokens.space.sm, marginTop: tokens.space.sm, flexWrap: "wrap" },
  btn: { flexGrow: 1, paddingVertical: tokens.space.md, paddingHorizontal: tokens.space.lg, borderRadius: tokens.radius.md, alignItems: "center" },
  btnPrimary: { backgroundColor: tokens.color.primary },
  btnSecondary: { backgroundColor: tokens.color.surface, borderWidth: 1.5, borderColor: tokens.color.primary },
  btnGhost: { backgroundColor: "transparent" },
  btnDisabled: { backgroundColor: tokens.color.mutedBg, borderColor: tokens.color.border },
  btnText: { fontSize: tokens.font.size.sm, fontWeight: tokens.font.weight.bold },
  btnTextPrimary: { color: tokens.color.primaryText },
  btnTextDark: { color: tokens.color.primary },
  btnTextDisabled: { color: tokens.color.textMuted },
});
