import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from "@react-native-google-signin/google-signin";
import Constants from "expo-constants";

/**
 * The "Web application" OAuth client ID from Google Cloud Console. Google puts it in the ID
 * token's audience, and the API checks it (GOOGLE_CLIENT_IDS in backend/.env).
 * The Android OAuth client (package name + SHA-1) must also exist in the same Cloud project.
 */
const WEB_CLIENT_ID = ((Constants.expoConfig?.extra?.googleWebClientId as string | undefined) ?? "").trim();

let configured = false;

export function isGoogleConfigured() {
  return WEB_CLIENT_ID.length > 0;
}

function configure() {
  if (configured) return;
  GoogleSignin.configure({ webClientId: WEB_CLIENT_ID, scopes: ["email", "profile"] });
  configured = true;
}

export class GoogleSignInError extends Error {}

/** Shows Google's account picker. Returns an ID token, or null if the user cancelled. */
export async function getGoogleIdToken(): Promise<string | null> {
  if (!isGoogleConfigured()) {
    throw new GoogleSignInError("Google sign-in isn't set up in this build yet.");
  }
  configure();
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const res = await GoogleSignin.signIn();
    if (!isSuccessResponse(res)) return null;
    const token = res.data.idToken;
    if (!token) throw new GoogleSignInError("Google didn't return a sign-in token. Check the web client ID.");
    return token;
  } catch (e) {
    if (e instanceof GoogleSignInError) throw e;
    if (isErrorWithCode(e)) {
      if (e.code === statusCodes.SIGN_IN_CANCELLED) return null;
      if (e.code === statusCodes.IN_PROGRESS) return null;
      if (e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        throw new GoogleSignInError("Google Play services isn't available on this device.");
      }
      // DEVELOPER_ERROR (10): the Android OAuth client's package name / SHA-1 doesn't match this app.
      if (String(e.code) === "10" || /DEVELOPER_ERROR/i.test(String(e.message))) {
        throw new GoogleSignInError("Google sign-in isn't set up for this app's signing key (SHA-1).");
      }
    }
    throw new GoogleSignInError(e instanceof Error ? e.message : "Google sign-in failed.");
  }
}

/** Forget the Google account on this device, so the next sign-in shows the account picker. */
export async function googleSignOut() {
  if (!configured) return;
  try {
    await GoogleSignin.signOut();
  } catch {
    // not signed in with Google
  }
}
