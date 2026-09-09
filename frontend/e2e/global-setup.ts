import { BACKEND_URL } from "../playwright.config";

/**
 * Runs once before any test, against the freshly-started isolated backend
 * (playwright.config.ts's webServer). Warms the AML dataset's
 * process-lifetime cache (`functools.lru_cache` in
 * backend/app/services/aml_dataset.py -- parses the 27,511-row CSV once)
 * so the first real request to it, made by whichever test happens to run
 * concurrently with several others, isn't also paying for that parse on
 * top of Playwright's assertion timeout. A no-op (harmless 500) when the
 * AML dataset artifact isn't present -- e2e/aml.spec.ts already skips
 * itself in that case.
 */
export default async function globalSetup() {
  try {
    await fetch(`${BACKEND_URL}/api/aml/summary`);
  } catch {
    // Backend not up yet / AML dataset unavailable -- nothing to warm.
  }
}
