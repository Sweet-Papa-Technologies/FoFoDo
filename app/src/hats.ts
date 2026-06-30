// Hat colours for the UI (keys are stable; names are user-renameable).
export const HAT_COLORS: Record<string, string> = {
  direction: "#6c8cff", // Steer
  build: "#3ecf8e",     // Build
  distribution: "#ffce6b", // Grow
  ops: "#8a8f98",       // Run
};
export const hatColor = (key: string) => HAT_COLORS[key] || "#8a8f98";
