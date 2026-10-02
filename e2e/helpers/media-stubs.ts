import type { Page } from "@playwright/test";

/**
 * Screen-capture (`navigator.mediaDevices.getDisplayMedia`) has no headless
 * Chromium equivalent -- there's no real screen to share, and the picker UI
 * it normally shows can't be automated. This project doesn't attempt to
 * automate the actual recording flow (components/recorder.tsx); it's
 * covered by manual QA instead.
 *
 * This stub exists so that a click on "Start recording" fails fast and
 * predictably (a rejected promise, handled by the component's existing
 * catch block and surfaced as its normal error state) instead of hanging
 * forever waiting on a permission prompt that will never appear. Call this
 * before navigating to a page that renders <Recorder/> if a future test
 * needs to interact with the recording button at all; today's
 * dashboard-to-project test does not click it, so it does not need this.
 */
export async function stubGetDisplayMedia(page: Page) {
  await page.addInitScript(() => {
    if (!navigator.mediaDevices) {
      // @ts-expect-error -- constructing a minimal stand-in for jsdom-less Chromium contexts that lack it entirely.
      navigator.mediaDevices = {};
    }
    navigator.mediaDevices.getDisplayMedia = () =>
      Promise.reject(new DOMException("getDisplayMedia is not available in headless E2E runs.", "NotSupportedError"));
  });
}
