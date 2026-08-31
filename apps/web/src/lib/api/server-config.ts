export function resolveApiServerUrl(
  env: Record<string, string | undefined>,
  nodeEnv: string | undefined,
): string {
  const value = env.API_SERVER_URL?.replace(/\/+$/, "");

  if (value) {
    return value;
  }

  if (nodeEnv !== "production") {
    return "http://localhost:3001";
  }

  throw new Error("API_SERVER_URL is required in production");
}
