/**
 * Minimal ambient declaration for the `react-native` module.
 *
 * The client is an Expo / React Native app, so source imports the idiomatic
 * `react-native` primitives. At build/test time on web these resolve to
 * `react-native-web` (aliased in vitest.config.ts). We declare only the surface
 * this app uses, so typecheck passes without pulling the full react-native
 * package into a web-test toolchain. On a real Expo build, the genuine
 * `react-native` types apply.
 */

declare module "react-native" {
  import type * as React from "react";

  export type StyleProp = Record<string, unknown> | Array<Record<string, unknown> | false | null | undefined>;

  export interface LayoutChangeEvent {
    nativeEvent: { layout: { x: number; y: number; width: number; height: number } };
  }
  export interface GestureResponderEvent {
    nativeEvent: { locationX: number; locationY: number; pageX: number; pageY: number };
  }

  export interface ViewProps {
    style?: StyleProp;
    children?: React.ReactNode;
    testID?: string;
    accessibilityRole?: string;
    accessibilityLabel?: string;
    accessible?: boolean;
    pointerEvents?: "auto" | "none" | "box-none" | "box-only";
    onLayout?: (e: LayoutChangeEvent) => void;
    onStartShouldSetResponder?: () => boolean;
    onMoveShouldSetResponder?: () => boolean;
    onResponderGrant?: (e: GestureResponderEvent) => void;
    onResponderMove?: (e: GestureResponderEvent) => void;
    onResponderRelease?: (e: GestureResponderEvent) => void;
    onResponderTerminationRequest?: () => boolean;
    onResponderTerminate?: (e: GestureResponderEvent) => void;
  }
  export const View: React.ComponentType<ViewProps>;

  export interface TextProps {
    style?: StyleProp;
    children?: React.ReactNode;
    testID?: string;
    numberOfLines?: number;
    accessibilityRole?: string;
    accessibilityLabel?: string;
    selectable?: boolean;
  }
  export const Text: React.ComponentType<TextProps>;

  export interface PressableStateCallbackType {
    pressed: boolean;
  }
  export interface PressableProps {
    style?: StyleProp | ((state: PressableStateCallbackType) => StyleProp);
    children?: React.ReactNode | ((state: PressableStateCallbackType) => React.ReactNode);
    onPress?: () => void;
    testID?: string;
    accessibilityRole?: string;
    accessibilityLabel?: string;
    accessibilityState?: { expanded?: boolean; disabled?: boolean; selected?: boolean; checked?: boolean };
    disabled?: boolean;
  }
  export const Pressable: React.ComponentType<PressableProps>;

  export interface ScrollViewProps extends ViewProps {
    contentContainerStyle?: StyleProp;
    horizontal?: boolean;
    showsVerticalScrollIndicator?: boolean;
    showsHorizontalScrollIndicator?: boolean;
    stickyHeaderIndices?: number[];
    keyboardShouldPersistTaps?: "always" | "never" | "handled";
  }
  export const ScrollView: React.ComponentType<ScrollViewProps>;

  export interface ModalProps {
    visible?: boolean;
    transparent?: boolean;
    animationType?: "none" | "slide" | "fade";
    onRequestClose?: () => void;
    children?: React.ReactNode;
    testID?: string;
  }
  export const Modal: React.ComponentType<ModalProps>;

  export interface ActivityIndicatorProps {
    size?: "small" | "large" | number;
    color?: string;
    testID?: string;
  }
  export const ActivityIndicator: React.ComponentType<ActivityIndicatorProps>;

  export interface TextInputProps {
    style?: StyleProp;
    value?: string;
    defaultValue?: string;
    onChangeText?: (text: string) => void;
    onSubmitEditing?: () => void;
    placeholder?: string;
    placeholderTextColor?: string;
    keyboardType?: "default" | "number-pad" | "decimal-pad" | "numeric" | "email-address" | "phone-pad";
    autoCapitalize?: "none" | "sentences" | "words" | "characters";
    autoCorrect?: boolean;
    editable?: boolean;
    maxLength?: number;
    returnKeyType?: string;
    testID?: string;
    accessibilityLabel?: string;
  }
  export const TextInput: React.ComponentType<TextInputProps>;

  export interface SafeAreaViewProps extends ViewProps {}
  export const SafeAreaView: React.ComponentType<SafeAreaViewProps>;

  export const StyleSheet: {
    create<T extends Record<string, Record<string, unknown>>>(styles: T): T;
    flatten(style?: StyleProp): Record<string, unknown>;
    hairlineWidth: number;
    absoluteFillObject: Record<string, unknown>;
  };

  export const Platform: {
    OS: "ios" | "android" | "web" | "windows" | "macos";
    select<T>(spec: { ios?: T; android?: T; web?: T; default?: T }): T | undefined;
  };

  export const Linking: {
    openURL(url: string): Promise<void>;
    canOpenURL(url: string): Promise<boolean>;
  };
}
