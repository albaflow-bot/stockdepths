/**
 * 오늘의 시장 브리핑 banner (SPEC §5.5-2). Renders the daily_market_brief as a
 * one-line headline + 강세/약세 섹터 chips — the 맥락(왜) that supports timing, NOT an
 * information dump. Renders `null` when there is no brief (the tab still shows the
 * 시장 헤더 above, so nothing goes blank).
 */

import { View, Text, StyleSheet } from "react-native";
import { tokens } from "../theme/tokens";
import { Badge } from "./Badge";
import type { DailyMarketBrief } from "../types/timing";

export interface MarketBriefBannerProps {
  brief?: DailyMarketBrief;
  testID?: string;
}

export function MarketBriefBanner({ brief, testID = "market-brief" }: MarketBriefBannerProps) {
  if (!brief || !brief.headlineSummary?.trim()) return null;
  const sectors = brief.sectorSignals ?? [];

  return (
    <View style={styles.banner} testID={testID}>
      <Text style={styles.label}>오늘의 시장 브리핑</Text>
      <Text style={styles.headline} testID={`${testID}-headline`}>
        {brief.headlineSummary}
      </Text>
      {sectors.length > 0 ? (
        <View style={styles.sectors}>
          {sectors.map((s) => (
            <Badge
              key={s.sector}
              text={`${s.direction === "strong" ? "강세" : "약세"} · ${s.sector}`}
              tone={s.direction === "strong" ? "positive" : "negative"}
              testID={`${testID}-sector-${s.sector}`}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: tokens.color.surfaceAlt,
    borderRadius: tokens.radius.md,
    padding: tokens.space.md,
    gap: tokens.space.sm,
    marginBottom: tokens.space.md,
  },
  label: { fontSize: tokens.font.size.xs, color: tokens.color.textMuted, fontWeight: tokens.font.weight.medium },
  headline: { fontSize: tokens.font.size.md, color: tokens.color.textPrimary, fontWeight: tokens.font.weight.bold, lineHeight: 22 },
  sectors: { flexDirection: "row", flexWrap: "wrap", gap: tokens.space.sm },
});
