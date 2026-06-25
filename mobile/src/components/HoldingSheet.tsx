/**
 * HoldingSheet — ＋보유 시 매수가·수량을 받는 바텀시트(검색·발굴 화면 공용).
 * 검색/발굴에서 고른 종목을 잠금 prefill 하고, 성공 시 닫는다. 백드롭 탭으로 취소.
 */

import { View, Modal, Pressable, Text, StyleSheet } from "react-native";
import { tokens } from "../theme/tokens";
import { AddHoldingForm } from "./AddHoldingForm";
import type { HoldingInput } from "../portfolio/types";
import { displayName, type SecuritySearchItem } from "../types/security";

export interface HoldingSheetProps {
  /** 보유 추가 대상(열림). null 이면 닫힘. */
  pending: SecuritySearchItem | null;
  /** 매수가/수량 입력 제출 → 에러 메시지(있으면) 또는 null(성공). */
  onAdd: (input: HoldingInput) => Promise<string | null>;
  onClose: () => void;
  testID?: string;
}

export function HoldingSheet({ pending, onAdd, onClose, testID = "holding-sheet" }: HoldingSheetProps) {
  return (
    <Modal visible={pending != null} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} testID={`${testID}-backdrop`}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          {pending ? (
            <AddHoldingForm
              initialSymbol={pending.code}
              lockSymbol
              title={`${displayName(pending)} 보유 추가`}
              onAdd={onAdd}
            />
          ) : null}
          <Pressable onPress={onClose} style={styles.cancel} testID={`${testID}-cancel`}>
            <Text style={styles.cancelText}>취소</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.45)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: tokens.color.bg,
    padding: tokens.space.md,
    borderTopLeftRadius: tokens.radius.lg,
    borderTopRightRadius: tokens.radius.lg,
    gap: tokens.space.sm,
  },
  cancel: { alignItems: "center", paddingVertical: tokens.space.sm },
  cancelText: { fontSize: tokens.font.size.sm, color: tokens.color.textSecondary, fontWeight: tokens.font.weight.medium },
});
