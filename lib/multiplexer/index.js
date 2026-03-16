import { commandExists } from "../platform.js";
import { existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

let _instance = null;

export function detectMultiplexer() {
  const cmuxSocket = join(homedir(), ".cmux", "socket");
  if (existsSync(cmuxSocket)) return "cmux";
  if (commandExists("tmux")) return "tmux";
  return "none";
}

export async function getMultiplexer(type) {
  if (_instance && (!type || _instance.getType() === type)) return _instance;

  const resolved = type === "auto" || !type ? detectMultiplexer() : type;

  if (resolved === "cmux") {
    const { CmuxMultiplexer } = await import("./cmux.js");
    _instance = new CmuxMultiplexer();
  } else if (resolved === "tmux") {
    const { TmuxMultiplexer } = await import("./tmux.js");
    _instance = new TmuxMultiplexer();
  } else {
    const { NoneMultiplexer } = await import("./none.js");
    _instance = new NoneMultiplexer();
  }

  return _instance;
}

export function resetMultiplexer() {
  _instance = null;
}
