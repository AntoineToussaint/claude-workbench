export class NoneMultiplexer {
  async createSession(_name, _cwd, _panes, _config) {
    // no-op
  }

  async hasSession(_name) {
    return false;
  }

  async listSessions(_prefix) {
    return [];
  }

  async killSession(_name) {
    // no-op
  }

  async capturePane(_session, _paneIndex, _lines) {
    return null;
  }

  async splitPane(_session, _direction, _cwd, _cmd) {
    // no-op
  }

  async selectPane(_session, _index) {
    // no-op
  }

  async setOption(_session, _key, _value) {
    // no-op
  }

  async setEnv(_session, _key, _value) {
    // no-op
  }

  getAttachCommand(_session) {
    return "";
  }

  getType() {
    return "none";
  }

  getCapabilities() {
    return {
      stateDetection: false,
      notifications: false,
      embeddedBrowser: false,
      splitPanes: false,
    };
  }
}
