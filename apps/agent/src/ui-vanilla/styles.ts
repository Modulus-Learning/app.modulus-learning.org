export const widgetStyles = `
:host {
  all: initial;
}

.root {
  --modulus-offset: 20px;
  --modulus-bg: #111;
  --modulus-panel-bg: #1a1a1a;
  --modulus-fg: #f5f5f5;
  --modulus-muted: #9a9a9a;
  --modulus-border: #333;
  --modulus-accent: #8f8;
  --modulus-warn: #ff0;
  --modulus-error: #f66;
  --modulus-track: #2a2a2a;

  position: fixed;
  z-index: 2147483647;
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
  font-size: 14px;
  color: var(--modulus-fg);
  line-height: 1.4;
}

.root.modulus-pos-bottom-left {
  bottom: var(--modulus-offset);
  left: var(--modulus-offset);
}
.root.modulus-pos-bottom-right {
  bottom: var(--modulus-offset);
  right: var(--modulus-offset);
}
.root.modulus-pos-top-left {
  top: var(--modulus-offset);
  left: var(--modulus-offset);
}
.root.modulus-pos-top-right {
  top: var(--modulus-offset);
  right: var(--modulus-offset);
}

/* ********** Avatar button ********** */

.modulus-avatar {
  position: relative;
  height: 48px;
  width: 48px;
  padding: 6px;
  border-radius: 9999px;
  border: 1px solid var(--modulus-border);
  background-color: var(--modulus-bg);
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
  transition:
    border-color 120ms ease,
    transform 120ms ease;
  font: inherit;
  color: inherit;
}

.modulus-avatar:hover {
  transform: translateY(-1px);
}

.modulus-avatar img {
  display: block;
  width: 100%;
  height: auto;
}

.modulus-avatar .modulus-status-dot {
  position: absolute;
  right: 2px;
  bottom: 2px;
  width: 12px;
  height: 12px;
  border-radius: 9999px;
  border: 2px solid var(--modulus-bg);
  background-color: var(--modulus-muted);
}

.modulus-avatar.modulus-status-connected {
  border-color: var(--modulus-accent);
}
.modulus-avatar.modulus-status-connected .modulus-status-dot {
  background-color: var(--modulus-accent);
}

.modulus-avatar.modulus-status-connection-lost,
.modulus-avatar.modulus-status-session-expired {
  border-color: var(--modulus-warn);
}
.modulus-avatar.modulus-status-connection-lost .modulus-status-dot,
.modulus-avatar.modulus-status-session-expired .modulus-status-dot {
  background-color: var(--modulus-warn);
}

.modulus-avatar.modulus-status-error,
.modulus-avatar.modulus-status-load-failed {
  border-color: var(--modulus-error);
}
.modulus-avatar.modulus-status-error .modulus-status-dot,
.modulus-avatar.modulus-status-load-failed .modulus-status-dot {
  background-color: var(--modulus-error);
}

/* ********** Panel ********** */

.modulus-panel {
  position: absolute;
  min-width: 260px;
  max-width: 320px;
  padding: 12px 14px;
  background-color: var(--modulus-panel-bg);
  border: 1px solid var(--modulus-border);
  border-radius: 10px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
  opacity: 0;
  pointer-events: none;
  transform: translateY(4px);
  transition:
    opacity 140ms ease,
    transform 140ms ease;
  box-sizing: border-box;
}

.root.modulus-open .modulus-panel {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
}

.root.modulus-pos-bottom-left .modulus-panel {
  bottom: 60px;
  left: 0;
}
.root.modulus-pos-bottom-right .modulus-panel {
  bottom: 60px;
  right: 0;
}
.root.modulus-pos-top-left .modulus-panel {
  top: 60px;
  left: 0;
}
.root.modulus-pos-top-right .modulus-panel {
  top: 60px;
  right: 0;
}

.modulus-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.modulus-panel-title {
  font-weight: 600;
  font-size: 14px;
}

.modulus-panel-close {
  background: none;
  border: none;
  color: var(--modulus-muted);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  padding: 0 4px;
  font-family: inherit;
}
.modulus-panel-close:hover {
  color: var(--modulus-fg);
}

.modulus-status-line {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--modulus-muted);
}

.modulus-status-line .modulus-status-dot {
  position: static;
  width: 8px;
  height: 8px;
  border: none;
  border-radius: 9999px;
  background-color: var(--modulus-muted);
}

.modulus-status-line.modulus-status-connected .modulus-status-dot {
  background-color: var(--modulus-accent);
}
.modulus-status-line.modulus-status-connection-lost .modulus-status-dot,
.modulus-status-line.modulus-status-session-expired .modulus-status-dot {
  background-color: var(--modulus-warn);
}
.modulus-status-line.modulus-status-error .modulus-status-dot,
.modulus-status-line.modulus-status-load-failed .modulus-status-dot {
  background-color: var(--modulus-error);
}

.modulus-user {
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 500;
}

.modulus-progress {
  margin-bottom: 4px;
}

.modulus-progress-label {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--modulus-muted);
  margin-bottom: 4px;
}

.modulus-progress-track {
  position: relative;
  height: 6px;
  width: 100%;
  background-color: var(--modulus-track);
  border-radius: 9999px;
  overflow: hidden;
}

.modulus-progress-local {
  position: absolute;
  inset: 0 auto 0 0;
  background-color: #4a7a4a;
  border-radius: 9999px;
  z-index: 1;
}

.modulus-progress-submitted {
  position: absolute;
  inset: 0 auto 0 0;
  background-color: var(--modulus-accent);
  border-radius: 9999px;
  z-index: 2;
}

.modulus-sync-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 8px;
  min-height: 20px;
}

.modulus-sync-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 8px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 500;
  border: 1px solid transparent;
  background-color: var(--modulus-track);
  color: var(--modulus-fg);
  line-height: 1.3;
}

.modulus-sync-pill::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 9999px;
  background-color: currentColor;
}

.modulus-sync-pill.modulus-sync-saved {
  color: var(--modulus-accent);
  background-color: rgba(136, 255, 136, 0.08);
  border-color: rgba(136, 255, 136, 0.25);
}

.modulus-sync-pill.modulus-sync-saving {
  color: var(--modulus-warn);
  background-color: rgba(255, 255, 0, 0.08);
  border-color: rgba(255, 255, 0, 0.25);
}

.modulus-sync-pill.modulus-sync-unsaved {
  color: var(--modulus-error);
  background-color: rgba(255, 102, 102, 0.08);
  border-color: rgba(255, 102, 102, 0.25);
}

.modulus-saved-time {
  font-size: 11px;
  color: var(--modulus-muted);
}

.modulus-retry {
  margin-top: 10px;
  width: 100%;
  padding: 6px 10px;
  background-color: var(--modulus-bg);
  color: var(--modulus-fg);
  border: 1px solid var(--modulus-border);
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  font-family: inherit;
}
.modulus-retry:hover {
  border-color: var(--modulus-accent);
}

.modulus-overlay {
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  display: none;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background-color: rgba(0, 0, 0, 0.6);
  box-sizing: border-box;
}
.modulus-overlay.modulus-overlay-open {
  display: flex;
}

.modulus-overlay-dialog {
  width: 100%;
  max-width: 360px;
  padding: 20px;
  box-sizing: border-box;
  background-color: var(--modulus-panel-bg);
  border: 1px solid var(--modulus-border);
  border-radius: 12px;
  box-shadow: 0 20px 48px rgba(0, 0, 0, 0.5);
}

.modulus-overlay-title {
  margin: 0 0 8px;
  font-size: 15px;
  font-weight: 600;
  color: var(--modulus-fg);
}

.modulus-overlay-body {
  margin: 0 0 16px;
  font-size: 13px;
  color: var(--modulus-muted);
}

.modulus-overlay-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}

.modulus-overlay-btn {
  flex: 1;
  padding: 8px 10px;
  background-color: var(--modulus-bg);
  color: var(--modulus-fg);
  border: 1px solid var(--modulus-border);
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  font-family: inherit;
}
.modulus-overlay-btn:hover {
  border-color: var(--modulus-accent);
}

.modulus-overlay-danger {
  width: 100%;
  padding: 4px;
  background: none;
  border: none;
  color: var(--modulus-error);
  font-size: 11px;
  cursor: pointer;
  font-family: inherit;
  text-align: center;
}
.modulus-overlay-danger:hover {
  text-decoration: underline;
}

.modulus-overlay-status {
  margin: 0 0 12px;
  font-size: 12px;
  color: var(--modulus-muted);
}
.modulus-overlay-status:empty {
  margin: 0;
}
.modulus-overlay-status.modulus-overlay-status-error {
  color: var(--modulus-error);
}

.modulus-overlay-btn[aria-disabled='true'],
.modulus-overlay-danger[aria-disabled='true'] {
  opacity: 0.6;
  cursor: default;
}
.modulus-overlay-btn[aria-disabled='true']:hover {
  border-color: var(--modulus-border);
}
.modulus-overlay-danger[aria-disabled='true']:hover {
  text-decoration: none;
}

.modulus-spinner {
  display: inline-block;
  width: 12px;
  height: 12px;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 9999px;
  vertical-align: -2px;
  animation: modulus-spin 0.6s linear infinite;
}

@keyframes modulus-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .modulus-spinner {
    animation: none;
  }
}
`
