/* LAKIS SOLARWORLD Dashboard
 * Dashboard UI
 * Version 1.1.0
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
    this._vehicleImage = null;
  }

  set hass(value) {
    this._hass = value;
    if (this._loading && value) {
      this._load();
    }
    this._render();
  }

  set panel(value) {
    const entryId = value?.config?.entry_id || value?.entry_id;
    if (entryId) {
      this._entry = entryId;
      this._load();
    }
  }

  setConfig(config) {
    if (config?.entry_id) {
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
      return "--";
    }

    return `${Math.round(value).toLocaleString("de-DE")} W`;
  }

  _formatPercent(value) {
    if (value === null || value === undefined || !Number.isFinite(value)) {
      return "--";
    }

    return `${Math.round(value)} %`;
  }

  _formatTemp(value) {
    if (value === null || value === undefined || !Number.isFinite(value)) {
      return "--";
    }

    return `${value.toFixed(1).replace(".", ",")} °C`;
  }

  _entityName(entityId) {
    if (!entityId) return "Keine Entität ausgewählt";

    const state = this._state(entityId);
    if (!state) return entityId;

    return (
      state.attributes?.friendly_name ||
      entityId
    );
  }

  _domain(entityId) {
    if (!entityId || !entityId.includes(".")) return "";
    return entityId.split(".")[0];
  }

  _entityOptions(domains = []) {
    if (!this._hass?.states) return [];

    const result = Object.entries(this._hass.states)
      .filter(([id]) => {
        if (!domains.length) return true;
        return domains.includes(this._domain(id));
      })
      .map(([id, state]) => ({
        id,
        name: state.attributes?.friendly_name || id,
      }))
      .sort((a, b) =>
        a.name.localeCompare(b.name, "de")
      );

    return result;
  }

  _entitySelect(key, label, domains = [], description = "") {
    const current = this._entity(key);
    const entities = this._entityOptions(domains);

    return `
      <div class="entity-setting">
        <label>${label}</label>

        ${
          description
            ? `<div class="setting-description">${description}</div>`
            : ""
        }

        <select data-entity-key="${key}">
          <option value="">-- Keine Entität --</option>

          ${entities
            .map(
              (entity) => `
                <option
                  value="${this._escape(entity.id)}"
                  ${entity.id === current ? "selected" : ""}
                >
                  ${this._escape(entity.name)} -- ${this._escape(entity.id)}
                </option>
              `
            )
            .join("")}
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
            data-module="${module}"
            ${enabled ? "checked" : ""}
          />

          <span class="switch-box"></span>

          <span class="switch-text">
            <strong>${label}</strong>
            ${
              description
                ? `<small>${description}</small>`
                : ""
            }
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

  _render() {
    if (!this._hass) return;

    this.innerHTML = `
      <style>
        :host {
          display: block;
          min-height: 100vh;
          background:
            radial-gradient(circle at 50% 0%, #142a48 0%, #07111f 48%, #040a12 100%);
          color: #ffffff;
          font-family:
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            Roboto,
            Arial,
            sans-serif;
        }

        * {
          box-sizing: border-box;
        }

        .app {
          min-height: 100vh;
          padding: 22px;
        }

        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          margin-bottom: 20px;
        }

        .brand {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .brand-logo {
          width: 170px;
          max-height: 65px;
          object-fit: contain;
          object-position: left center;
          filter: drop-shadow(0 0 12px rgba(0, 180, 255, .25));
        }

        .brand-title {
          font-size: 20px;
          font-weight: 700;
          letter-spacing: .4px;
        }

        .brand-subtitle {
          margin-top: 4px;
          color: #8ca5bd;
          font-size: 13px;
        }

        .clock {
          color: #9eb2c7;
          font-size: 13px;
          text-align: right;
        }

        .tabs {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-bottom: 22px;
        }

        .tab {
          border: 1px solid rgba(120,160,200,.18);
          background: rgba(14,29,48,.82);
          color: #91a7bc;
          padding: 10px 15px;
          border-radius: 12px;
          cursor: pointer;
          transition: .2s;
        }

        .tab:hover {
          border-color: rgba(0,190,255,.4);
          color: white;
        }

        .tab.active {
          color: white;
          border-color: rgba(0,190,255,.55);
          background: rgba(0,150,220,.16);
          box-shadow: 0 0 18px rgba(0,160,255,.12);
        }

        .flow-card,
        .card,
        .settings-card {
          background:
            linear-gradient(
              145deg,
              rgba(17,35,57,.96),
              rgba(7,17,30,.96)
            );
          border: 1px solid rgba(120,160,200,.16);
          border-radius: 20px;
          box-shadow:
            0 16px 50px rgba(0,0,0,.22),
            inset 0 1px 0 rgba(255,255,255,.025);
        }

        .flow-card {
          padding: 24px;
          min-height: 420px;
        }

        .section-title {
          font-size: 18px;
          font-weight: 700;
          margin-bottom: 18px;
        }

        .flow {
          min-height: 320px;
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          grid-template-rows: 1fr 1fr;
          gap: 20px;
          align-items: center;
        }

        .energy-node {
          min-width: 130px;
          min-height: 105px;
          padding: 16px;
          border-radius: 18px;
          background: rgba(9,22,37,.9);
          border: 1px solid rgba(130,160,190,.15);
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          text-align: center;
        }

        .energy-icon {
          font-size: 28px;
          margin-bottom: 7px;
        }

        .energy-name {
          color: #91a7bc;
          font-size: 12px;
          margin-bottom: 4px;
        }

        .energy-value {
          font-size: 18px;
          font-weight: 700;
        }

        .pv {
          border-color: rgba(40,220,130,.35);
          box-shadow: 0 0 25px rgba(40,220,130,.07);
        }

        .grid {
          border-color: rgba(255,70,80,.35);
        }

        .battery {
          border-color: rgba(70,150,255,.35);
        }

        .house {
          border-color: rgba(255,255,255,.18);
          grid-column: 2;
          grid-row: 1 / span 2;
        }

        .pv-node {
          grid-column: 1;
          grid-row: 1;
        }

        .grid-node {
          grid-column: 3;
          grid-row: 1;
        }

        .battery-node {
          grid-column: 1;
          grid-row: 2;
        }

        .wallbox-node {
          grid-column: 3;
          grid-row: 2;
        }

        .connection {
          position: relative;
        }

        .connection::after {
          content: "";
          display: block;
          height: 3px;
          margin: 8px 0;
          border-radius: 5px;
          background: rgba(130,160,190,.14);
        }

        .connection.active-green::after {
          background: linear-gradient(
            90deg,
            transparent,
            #39e58a,
            transparent
          );
          box-shadow: 0 0 10px rgba(57,229,138,.7);
        }

        .connection.active-red::after {
          background: linear-gradient(
            90deg,
            transparent,
            #ff5964,
            transparent
          );
          box-shadow: 0 0 10px rgba(255,89,100,.6);
        }

        .connection.active-blue::after {
          background: linear-gradient(
            90deg,
            transparent,
            #4e9dff,
            transparent
          );
          box-shadow: 0 0 10px rgba(78,157,255,.6);
        }

        .summary {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 14px;
          margin-top: 18px;
        }

        .summary .card {
          padding: 18px;
        }

        .card-label {
          color: #849bb1;
          font-size: 12px;
          margin-bottom: 7px;
        }

        .card-value {
          font-size: 22px;
          font-weight: 700;
        }

        .settings-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 18px;
        }

        .settings-card {
          padding: 22px;
        }

        .settings-card.full {
          grid-column: 1 / -1;
        }

        .settings-card h3 {
          margin: 0 0 6px;
          font-size: 17px;
        }

        .settings-card > p {
          margin: 0 0 18px;
          color: #8299af;
          font-size: 13px;
        }

        .module-switch {
          border-bottom: 1px solid rgba(120,160,200,.1);
        }

        .module-switch:last-child {
          border-bottom: none;
        }

        .switch-row {
          display: flex;
          align-items: center;
          gap: 13px;
          padding: 13px 0;
          cursor: pointer;
        }

        .switch-row input {
          display: none;
        }

        .switch-box {
          width: 43px;
          height: 24px;
          border-radius: 20px;
          background: #26384a;
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
          background: #8fa1b2;
          transition: .2s;
        }

        .switch-row input:checked + .switch-box {
          background: #08a9ec;
          box-shadow: 0 0 14px rgba(8,169,236,.35);
        }

        .switch-row input:checked + .switch-box::after {
          left: 22px;
          background: white;
        }

        .switch-text {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .switch-text small {
          color: #71899f;
          font-size: 11px;
        }

        .entity-setting {
          margin-bottom: 16px;
        }

        .entity-setting:last-child {
          margin-bottom: 0;
        }

        .entity-setting label {
          display: block;
          margin-bottom: 7px;
          font-size: 13px;
          font-weight: 600;
          color: #c4d2df;
        }

        .setting-description {
          color: #71889d;
          font-size: 11px;
          margin-bottom: 7px;
        }

        select,
        input[type="text"],
        input[type="number"] {
          width: 100%;
          border-radius: 11px;
          border: 1px solid rgba(120,160,200,.2);
          background: #0a1829;
          color: white;
          padding: 11px 12px;
          outline: none;
        }

        select:focus,
        input:focus {
          border-color: rgba(0,180,255,.55);
          box-shadow: 0 0 0 2px rgba(0,180,255,.08);
        }

        .save-row {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 14px;
          margin-top: 20px;
        }

        .save-button {
          border: none;
          border-radius: 12px;
          padding: 12px 22px;
          color: white;
          background: linear-gradient(135deg, #008bd0, #00b7ee);
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 8px 22px rgba(0,160,230,.2);
        }

        .save-button:hover {
          filter: brightness(1.1);
        }

        .message {
          color: #70e4a6;
          font-size: 13px;
        }

        .disabled-note {
          padding: 15px;
          border-radius: 12px;
          background: rgba(255,255,255,.025);
          color: #70869b;
          font-size: 13px;
        }

        .vehicle-image {
          width: 100%;
          max-height: 220px;
          object-fit: cover;
          border-radius: 15px;
          margin-bottom: 15px;
        }

        .upload-label {
          display: inline-block;
          padding: 10px 14px;
          border-radius: 10px;
          background: rgba(0,150,220,.15);
          border: 1px solid rgba(0,180,240,.25);
          cursor: pointer;
          font-size: 13px;
        }

        .upload-label input {
          display: none;
        }

        .empty {
          padding: 40px 20px;
          text-align: center;
          color: #7890a6;
        }

        @media (max-width: 900px) {
          .summary {
            grid-template-columns: repeat(2, 1fr);
          }

          .settings-grid {
            grid-template-columns: 1fr;
          }

          .settings-card.full {
            grid-column: auto;
          }
        }

        @media (max-width: 650px) {
          .app {
            padding: 14px;
          }

          .header {
            align-items: flex-start;
          }

          .brand-logo {
            width: 130px;
          }

          .flow {
            grid-template-columns: 1fr 1fr;
            grid-template-rows: repeat(3, auto);
          }

          .house {
            grid-column: 1 / span 2;
            grid-row: 2;
          }

          .pv-node {
            grid-column: 1;
            grid-row: 1;
          }

          .grid-node {
            grid-column: 2;
            grid-row: 1;
          }

          .battery-node {
            grid-column: 1;
            grid-row: 3;
          }

          .wallbox-node {
            grid-column: 2;
            grid-row: 3;
          }
        }
      </style>

      <div class="app">
        ${this._renderHeader()}
        ${this._renderTabs()}
        ${this._renderContent()}
      </div>
    `;

    this._attachEvents();
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
        <div class="brand">
          <img
            class="brand-logo"
            src="/api/lakis_solarworld/static/customer_logo.jpeg"
            alt="LAKIS SOLARWORLD"
            onerror="this.style.display='none';"
          />

          <div>
            <div class="brand-title">
              LAKIS SOLARWORLD
            </div>

            <div class="brand-subtitle">
              Energy Dashboard PRO
            </div>
          </div>
        </div>

        <div class="clock">
          ${date}<br>
          ${time} Uhr
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
        ${tabs
          .map(
            ([id, label]) => `
              <button
                class="tab ${this._tab === id ? "active" : ""}"
                data-tab="${id}"
              >
                ${label}
              </button>
            `
          )
          .join("")}
      </div>
    `;
  }

  _renderContent() {
    if (this._loading) {
      return `<div class="empty">Dashboard wird geladen …</div>`;
    }

    switch (this._tab) {
      case "pv":
        return this._renderPV();

      case "grid":
        return this._renderGrid();

      case "battery":
        return this._renderBattery();

      case "settings":
        return this._renderSettings();

      default:
        return this._renderOverview();
    }
  }

  _renderOverview() {
    const pv = this._number(this._entity("pv_power"));
    const house = this._number(this._entity("house_power"));
    const grid = this._number(this._entity("grid_power"));
    const battery = this._number(this._entity("battery_power"));
    const soc = this._number(this._entity("battery_soc"));
    const wallbox = this._number(this._entity("wallbox_power"));

    return `
      <div class="flow-card">
        <div class="section-title">
          Energiefluss
        </div>

        <div class="flow">

          <div class="energy-node pv pv-node">
            <div class="energy-icon">☀️</div>
            <div class="energy-name">PV</div>
            <div class="energy-value">
              ${this._formatPower(pv)}
            </div>
          </div>

          <div class="energy-node grid grid-node">
            <div class="energy-icon">⚡</div>
            <div class="energy-name">Netz</div>
            <div class="energy-value">
              ${this._formatPower(grid)}
            </div>
          </div>

          <div class="energy-node house">
            <div class="energy-icon">🏠</div>
            <div class="energy-name">Haus</div>
            <div class="energy-value">
              ${this._formatPower(house)}
            </div>
          </div>

          <div class="energy-node battery battery-node">
            <div class="energy-icon">🔋</div>
            <div class="energy-name">Batterie</div>
            <div class="energy-value">
              ${this._formatPercent(soc)}
            </div>

            <div style="margin-top:5px;color:#7690a7;font-size:11px;">
              ${this._formatPower(battery)}
            </div>
          </div>

          ${
            this._enabled("wallbox")
              ? `
                <div class="energy-node wallbox-node">
                  <div class="energy-icon">🚗</div>
                  <div class="energy-name">Wallbox</div>
                  <div class="energy-value">
                    ${this._formatPower(wallbox)}
                  </div>
                </div>
              `
              : `
                <div class="energy-node wallbox-node">
                  <div class="energy-icon">--</div>
                  <div class="energy-name">Wallbox</div>
                  <div class="energy-value">deaktiviert</div>
                </div>
              `
          }

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
          <div class="card-label">Batterie</div>
          <div class="card-value">${this._formatPercent(soc)}</div>
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

        <div class="card-value">
          ${this._formatPower(pv)}
        </div>

        <br>

        ${this._entitySelect(
          "pv_power",
          "PV-Leistungsentität",
          ["sensor"],
          "Entität mit der aktuellen PV-Leistung in Watt."
        )}
      </div>
    `;
  }

  _renderGrid() {
    const grid = this._number(this._entity("grid_power"));

    return `
      <div class="settings-card">
        <h3>⚡ Netz</h3>
        <p>Netzbezug bzw. Einspeisung</p>

        <div class="card-value">
          ${this._formatPower(grid)}
        </div>

        <br>

        ${this._entitySelect(
          "grid_power",
          "Netzleistungsentität",
          ["sensor"],
          "Positiv = Netzbezug, negativ = Einspeisung."
        )}
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

          <div class="card-value">
            ${this._formatPercent(soc)}
          </div>
        </div>

        <div class="settings-card">
          <h3>🔋 Batterieleistung</h3>
          <p>Aktuelle Lade-/Entladeleistung</p>

          <div class="card-value">
            ${this._formatPower(power)}
          </div>
        </div>

        <div class="settings-card full">
          ${this._entitySelect(
            "battery_soc",
            "Batterie SOC",
            ["sensor"],
            "Batterie-Ladezustand in Prozent."
          )}

          ${this._entitySelect(
            "battery_power",
            "Batterieleistung",
            ["sensor"],
            "Positiv = Laden, negativ = Entladen."
          )}
        </div>

      </div>
    `;
  }

  _renderSettings() {
    return `
      <div class="settings-grid">

        <div class="settings-card">
          <h3>⚙ Module</h3>
          <p>
            Hier kannst du die einzelnen Bereiche jederzeit aktivieren
            oder deaktivieren.
          </p>

          ${this._checkbox(
            "energy",
            "Energie / Haus",
            "Grundlage des Energie-Dashboards"
          )}

          ${this._checkbox(
            "pv",
            "Photovoltaik",
            "PV-Leistung und PV-Daten"
          )}

          ${this._checkbox(
            "grid",
            "Netz",
            "Netzbezug und Einspeisung"
          )}

          ${this._checkbox(
            "battery",
            "Batterie",
            "Speicher, SOC und Leistung"
          )}

          ${this._checkbox(
            "wallbox",
            "Wallbox",
            "Ladeleistung und Wallbox-Status"
          )}

          ${this._checkbox(
            "vehicle",
            "Fahrzeug",
            "Fahrzeugdaten und Ladezustand"
          )}

          ${this._checkbox(
            "heatpump",
            "Wärmepumpe",
            "Wärmepumpen-Daten"
          )}

          ${this._checkbox(
            "climate",
            "Klimaanlagen",
            "Eine oder mehrere Climate-Entitäten"
          )}
        </div>

        ${
          this._enabled("energy")
            ? `
              <div class="settings-card">
                <h3>🏠 Energie / Haus</h3>
                <p>Grundlegende Leistungsdaten.</p>

                ${this._entitySelect(
                  "house_power",
                  "Hausverbrauch",
                  ["sensor"],
                  "Aktueller Hausverbrauch in Watt."
                )}
              </div>
            `
            : ""
        }

        ${
          this._enabled("pv")
            ? `
              <div class="settings-card">
                <h3>☀️ Photovoltaik</h3>
                <p>PV-Leistungsdaten.</p>

                ${this._entitySelect(
                  "pv_power",
                  "PV-Leistung",
                  ["sensor"],
                  "Aktuelle PV-Leistung."
                )}
              </div>
            `
            : ""
        }

        ${
          this._enabled("grid")
            ? `
              <div class="settings-card">
                <h3>⚡ Netz</h3>
                <p>Netzfluss am Netzanschlusspunkt.</p>

                ${this._entitySelect(
                  "grid_power",
                  "Netzleistung",
                  ["sensor"],
                  "Positiv = Bezug, negativ = Einspeisung."
                )}
              </div>
            `
            : ""
        }

        ${
          this._enabled("battery")
            ? `
              <div class="settings-card">
                <h3>🔋 Batterie</h3>
                <p>Batterie-Entitäten.</p>

                ${this._entitySelect(
                  "battery_soc",
                  "Batterie SOC",
                  ["sensor"],
                  "Ladezustand in Prozent."
                )}

                ${this._entitySelect(
                  "battery_power",
                  "Batterieleistung",
                  ["sensor"],
                  "Positiv = Laden, negativ = Entladen."
                )}

                ${this._entitySelect(
                  "battery_target_soc",
                  "Ziel-SOC",
                  ["sensor", "number"],
                  "Optionaler Ziel-Ladezustand."
                )}
              </div>
            `
            : ""
        }

        ${
          this._enabled("wallbox")
            ? `
              <div class="settings-card">
                <h3>🚙 Wallbox</h3>
                <p>Wallbox frei aus Home Assistant auswählen.</p>

                ${this._entitySelect(
                  "wallbox_power",
                  "Ladeleistung",
                  ["sensor"],
                  "Aktuelle Ladeleistung."
                )}

                ${this._entitySelect(
                  "wallbox_status",
                  "Wallbox Status",
                  ["sensor", "binary_sensor"],
                  "Optionaler Status der Wallbox."
                )}

                ${this._entitySelect(
                  "wallbox_control",
                  "Wallbox Steuerung",
                  ["switch", "button"],
                  "Optional: Start/Stop bzw. Freigabe."
                )}
              </div>
            `
            : ""
        }

        ${
          this._enabled("vehicle")
            ? `
              <div class="settings-card">
                <h3>🚗 Fahrzeug</h3>
                <p>Fahrzeug mit der Wallbox verknüpfen.</p>

                ${this._textInput(
                  "vehicle_name",
                  "Fahrzeugname",
                  this._config.vehicle_name || ""
                )}

                ${this._entitySelect(
                  "vehicle_soc",
                  "Fahrzeug SOC",
                  ["sensor"],
                  "Fahrzeug-Ladezustand."
                )}

                ${this._entitySelect(
                  "vehicle_target_soc",
                  "Fahrzeug Ziel-SOC",
                  ["sensor", "number"],
                  "Optionaler Ziel-SOC."
                )}

                ${this._entitySelect(
                  "vehicle_status",
                  "Fahrzeug Status",
                  ["sensor", "binary_sensor"],
                  "Optionaler Fahrzeugstatus."
                )}

                ${this._vehicleImageSection()}
              </div>
            `
            : ""
        }

        ${
          this._enabled("heatpump")
            ? `
              <div class="settings-card">
                <h3>♨️ Wärmepumpe</h3>
                <p>Wärmepumpe frei aus Home Assistant auswählen.</p>

                ${this._entitySelect(
                  "heatpump_entity",
                  "Wärmepumpe",
                  ["climate"],
                  "Climate-Entität der Wärmepumpe."
                )}

                ${this._entitySelect(
                  "heatpump_power",
                  "Elektrische Leistung",
                  ["sensor"],
                  "Optional."
                )}

                ${this._entitySelect(
                  "heatpump_flow_temp",
                  "Vorlauftemperatur",
                  ["sensor"],
                  "Optional."
                )}

                ${this._entitySelect(
                  "heatpump_return_temp",
                  "Rücklauftemperatur",
                  ["sensor"],
                  "Optional."
                )}

                ${this._entitySelect(
                  "heatpump_outdoor_temp",
                  "Außentemperatur",
                  ["sensor"],
                  "Optional."
                )}

                ${this._entitySelect(
                  "heatpump_dhw_temp",
                  "Warmwassertemperatur",
                  ["sensor"],
                  "Optional."
                )}
              </div>
            `
            : ""
        }

        ${
          this._enabled("climate")
            ? `
              <div class="settings-card">
                <h3>❄️ Klimaanlagen</h3>
                <p>
                  Climate-Entitäten können frei ausgewählt werden.
                </p>

                ${this._entitySelect(
                  "climate_1",
                  "Klimaanlage 1",
                  ["climate"]
                )}

                ${this._entitySelect(
                  "climate_2",
                  "Klimaanlage 2",
                  ["climate"]
                )}

                ${this._entitySelect(
                  "climate_3",
                  "Klimaanlage 3",
                  ["climate"]
                )}

                ${this._entitySelect(
                  "climate_4",
                  "Klimaanlage 4",
                  ["climate"]
                )}
              </div>
            `
            : ""
        }

        <div class="settings-card">
          <h3>🌤 Wetter</h3>
          <p>Optionale Wetterentität.</p>

          ${this._entitySelect(
            "weather_entity",
            "Wetter",
            ["weather"],
            "Wetterquelle aus Home Assistant."
          )}
        </div>

        <div class="settings-card full">
          <h3>💾 Konfiguration speichern</h3>
          <p>
            Die Änderungen werden in der LAKIS-Konfiguration gespeichert.
          </p>

          ${
            this._message
              ? `<div class="message">${this._escape(this._message)}</div>`
              : ""
          }

          <div class="save-row">
            <button class="save-button" id="save-config">
              Änderungen speichern
            </button>
          </div>
        </div>

      </div>
    `;
  }

  _textInput(key, label, value) {
    return `
      <div class="entity-setting">
        <label>${label}</label>

        <input
          type="text"
          data-text-key="${key}"
          value="${this._escape(value)}"
        />
      </div>
    `;
  }

  _vehicleImageSection() {
    const image =
      this._config.vehicle_image ||
      this._config.vehicleImage ||
      "";

    return `
      <div class="entity-setting">

        <label>Fahrzeugbild</label>

        ${
          image
            ? `
              <img
                class="vehicle-image"
                src="${this._escape(image)}"
                alt="Fahrzeug"
              />
            `
            : ""
        }

        <label class="upload-label">
          Fahrzeugbild auswählen
          <input
            type="file"
            id="vehicle-image"
            accept="image/*"
          />
        </label>

      </div>
    `;
  }

  _attachEvents() {
    this.querySelectorAll("[data-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        this._tab = button.dataset.tab;
        this._message = "";
        this._render();
      });
    });

    this.querySelectorAll("[data-module]").forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        if (!this._config.modules) {
          this._config.modules = {};
        }

        this._config.modules[checkbox.dataset.module] =
          checkbox.checked;

        this._render();
      });
    });

    this.querySelectorAll("[data-entity-key]").forEach((select) => {
      select.addEventListener("change", () => {
        this._config[select.dataset.entityKey] =
          select.value;
      });
    });

    this.querySelectorAll("[data-text-key]").forEach((input) => {
      input.addEventListener("input", () => {
        this._config[input.dataset.textKey] =
          input.value;
      });
    });

    const save = this.querySelector("#save-config");

    if (save) {
      save.addEventListener("click", () => {
        this._save();
      });
    }

    const imageInput =
      this.querySelector("#vehicle-image");

    if (imageInput) {
      imageInput.addEventListener("change", (event) => {
        this._uploadVehicleImage(event.target.files?.[0]);
      });
    }
  }

  async _save() {
    if (!this._hass || !this._entry) return;

    try {
      this._message = "Speichere …";
      this._render();

      await this._hass.callWS({
        type: "lakis_solarworld/save_config",
        entry_id: this._entry,
        config: this._config,
      });

      this._message = "✓ Änderungen gespeichert.";

      await this._load();

      this._tab = "settings";
      this._message = "✓ Änderungen gespeichert.";
      this._render();

    } catch (err) {
      console.error("LAKIS SOLARWORLD save:", err);

      this._message =
        "Fehler beim Speichern: " +
        (err?.message || "Unbekannter Fehler");

      this._render();
    }
  }

  async _uploadVehicleImage(file) {
    if (!file || !this._hass || !this._entry) return;

    try {
      this._message = "Fahrzeugbild wird hochgeladen …";
      this._render();

      const reader = new FileReader();

      reader.onload = async () => {
        try {
          const result =
            await this._hass.callWS({
              type: "lakis_solarworld/upload_vehicle_image",
              entry_id: this._entry,
              filename: file.name,
              content: reader.result,
            });

          if (result?.url) {
            this._config.vehicle_image = result.url;
          }

          this._message =
            "✓ Fahrzeugbild gespeichert.";

          this._render();

        } catch (err) {
          console.error(
            "LAKIS vehicle image:",
            err
          );

          this._message =
            "Fahrzeugbild konnte nicht gespeichert werden.";

          this._render();
        }
      };

      reader.readAsDataURL(file);

    } catch (err) {
      console.error(err);

      this._message =
        "Fahrzeugbild konnte nicht verarbeitet werden.";

      this._render();
    }
  }
}

if (!customElements.get("lakis-solarworld-panel")) {
  customElements.define(
    "lakis-solarworld-panel",
    LakisSolarworldDashboard
  );
}