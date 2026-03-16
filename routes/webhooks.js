import { Router } from "express";

const router = Router();

// In-memory state map for webhook-based state detection (used by cmux)
const stateMap = {};

router.post("/hooks/claude-state", (req, res) => {
  const { color, state } = req.body;
  if (color && state) {
    stateMap[color] = { state, timestamp: Date.now() };
  }
  res.json({ ok: true });
});

export function getWebhookState(color) {
  const entry = stateMap[color];
  if (!entry) return null;
  // Expire after 2 minutes
  if (Date.now() - entry.timestamp > 120000) {
    delete stateMap[color];
    return null;
  }
  return entry.state;
}

export default router;
