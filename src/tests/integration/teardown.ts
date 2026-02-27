/**
 * Integration test globalTeardown — runs ONCE after all integration test suites.
 * Clean-up is handled per-test-file in afterAll; nothing extra needed here.
 */
export default async function globalTeardown(): Promise<void> {
  // No-op — each test file tears down its own MongoMemoryServer.
}
