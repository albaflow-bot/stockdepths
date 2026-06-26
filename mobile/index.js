// Expo entry point (registers the root component for native + web).
// Plain JS so the web/test toolchain (which aliases react-native → react-native-web)
// does not need the full Expo SDK installed to typecheck/test.
import { registerRootComponent } from "expo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import App from "./src/App";
import { setDefaultStorage } from "./src/data/storage";

// 네이티브에서 launch 간 영구 저장 — AsyncStorage 를 프로세스 기본 저장소로 주입.
// 미주입 시 네이티브엔 localStorage 가 없어 인메모리로 폴백 → 성향·관심·보유가 매 실행
// 초기화된다. 웹은 localStorage 를 자동 사용하므로 이 주입도 무해(동일 계약).
setDefaultStorage(AsyncStorage);

registerRootComponent(App);
