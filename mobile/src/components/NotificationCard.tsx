import { View, Text, Pressable, StyleSheet } from "react-native";
import { tokens } from "../theme/tokens";
import { Badge } from "./Badge";
import { notificationBadge } from "../notifications/labels";
import { formatRelativeTime } from "../time";
import type { NotificationItem } from "../notifications/types";

export interface NotificationCardProps {
  item: NotificationItem;
  /** Current time (ms) for relative formatting — injectable for tests. */
  nowMs: number;
  onPress: (id: string) => void;
}

/** A single inbox row: type badge, title, one-line contextual advice, time. */
export function NotificationCard({ item, nowMs, onPress }: NotificationCardProps) {
  const badge = notificationBadge(item);
  return (
    <Pressable
      onPress={() => onPress(item.id)}
      accessibilityRole="button"
      testID={`notification-${item.id}`}
      style={[styles.card, item.read ? null : styles.unread]}
    >
      <View style={styles.topRow}>
        <View style={styles.left}>
          {item.read ? null : <View style={styles.dot} testID={`unread-dot-${item.id}`} />}
          <Badge text={badge.label} tone={badge.tone} />
        </View>
        <Text style={styles.time}>{formatRelativeTime(item.createdAt, nowMs)}</Text>
      </View>
      <Text style={styles.title}>{item.title}</Text>
      <Text style={styles.body}>{item.body}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: tokens.color.surface,
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.lg,
    padding: tokens.space.lg,
    marginBottom: tokens.space.md,
    gap: tokens.space.xs,
  },
  unread: { borderColor: tokens.color.primary, backgroundColor: tokens.color.surfaceAlt },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  left: { flexDirection: "row", alignItems: "center", gap: tokens.space.sm },
  dot: { width: 8, height: 8, borderRadius: tokens.radius.pill, backgroundColor: tokens.color.primary },
  time: { fontSize: tokens.font.size.xs, color: tokens.color.textMuted },
  title: { fontSize: tokens.font.size.md, fontWeight: tokens.font.weight.bold, color: tokens.color.textPrimary },
  body: { fontSize: tokens.font.size.sm, color: tokens.color.textSecondary, lineHeight: 20 },
});
