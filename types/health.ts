/** Public readiness response deliberately excludes connection details and errors. */
export type HealthResponse = {
  status: "ok" | "unavailable";
  database: "up" | "down";
};
