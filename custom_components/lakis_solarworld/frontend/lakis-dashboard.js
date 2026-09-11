/* LAKIS SOLARWORLD Dashboard
 * Dashboard UI
 * Version 1.1.4
 *
 * Design:
 * - black / near-black background
 * - optional individual background image per tab
 * - stable settings controls (no rerender while selecting entities)
 * - live overview values
 */

class LakisSolarworldDashboard extends HTMLElement {
  constructor() {
    super();

    this._hass = null;
    this._entry = null;
    this._config = {};
    this._tab = "overview";
    this._loading = true;
    this._message = "";
    this._rendered = false;
    this._saveTimer = null;
    this._saveInFlight = false;
    this._dirty = false;
  }

  set hass(value) {
    this._hass = value;

    if (this._loading && value) {
      this._load();
      return;
    }

    // IMPORTANT:
    // Never rebuild the settings DOM while an iPad <select> is open.
    if (this._tab !== "settings") {
      this._render();
    }
  }

  set panel(value) {
    const entryId = value?.config?.entry_id || value?.entry_id;
    if (entryId && entryId !== this._entry) {
      this._entry = entryId;
      this._load();
    }
  }

  setConfig(config) {
    if (config?.entry_id && config.entry_id !== this._entry) {
      this._entry = config.entry_id;
      this._load();
    }
  }

  async _load() {
    if (!this._hass || !this._entry) return;

    try {
      this._loading = true;

      const result = await this._hass.callWS({
        type: "lakis_solarworld/get_config",
        entry_id: this._entry,
      });

      this._config = result?.config || result || {};
      this._config.backgrounds = {
        overview: "",
        pv: "",
        grid: "",
        battery: "",
        settings: "",
        ...(this._config.backgrounds || {}),
      };

      this._loading = false;
      this._render();
    } catch (err) {
      console.error("LAKIS SOLARWORLD:", err);
      this._loading = false;
      this._message = "Konfiguration konnte nicht geladen werden.";
      this._render();
    }
  }

  _enabled(module) {
    const modules = this._config.modules || {};
    return modules[module] !== false;
  }

  _entity(key) {
    return this._config[key] || "";
  }

  _state(entityId) {
    if (!this._hass || !entityId) return null;
    return this._hass.states?.[entityId] || null;
  }

  _number(entityId) {
    const state = this._state(entityId);
    if (!state) return null;
    const value = Number(state.state);
    return Number.isFinite(value) ? value : null;
  }

  _formatPower(value) {
    if (value === null || value === undefined || !Number.isFinite(value)) {
      return "—";
    }
    return `${Math.round(value).toLocaleString("de-DE")} W`;
  }

  _formatPercent(value) {
    if (value === null || value === undefined || !Number.isFinite(value)) {
      return "—";
    }
    return `${Math.round(value)} %`;
  }

  _formatTemp(value) {
    if (value === null || value === undefined || !Number.isFinite(value)) {
      return "—";
    }
    return `${value.toFixed(1).replace(".", ",")} °C`;
  }

  _domain(entityId) {
    if (!entityId || !entityId.includes(".")) return "";
    return entityId.split(".")[0];
  }

