/**
 * Integration test globalSetup — runs ONCE before all integration test suites
 * in a separate Node process (not accessible in test workers).
 *
 * Individual test files manage their own MongoMemoryServer connections
 * in beforeAll / afterAll for full isolation.
 */
export default async function globalSetup(): Promise<void> {
  // Nothing to do here — the MongoMemoryServer lifecycle is managed
  // per-test-file (beforeAll / afterAll) so each suite gets a clean DB.
}
