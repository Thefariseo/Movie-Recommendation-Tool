// Whether this browser said "Not now" to the first-visit choices.
const SKIP_KEY = "umbrify_onboarding_skipped_v1";
export function onboardingSkipped() {
  try { return localStorage.getItem(SKIP_KEY) === "1"; } catch { return false; }
}
export function skipOnboarding() {
  try { localStorage.setItem(SKIP_KEY, "1"); } catch { /* storage may be blocked */ }
}
