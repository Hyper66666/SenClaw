export function resolveGatewayProxyTarget(
  env: Record<string, string | undefined> = process.env,
): string {
  const port = env.SENCLAW_GATEWAY_PORT?.trim() || "4100";
  return `http://localhost:${port}`;
}