  _entityOptions(domains = []) {
    if (!this._hass?.states) return [];

    return Object.entries(this._hass.states)
      .filter(([id]) => !domains.length || domains.includes(this._domain(id)))
      .map(([id, state]) => ({
        id,
        name: state.attributes?.friendly_name || id,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "de"));
  }

  _entitySelect(key, label, domains = [], description = "") {
    const current = this._entity(key);
    const entities = this._entityOptions(domains);

    return `
      <div class="entity-setting">
        <label>${this._escape(label)}</label>
        ${description ? `<div class="setting-description">${this._escape(description)}</div>` : ""}
        <select data-entity-key="${this._escape(key)}">
          <option value="">— Keine Entität —</option>
          ${entities.map((entity) => `
            <option
              value="${this._escape(entity.id)}"
              ${entity.id === current ? "selected" : ""}
            >
              ${this._escape(entity.name)} — ${this._escape(entity.id)}
            </option>
          `).join("")}
        </select>
      </div>
    `;
  }

  _checkbox(module, label, description = "") {
    const enabled = this._enabled(module);

    return `
      <div class="module-switch">
        <label class="switch-row">
          <input
            type="checkbox"
            data-module="${this._escape(module)}"
            ${enabled ? "checked" : ""}
          />
          <span class="switch-box"></span>
          <span class="switch-text">
            <strong>${this._escape(label)}</strong>
            <small>${this._escape(description)}</small>
          </span>
        </label>
      </div>
    `;
  }

  _escape(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  _backgroundFor(tab = this._tab) {
    const url = this._config.backgrounds?.[tab] || "";
    return url;
  }

  _render() {
    if (!this._hass) return;

    const bg = this._backgroundFor();

    this.innerHTML = `
      <style>
        :host {
          display: block;
          min-height: 100vh;
          color: #f4f8fc;
          font-family:
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            Roboto,
            Arial,
            sans-serif;
          background: #000;
        }

        * { box-sizing: border-box; }

        .app {
          min-height: 100vh;
          padding: 24px;
          position: relative;
          overflow: hidden;
          background:
            linear-gradient(
              rgba(0,0,0,.82),
              rgba(0,0,0,.92)
            ),
            ${bg ? `url("${this._escape(bg)}")` : "none"};
          background-size: cover;
          background-position: center;
          background-attachment: fixed;
        }

        .app::before {
          content: "";
          position: fixed;
          inset: 0;
          pointer-events: none;
          background:
            radial-gradient(
              circle at 50% 0%,
              rgba(0,120,190,.12),
              transparent 48%
            );
        }

        .header {
          position: relative;
          min-height: 88px;
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: center;
          margin-bottom: 18px;
        }

        .brand {
          grid-column: 2;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 14px;
        }

        .brand-logo {
          width: 190px;
          max-height: 72px;
          object-fit: contain;
          filter: drop-shadow(0 0 14px rgba(0,180,255,.2));
        }

        .brand-title {
          font-size: 28px;
          font-weight: 800;
          letter-spacing: .5px;
          white-space: nowrap;
        }

        .brand-subtitle {
          margin-top: 4px;
          color: #e8f2f8;
          font-size: 13px;
          text-align: center;
        }

        .clock {
          grid-column: 3;
          justify-self: end;
          color: #8ca6bd;
          font-size: 13px;
          line-height: 1.45;
          text-align: right;
        }

        .tabs {
          position: relative;
          display: flex;
          justify-content: center;
          gap: 10px;
          flex-wrap: wrap;
          margin-bottom: 20px;
        }

        .tab {
          border: 1px solid rgba(0,175,255,.35);
          background: rgba(5,14,22,.82);
          color: #9ab1c7;
          padding: 11px 18px;
          border-radius: 13px;
          cursor: pointer;
          font-size: 14px;
          transition: .2s;
        }

        .tab:hover,
        .tab.active {
          color: #fff;
          border-color: #00aaff;
          background: rgba(0,130,210,.2);
          box-shadow:
            0 0 16px rgba(0,160,255,.22),
            inset 0 0 16px rgba(0,160,255,.05);
        }

        .dashboard-grid {
          position: relative;
          display: grid;
          grid-template-columns: minmax(0, 2.2fr) minmax(280px, .9fr);
          gap: 16px;
        }

        .flow-card,
        .card,
        .settings-card,
        .side-card {
          background:
            linear-gradient(
              145deg,
              rgba(4,12,19,.92),
              rgba(0,0,0,.88)
            );
          border: 1px solid rgba(0,170,255,.32);
          border-radius: 20px;
          box-shadow:
            0 18px 60px rgba(0,0,0,.4),
            inset 0 1px 0 rgba(255,255,255,.025);
          backdrop-filter: blur(10px);
        }

        .flow-card {
          padding: 20px;
          min-height: 400px;
        }

        .section-title {
          font-size: 17px;
          font-weight: 750;
          margin-bottom: 18px;
        }

        .flow {
          min-height: 310px;
          display: grid;
          grid-template-columns: 1fr 1.1fr 1fr;
          grid-template-rows: 1fr 1fr;
          gap: 18px;
          align-items: center;
        }

        .energy-node {
          min-height: 105px;
          padding: 14px;
          border-radius: 17px;
          background: rgba(2,8,13,.9);
          border: 1px solid rgba(0,170,255,.42);
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          text-align: center;
          box-shadow: 0 0 20px rgba(0,130,220,.05);
        }

        .energy-icon { font-size: 28px; margin-bottom: 7px; }
        .energy-name { color: #ffffff; font-size: 12px; margin-bottom: 4px; }
        .energy-value { font-size: 20px; font-weight: 800; color: #ffffff !important; -webkit-text-fill-color: #ffffff !important; text-shadow: 0 0 10px rgba(255,255,255,.18); }

        .pv {
          border-color: rgba(45,230,130,.7);
          box-shadow: 0 0 24px rgba(45,230,130,.08);
        }

        .grid {
          border-color: rgba(255,70,80,.65);
        }

        .battery {
          border-color: rgba(70,145,255,.7);
        }

        .house {
          grid-column: 2;
          grid-row: 1 / span 2;
          min-height: 150px;
        }

        .pv-node { grid-column: 1; grid-row: 1; }
        .grid-node { grid-column: 3; grid-row: 1; }
        .battery-node { grid-column: 1; grid-row: 2; }
        .wallbox-node { grid-column: 3; grid-row: 2; }

        .side-column {
          display: grid;
          gap: 12px;
          align-content: start;
        }

        .side-card {
          min-height: 105px;
          padding: 16px;
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .side-icon { font-size: 30px; }
        .side-name { color: #ffffff; font-size: 12px; }
        .side-value { font-size: 21px; font-weight: 800; margin-top: 4px; color: #ffffff !important; -webkit-text-fill-color: #ffffff !important; text-shadow: 0 0 10px rgba(255,255,255,.18); }

        .summary {
          position: relative;
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
          margin-top: 14px;
        }

        .summary .card {
          padding: 17px;
        }

        .card-label {
          color: #e1edf5;
          font-size: 11px;
          margin-bottom: 7px;
        }

        .card-value {
          font-size: 21px;
          color: #ffffff;
          text-shadow: 0 0 8px rgba(255,255,255,.10);
          font-weight: 800;
        }

        .settings-grid {
          position: relative;
          display: grid;
          grid-template-columns: minmax(280px,.85fr) minmax(0,1.15fr);
          gap: 16px;
        }

        .settings-card {
          padding: 21px;
        }

        .settings-card.full {
          grid-column: 1 / -1;
        }

        .settings-card h3 {
          margin: 0 0 6px;
          font-size: 18px;
        }

        .settings-card > p {
          margin: 0 0 18px;
          color: #7790a6;
          font-size: 13px;
        }

        .module-switch {
          border-bottom: 1px solid rgba(100,150,190,.1);
        }

        .switch-row {
          display: flex;
          align-items: center;
          gap: 13px;
          padding: 13px 0;
          cursor: pointer;
        }

        .switch-row input { display: none; }

        .switch-box {
          width: 44px;
          height: 24px;
          border-radius: 20px;
          background: #182530;
          position: relative;
          flex: 0 0 auto;
          transition: .2s;
        }

        .switch-box::after {
          content: "";
          position: absolute;
          width: 18px;
          height: 18px;
          top: 3px;
          left: 3px;
          border-radius: 50%;
          background: #7f94a5;
          transition: .2s;
        }

        .switch-row input:checked + .switch-box {
          background: #00aef3;
          box-shadow: 0 0 16px rgba(0,174,243,.4);
        }

        .switch-row input:checked + .switch-box::after {
          left: 23px;
          background: #fff;
        }

        .switch-text {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .switch-text small {
          color: #d0dee8;
          font-size: 11px;
        }

        .entity-setting {
          margin-bottom: 17px;
        }

        .entity-setting label {
          display: block;
          margin-bottom: 7px;
          color: #c8d5df;
          font-size: 13px;
          font-weight: 700;
        }

        .setting-description {
          color: #71889e;
          font-size: 11px;
          margin-bottom: 7px;
        }

        select,
        input[type="text"] {
          width: 100%;
          min-height: 44px;
          border-radius: 11px;
          border: 1px solid rgba(0,170,255,.45);
          background: #030a10;
          color: #fff;
          padding: 10px 12px;
          outline: none;
          font-size: 13px;
        }

        select:focus,
        input:focus {
          border-color: #00b7ff;
          box-shadow: 0 0 0 2px rgba(0,180,255,.12);
        }

        .background-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0,1fr));
          gap: 12px;
        }

        .background-item {
          padding: 14px;
          border: 1px solid rgba(0,170,255,.22);
          border-radius: 15px;
          background: rgba(0,0,0,.4);
        }

        .background-item strong {
          display: block;
          margin-bottom: 9px;
        }

        .background-preview {
          height: 110px;
          border-radius: 11px;
          background: #000 center/cover no-repeat;
          border: 1px solid rgba(0,170,255,.2);
          margin-bottom: 10px;
        }

        .upload-row {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .button,
        .save-button {
          border: 1px solid rgba(0,180,255,.55);
          border-radius: 11px;
          padding: 10px 14px;
          color: #fff;
          background: rgba(0,120,190,.18);
          cursor: pointer;
          font-weight: 700;
        }

        .save-button {
          background: linear-gradient(135deg,#007ec7,#00b9f3);
          box-shadow: 0 8px 24px rgba(0,160,230,.2);
        }

        .button:hover,
        .save-button:hover {
          filter: brightness(1.12);
        }

        .upload-input {
          display: none;
        }

        .message {
          color: #6ce3a1;
          font-size: 13px;
          margin-bottom: 10px;
        }

        .empty {
          position: relative;
          padding: 50px 20px;
          text-align: center;
          color: #7890a6;
        }

        .footer {
          position: relative;
          text-align: center;
          color: #9fb5c5;
          font-size: 10px;
          padding: 18px 0 4px;
        }

        @media (max-width: 1000px) {
          .dashboard-grid,
          .settings-grid {
            grid-template-columns: 1fr;
          }

          .summary {
            grid-template-columns: repeat(2,1fr);
          }

          .settings-card.full {
            grid-column: auto;
          }
        }

        @media (max-width: 700px) {
          .app { padding: 12px; }

          .header {
            grid-template-columns: 1fr;
            gap: 8px;
          }

          .brand {
            grid-column: 1;
            flex-direction: column;
          }

          .brand-title {
            font-size: 22px;
            white-space: normal;
            text-align: center;
          }

          .clock {
            grid-column: 1;
            justify-self: center;
            text-align: center;
          }

          .flow {
            grid-template-columns: 1fr 1fr;
            grid-template-rows: auto auto auto;
          }

          .house {
            grid-column: 1 / span 2;
            grid-row: 2;
          }

          .pv-node { grid-column: 1; grid-row: 1; }
          .grid-node { grid-column: 2; grid-row: 1; }
          .battery-node { grid-column: 1; grid-row: 3; }
          .wallbox-node { grid-column: 2; grid-row: 3; }

          .background-grid {
            grid-template-columns: 1fr;
          }
        }
      </style>

      <div class="app">
        ${this._renderHeader()}
        ${this._renderTabs()}
        ${this._renderContent()}
        ${this._renderFooter()}
      </div>
    `;

    this._attachEvents();
    this._rendered = true;
  }

  _renderHeader() {
    const now = new Date();
    const date = now.toLocaleDateString("de-DE", {
      weekday: "long",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    const time = now.toLocaleTimeString("de-DE", {
      hour: "2-digit",
      minute: "2-digit",
    });

    return `
      <div class="header">
        <div></div>

        <div class="brand">
          <img
            class="brand-logo"
            src="/api/lakis_solarworld/static/customer_logo.jpeg"
            alt="LAKIS SOLARWORLD"
          />
          <div>
            <div class="brand-title">LAKIS SOLARWORLD</div>
            <div class="brand-subtitle">Energy Dashboard PRO</div>
          </div>
        </div>

        <div class="clock">
          ${this._escape(date)}<br>
          ${this._escape(time)} Uhr
        </div>
      </div>
    `;
  }

  _renderTabs() {
    const tabs = [
      ["overview", "Übersicht"],
      ["pv", "PV"],
      ["grid", "Netz"],
      ["battery", "Batterie"],
      ["settings", "⚙ Einstellungen"],
    ];

    return `
      <div class="tabs">
        ${tabs.map(([id, label]) => `
          <button
            class="tab ${this._tab === id ? "active" : ""}"
            data-tab="${id}"
          >${label}</button>
        `).join("")}
      </div>
    `;
  }

  _renderContent() {
    if (this._loading) {
      return `<div class="empty">Dashboard wird geladen …</div>`;
    }

    if (this._tab === "settings") {
      return this._renderSettings();
    }

    if (this._tab === "pv") return this._renderPV();
    if (this._tab === "grid") return this._renderGrid();
    if (this._tab === "battery") return this._renderBattery();

    return this._renderOverview();
  }

  _renderOverview() {
    const pv = this._number(this._entity("pv_power"));
    const house = this._number(this._entity("house_power"));
    const grid = this._number(this._entity("grid_power"));
    const battery = this._number(this._entity("battery_power"));
    const soc = this._number(this._entity("battery_soc"));
    const wallbox = this._number(this._entity("wallbox_power"));
    const heatpump = this._number(this._entity("heatpump_power"));
    const vehicle = this._number(this._entity("vehicle_charging_power"));

    return `
      <div class="dashboard-grid">
        <div>
          <div class="flow-card">
            <div class="section-title">⚡ Aktueller Energiefluss</div>

            <div class="flow">
              <div class="energy-node pv pv-node">
                <div class="energy-icon">☀️</div>
                <div class="energy-name">PV</div>
                <div class="energy-value">${this._formatPower(pv)}</div>
              </div>

              <div class="energy-node grid grid-node">
                <div class="energy-icon">⚡</div>
                <div class="energy-name">Netz</div>
                <div class="energy-value">${this._formatPower(grid)}</div>
              </div>

              <div class="energy-node house">
                <div class="energy-icon">🏠</div>
                <div class="energy-name">Haus</div>
                <div class="energy-value">${this._formatPower(house)}</div>
              </div>

              <div class="energy-node battery battery-node">
                <div class="energy-icon">🔋</div>
                <div class="energy-name">Batterie</div>
                <div class="energy-value">${this._formatPercent(soc)}</div>
                <div class="energy-name">${this._formatPower(battery)}</div>
              </div>

              <div class="energy-node wallbox-node">
                <div class="energy-icon">🚗</div>
                <div class="energy-name">Wallbox</div>
                <div class="energy-value">
                  ${this._enabled("wallbox") ? this._formatPower(wallbox) : "deaktiviert"}
                </div>
              </div>
            </div>
          </div>

          <div class="summary">
            <div class="card">
              <div class="card-label">PV-Leistung</div>
              <div class="card-value">${this._formatPower(pv)}</div>
            </div>
            <div class="card">
              <div class="card-label">Hausverbrauch</div>
              <div class="card-value">${this._formatPower(house)}</div>
            </div>
            <div class="card">
              <div class="card-label">Netz</div>
              <div class="card-value">${this._formatPower(grid)}</div>
            </div>
            <div class="card">
              <div class="card-label">Batterie SOC</div>
              <div class="card-value">${this._formatPercent(soc)}</div>
            </div>
          </div>
        </div>

        <div class="side-column">
          <div class="side-card">
            <div class="side-icon">🔋</div>
            <div>
              <div class="side-name">Batterie</div>
              <div class="side-value">${this._formatPower(battery)}</div>
              <div class="side-name">SOC ${this._formatPercent(soc)}</div>
            </div>
          </div>

          <div class="side-card">
            <div class="side-icon">⚡</div>
            <div>
              <div class="side-name">Netz</div>
              <div class="side-value">${this._formatPower(grid)}</div>
              <div class="side-name">Bezug / Einspeisung</div>
            </div>
          </div>

          ${this._enabled("wallbox") ? `
            <div class="side-card">
              <div class="side-icon">🚙</div>
              <div>
                <div class="side-name">Wallbox</div>
                <div class="side-value">${this._formatPower(wallbox)}</div>
                <div class="side-name">Ladeleistung</div>
              </div>
            </div>
          ` : ""}

          ${this._enabled("heatpump") ? `
            <div class="side-card">
              <div class="side-icon">♨️</div>
              <div>
                <div class="side-name">Wärmepumpe</div>
                <div class="side-value">${this._formatPower(heatpump)}</div>
                <div class="side-name">Leistung</div>
              </div>
            </div>
          ` : ""}

          ${this._enabled("vehicle") ? `
            <div class="side-card">
              <div class="side-icon">🚗</div>
              <div>
                <div class="side-name">${this._escape(this._config.vehicle_name || "Fahrzeug")}</div>
                <div class="side-value">${this._formatPower(vehicle)}</div>
                <div class="side-name">Ladeleistung</div>
              </div>
            </div>
          ` : ""}
        </div>
      </div>
    `;
  }

  _renderPV() {
    const pv = this._number(this._entity("pv_power"));
    return `
      <div class="settings-card">
        <h3>☀️ Photovoltaik</h3>
        <p>Aktuelle PV-Leistung</p>
        <div class="card-value">${this._formatPower(pv)}</div>
        <br>
        ${this._entitySelect("pv_power", "PV-Leistungsentität", ["sensor"], "Aktuelle PV-Leistung in Watt.")}
      </div>
    `;
  }

  _renderGrid() {
    const grid = this._number(this._entity("grid_power"));
    return `
      <div class="settings-card">
        <h3>⚡ Netz</h3>
        <p>Netzbezug bzw. Einspeisung</p>
        <div class="card-value">${this._formatPower(grid)}</div>
        <br>
        ${this._entitySelect("grid_power", "Netzleistungsentität", ["sensor"], "Positiv = Bezug, negativ = Einspeisung.")}
      </div>
    `;
  }

  _renderBattery() {
    const soc = this._number(this._entity("battery_soc"));
    const power = this._number(this._entity("battery_power"));

    return `
      <div class="settings-grid">
        <div class="settings-card">
          <h3>🔋 Ladezustand</h3>
          <p>Aktueller Batteriezustand</p>
          <div class="card-value">${this._formatPercent(soc)}</div>
        </div>

        <div class="settings-card">
          <h3>🔋 Batterieleistung</h3>
          <p>Aktuelle Lade-/Entladeleistung</p>
          <div class="card-value">${this._formatPower(power)}</div>
        </div>

        <div class="settings-card full">
          ${this._entitySelect("battery_soc", "Batterie SOC", ["sensor"], "Ladezustand in Prozent.")}
          ${this._entitySelect("battery_power", "Batterieleistung", ["sensor"], "Positiv = Laden, negativ = Entladen.")}
        </div>
      </div>
    `;
  }

  _renderSettings() {
    return `
      <div class="settings-grid">
        <div class="settings-card">
          <h3>⚙ Module</h3>
          <p>Aktivierte Module werden im Dashboard angezeigt.</p>

          ${this._checkbox("energy", "Energie / Haus", "Grundlage des Energie-Dashboards")}
          ${this._checkbox("pv", "Photovoltaik", "PV-Leistung und PV-Daten")}
          ${this._checkbox("grid", "Netz", "Netzbezug und Einspeisung")}
          ${this._checkbox("battery", "Batterie", "Speicher, SOC und Leistung")}
          ${this._checkbox("wallbox", "Wallbox", "Ladeleistung und Wallbox-Status")}
          ${this._checkbox("vehicle", "Fahrzeug", "Fahrzeugdaten und Ladezustand")}
          ${this._checkbox("heatpump", "Wärmepumpe", "Wärmepumpen-Daten")}
          ${this._checkbox("climate", "Klimaanlagen", "Eine oder mehrere Climate-Entitäten")}
        </div>

        <div class="settings-card">
          <h3>🏠 Energie / Haus</h3>
          <p>Grundlegende Leistungsdaten.</p>
          ${this._entitySelect("house_power", "Hausverbrauch", ["sensor"], "Aktueller Hausverbrauch in Watt.")}
          ${this._entitySelect("pv_power", "PV-Leistung", ["sensor"], "Aktuelle PV-Leistung.")}
          ${this._entitySelect("grid_power", "Netzbezug / Einspeisung", ["sensor"], "Positiv = Bezug, negativ = Einspeisung.")}
          ${this._entitySelect("battery_soc", "Batterie SOC", ["sensor"], "Ladezustand in Prozent.")}
          ${this._entitySelect("battery_power", "Batterieleistung", ["sensor"], "Positiv = Laden, negativ = Entladen.")}
        </div>

        ${this._enabled("wallbox") || this._enabled("vehicle") ? `
          <div class="settings-card">
            <h3>🚙 Wallbox / Fahrzeug</h3>
            <p>Lade- und Fahrzeugdaten.</p>

            ${this._enabled("wallbox") ? `
              ${this._entitySelect("wallbox_power", "Wallbox Ladeleistung", ["sensor"], "Aktuelle Ladeleistung.")}
              ${this._entitySelect("wallbox_status", "Wallbox Status", ["sensor","binary_sensor"], "Optional.")}
              ${this._entitySelect("wallbox_control", "Wallbox Steuerung", ["switch","button"], "Optional.")}
            ` : ""}

            ${this._enabled("vehicle") ? `
              ${this._textInput("vehicle_name", "Fahrzeugname", this._config.vehicle_name || "")}
              ${this._entitySelect("vehicle_soc", "Fahrzeug SOC", ["sensor"], "Fahrzeug-Ladezustand.")}
              ${this._entitySelect("vehicle_status", "Fahrzeug Status", ["sensor","binary_sensor"], "Optional.")}
              ${this._entitySelect("vehicle_charging_power", "Fahrzeug Ladeleistung", ["sensor"], "Optional.")}
              ${this._vehicleImageSection()}
            ` : ""}
          </div>
        ` : ""}

        ${this._enabled("heatpump") || this._enabled("climate") ? `
          <div class="settings-card">
            <h3>♨️ Wärmepumpe / Klima</h3>
            <p>Klima- und Wärmepumpen-Entitäten.</p>

            ${this._enabled("heatpump") ? `
              ${this._entitySelect("heatpump_entity", "Wärmepumpe", ["climate"], "Climate-Entität der Wärmepumpe.")}
              ${this._entitySelect("heatpump_power", "Elektrische Leistung", ["sensor"], "Optional.")}
              ${this._entitySelect("heatpump_flow_temp", "Vorlauftemperatur", ["sensor"], "Optional.")}
              ${this._entitySelect("heatpump_return_temp", "Rücklauftemperatur", ["sensor"], "Optional.")}
              ${this._entitySelect("heatpump_outdoor_temp", "Außentemperatur", ["sensor"], "Optional.")}
              ${this._entitySelect("heatpump_dhw_temp", "Warmwassertemperatur", ["sensor"], "Optional.")}
            ` : ""}

            ${this._enabled("climate") ? `
              ${this._entitySelect("climate_1", "Klimaanlage 1", ["climate"])}
              ${this._entitySelect("climate_2", "Klimaanlage 2", ["climate"])}
              ${this._entitySelect("climate_3", "Klimaanlage 3", ["climate"])}
              ${this._entitySelect("climate_4", "Klimaanlage 4", ["climate"])}
            ` : ""}
          </div>
        ` : ""}

        <div class="settings-card full">
          <h3>🌤 Wetter</h3>
          <p>Optionale Wetterquelle.</p>
          ${this._entitySelect("weather_entity", "Wetter", ["weather"], "Wetterquelle aus Home Assistant.")}
        </div>

        <div class="settings-card full">
          <h3>🖼️ Dashboard-Hintergründe</h3>
          <p>Jeder Menüpunkt kann ein eigenes Hintergrundbild erhalten.</p>
          <div class="background-grid">
            ${this._backgroundItem("overview", "Übersicht")}
            ${this._backgroundItem("pv", "PV")}
            ${this._backgroundItem("grid", "Netz")}
            ${this._backgroundItem("battery", "Batterie")}
            ${this._backgroundItem("settings", "Einstellungen")}
          </div>
        </div>

        <div class="settings-card full">
          ${this._message ? `<div class="message">${this._escape(this._message)}</div>` : ""}
          <div style="display:flex;justify-content:flex-end;">
            <button class="save-button" id="save-config">💾 Änderungen speichern</button>
          </div>
        </div>
      </div>
    `;
  }

  _textInput(key, label, value) {
    return `
      <div class="entity-setting">
        <label>${this._escape(label)}</label>
        <input
          type="text"
          data-text-key="${this._escape(key)}"
          value="${this._escape(value)}"
        />
      </div>
    `;
  }

  _vehicleImageSection() {
    const image = this._config.vehicle_image || "";
    return `
      <div class="entity-setting">
        <label>Fahrzeugbild</label>
        ${image ? `<img src="${this._escape(image)}" style="width:100%;max-height:180px;object-fit:cover;border-radius:12px;margin-bottom:10px;" alt="Fahrzeug">` : ""}
        <label class="button">
          Fahrzeugbild auswählen
          <input class="upload-input" id="vehicle-image" type="file" accept="image/*">
        </label>
      </div>
    `;
  }

  _backgroundItem(screen, label) {
    const url = this._config.backgrounds?.[screen] || "";

    return `
      <div class="background-item">
        <strong>${this._escape(label)}</strong>

        <div
          class="background-preview"
          style="${url ? `background-image:url('${this._escape(url)}')` : ""}"
        ></div>

        <div class="upload-row">
          <label class="button">
            Bild auswählen
            <input
              class="upload-input"
              data-background-input="${this._escape(screen)}"
              type="file"
              accept="image/jpeg,image/png,image/webp"
            >
          </label>

          <button
            class="button"
            data-reset-background="${this._escape(screen)}"
            type="button"
          >Zurücksetzen</button>
        </div>
      </div>
    `;
  }

  _attachEvents() {
    this.querySelectorAll("[data-tab]").forEach((button) => {
      button.addEventListener("click", async () => {
        if (this._tab === "settings" && this._dirty) {
          await this._save(true);
        }
        this._tab = button.dataset.tab;
        this._message = "";
        this._render();
      });
    });

    this.querySelectorAll("[data-module]").forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        this._config.modules ||= {};
        this._config.modules[checkbox.dataset.module] = checkbox.checked;
        this._dirty = true;
        this._scheduleSave();

        // Module can change which settings are visible, so a deliberate
        // rerender here is safe; entity <select> controls are not involved.
        this._render();
      });
    });

    this.querySelectorAll("[data-entity-key]").forEach((select) => {
      select.addEventListener("change", (event) => {
        this._config[event.currentTarget.dataset.entityKey] =
          event.currentTarget.value;
        this._dirty = true;
        this._scheduleSave();
      });
    });

    this.querySelectorAll("[data-text-key]").forEach((input) => {
      input.addEventListener("input", (event) => {
        this._config[event.currentTarget.dataset.textKey] =
          event.currentTarget.value;
        this._dirty = true;
        this._scheduleSave();
      });
    });

    const save = this.querySelector("#save-config");
    if (save) {
      save.addEventListener("click", () => this._save(false));
    }

    const vehicleImage = this.querySelector("#vehicle-image");
    if (vehicleImage) {
      vehicleImage.addEventListener("change", (event) => {
        this._uploadVehicleImage(event.target.files?.[0]);
      });
    }

    this.querySelectorAll("[data-background-input]").forEach((input) => {
      input.addEventListener("change", (event) => {
        this._uploadBackground(
          event.currentTarget.dataset.backgroundInput,
          event.target.files?.[0]
        );
      });
    });

    this.querySelectorAll("[data-reset-background]").forEach((button) => {
      button.addEventListener("click", () => {
        this._resetBackground(button.dataset.resetBackground);
      });
    });
  }

