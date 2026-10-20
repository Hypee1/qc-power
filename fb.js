import {
  initializeApp, getAuth, setPersistence, browserSessionPersistence, connectAuthEmulator,
  initializeFirestore, connectFirestoreEmulator,
} from "../vendor/firebase.js";
import { firebaseConfig } from "./config.js";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
// Sessione legata alla scheda: chiudi il browser = esci (più sicuro su PC condivisi)
setPersistence(auth, browserSessionPersistence).catch(() => {});
export const db = initializeFirestore(app, { ignoreUndefinedProperties: true });

// Emulatore locale solo per test (http://localhost:xxxx/?emu=1)
export const EMU = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).has("emu");
if (EMU) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}
