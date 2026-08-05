export async function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.NODE_ENV !== "production" &&
    process.env.PETPASS_E2E_UPSTREAM_MOCK === "1"
  ) {
    const { installE2EUpstreamMock } = await import(
      "./tests/e2e/server-upstream-mock"
    );
    installE2EUpstreamMock();
  }
}
