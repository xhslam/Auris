"use strict";

// VMark v0.9.99 single_instance.rs (f2bf1b3fc, ISC) exits a windowless
// non-macOS holder if recovery fails. Electron owns its own instance lock;
// only this failure policy is adapted, not the Win32/Tauri lock probe.
async function recoverSecondInstance({ ensureWindow, hasWindows, platform, onError, quit }) {
  try {
    await ensureWindow();
  } catch (error) {
    // Resolve the launch callback even when recovery fails: no unhandled
    // rejection and no invisible non-macOS lock holder blocking future starts.
    try {
      onError(error);
    } catch {
      // A failed native dialog must not prevent releasing a windowless holder.
    }
    if (platform !== "darwin" && !hasWindows()) quit();
  }
}

module.exports = { recoverSecondInstance };
