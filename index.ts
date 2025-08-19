#!/usr/bin/env bun
import { main } from "./src/main";

main().catch(async (error) => {
  const { ui } = await import("./src/ui");
  const message = error instanceof Error ? error.message : String(error);
  ui.error(`Fatal error: ${message}`);
  process.exit(1);
});
