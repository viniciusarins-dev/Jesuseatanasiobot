export type AppMode = "dev" | "stream";

/** `?mode=stream` → modo de transmissão; qualquer outro valor → desenvolvedor. */
export function readModeFromUrl(search: string): AppMode {
  const mode = new URLSearchParams(search).get("mode");
  return mode === "stream" ? "stream" : "dev";
}