  _scheduleSave() {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      this._save(true);
    }, 350);
  }

  async _save(silent = false) {
    if (!this._hass || !this._entry) return;

    try {
      if (this._saveInFlight) return;
      this._saveInFlight = true;
      if (!silent) {
        this._message = "Speichere …";
        this._render();
      }

      const result = await this._hass.callWS({
        type: "lakis_solarworld/save_config",
        entry_id: this._entry,
        config: this._config,
      });

      this._config = result?.config || this._config;
      this._dirty = false;
      if (!silent) {
        this._message = "✓ Änderungen gespeichert.";
        // Stay on settings. Do not trigger an unnecessary reload.
        this._render();
      }
    } catch (err) {
      console.error("LAKIS SOLARWORLD save:", err);
      this._message =
        "Fehler beim Speichern: " +
        (err?.message || "Unbekannter Fehler");
      this._render();
    } finally {
      this._saveInFlight = false;
    }
  }

  async _uploadVehicleImage(file) {
    if (!file || !this._hass || !this._entry) return;

    const reader = new FileReader();

    reader.onload = async () => {
      try {
        const result = await this._hass.callWS({
          type: "lakis_solarworld/upload_vehicle_image",
          entry_id: this._entry,
          filename: file.name,
          data: reader.result,
        });

        if (result?.url) {
          this._config.vehicle_image = result.url;
        }

        this._message = "✓ Fahrzeugbild gespeichert.";
        this._render();
      } catch (err) {
        console.error("LAKIS vehicle image:", err);
        this._message = "Fahrzeugbild konnte nicht gespeichert werden.";
        this._render();
      }
    };

    reader.readAsDataURL(file);
  }

  async _uploadBackground(screen, file) {
    if (!file || !this._hass || !this._entry) return;

    const reader = new FileReader();

    reader.onload = async () => {
      try {
        this._message = `Hintergrund für ${screen} wird gespeichert …`;
        this._render();

        const result = await this._hass.callWS({
          type: "lakis_solarworld/upload_background_image",
          entry_id: this._entry,
          screen,
          data: reader.result,
        });

        this._config.backgrounds ||= {};
        this._config.backgrounds[screen] = result?.url || "";

        this._message = `✓ Hintergrund für ${screen} gespeichert.`;
        this._render();
      } catch (err) {
        console.error("LAKIS background:", err);
        this._message = "Hintergrundbild konnte nicht gespeichert werden.";
        this._render();
      }
    };

    reader.readAsDataURL(file);
  }

  async _resetBackground(screen) {
    if (!this._hass || !this._entry) return;

    try {
      const result = await this._hass.callWS({
        type: "lakis_solarworld/reset_background",
        entry_id: this._entry,
        screen,
      });

      this._config = result?.config || this._config;
      this._message = `✓ Hintergrund für ${screen} zurückgesetzt.`;
      this._render();
    } catch (err) {
      console.error("LAKIS reset background:", err);
      this._message = "Hintergrund konnte nicht zurückgesetzt werden.";
      this._render();
    }
  }

  _renderFooter() {
    return `
      <div class="footer">
        LAKIS SOLARWORLD — Nachhaltige Energie. Für heute. Für morgen.
        · Version 1.1.4
      </div>
    `;
  }
}

if (!customElements.get("lakis-solarworld-panel")) {
  customElements.define(
    "lakis-solarworld-panel",
    LakisSolarworldDashboard
  );
}
