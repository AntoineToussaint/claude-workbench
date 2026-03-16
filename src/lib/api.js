async function api(path, opts) {
  try {
    const r = await fetch(`/api${path}`, {
      headers: { "Content-Type": "application/json" },
      ...opts,
    });
    const text = await r.text();
    const data = text ? JSON.parse(text) : {};
    if (!r.ok) {
      if (typeof data === "object" && data !== null) data.ok = false;
      return data.error ? data : { ok: false, error: `HTTP ${r.status}`, ...data };
    }
    return data;
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export { api };
export default api;
