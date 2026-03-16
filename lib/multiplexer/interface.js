/**
 * Multiplexer interface contract.
 *
 * All multiplexer backends (tmux, cmux, none) must implement these methods.
 * This file serves as documentation only — there is no base class to extend.
 *
 * @typedef {Object} MultiplexerCapabilities
 * @property {boolean} stateDetection - Can detect Claude Code state from pane content
 * @property {boolean} notifications  - Can send sidebar notifications
 * @property {boolean} embeddedBrowser - Can open an embedded browser panel
 * @property {boolean} splitPanes     - Supports split panes
 */

/**
 * @typedef {Object} SessionConfig
 * @property {Object}  colorDef       - { hex, bg } color definition
 * @property {string}  title          - Window title
 * @property {string|null} clipboardCmd - Clipboard copy command (e.g. "pbcopy")
 * @property {number}  port           - Server port for objective pane
 * @property {string}  color          - Color name (e.g. "blue")
 */

/**
 * @interface Multiplexer
 */

/**
 * Create a new multiplexer session with the given panes.
 * @method
 * @name Multiplexer#createSession
 * @param {string} name - Session name
 * @param {string} cwd  - Working directory
 * @param {Array<{cmd: string|null, focus?: boolean}>} panes - Pane definitions
 * @param {SessionConfig} config - Session configuration
 * @returns {Promise<void>}
 */

/**
 * Check if a session with the given name exists.
 * @method
 * @name Multiplexer#hasSession
 * @param {string} name - Session name
 * @returns {Promise<boolean>}
 */

/**
 * List sessions whose names start with the given prefix.
 * @method
 * @name Multiplexer#listSessions
 * @param {string} prefix - Prefix to filter by
 * @returns {Promise<string[]>}
 */

/**
 * Kill (destroy) a session.
 * @method
 * @name Multiplexer#killSession
 * @param {string} name - Session name
 * @returns {Promise<void>}
 */

/**
 * Capture the content of a pane. Returns the text or null if unavailable.
 * @method
 * @name Multiplexer#capturePane
 * @param {string} session   - Session name
 * @param {number} paneIndex - Zero-based pane index
 * @param {number} lines     - Number of scrollback lines to capture
 * @returns {Promise<string|null>}
 */

/**
 * Split a pane in the given direction.
 * @method
 * @name Multiplexer#splitPane
 * @param {string} session   - Session name
 * @param {"h"|"v"} direction - "h" for horizontal, "v" for vertical
 * @param {string} cwd       - Working directory for the new pane
 * @param {string|null} cmd  - Command to run in the new pane
 * @returns {Promise<void>}
 */

/**
 * Select (focus) a pane by index.
 * @method
 * @name Multiplexer#selectPane
 * @param {string} session - Session name
 * @param {number} index   - Zero-based pane index
 * @returns {Promise<void>}
 */

/**
 * Set a session-level option.
 * @method
 * @name Multiplexer#setOption
 * @param {string} session - Session name
 * @param {string} key     - Option key
 * @param {string} value   - Option value
 * @returns {Promise<void>}
 */

/**
 * Set an environment variable in the session.
 * @method
 * @name Multiplexer#setEnv
 * @param {string} session - Session name
 * @param {string} key     - Variable name
 * @param {string} value   - Variable value
 * @returns {Promise<void>}
 */

/**
 * Get the shell command to attach to a session.
 * Returns an empty string if the multiplexer IS the terminal (e.g. cmux).
 * @method
 * @name Multiplexer#getAttachCommand
 * @param {string} session - Session name
 * @returns {string}
 */

/**
 * Get the multiplexer type identifier.
 * @method
 * @name Multiplexer#getType
 * @returns {"tmux"|"cmux"|"none"}
 */

/**
 * Get the capabilities of this multiplexer backend.
 * @method
 * @name Multiplexer#getCapabilities
 * @returns {MultiplexerCapabilities}
 */
