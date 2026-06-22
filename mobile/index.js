// Expo entry point (registers the root component for native + web).
// Plain JS so the web/test toolchain (which aliases react-native → react-native-web)
// does not need the full Expo SDK installed to typecheck/test.
import { registerRootComponent } from "expo";
import App from "./src/App";

// For native persistence across launches, install AsyncStorage and wire it once:
//   import AsyncStorage from "@react-native-async-storage/async-storage";
//   import { setDefaultStorage } from "./src/data/storage";
//   setDefaultStorage(AsyncStorage);
// On web this is unnecessary (localStorage is used automatically).

registerRootComponent(App);
