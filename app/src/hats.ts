// Hat colours for the UI (keys are stable; names are user-renameable).
export const HAT_COLORS: Record<string, string> = {
  direction: "#93a8ff", // Steer — soft periwinkle
  build: "#6fcf9f",     // Build — soft green
  distribution: "#ffc46b", // Grow — amber
  ops: "#c2b09c",       // Run — warm taupe
};
export const hatColor = (key: string) => HAT_COLORS[key] || "#8a8f98";
