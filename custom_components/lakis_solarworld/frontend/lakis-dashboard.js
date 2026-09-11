class LakisSolarworldDashboard extends HTMLElement {
  constructor() {
    super();

    this._hass = null;
    this._panel = null;
    this._entry = null;
    this._data = {};
    this._weather = null;
    this._tab = "overview";
    this._last = 0;
    this._loading = false;
  }

  /**
   * Home Assistant provides the panel configuration
   * through the "panel" property.
   */
  set panel(value) {
    this._panel = value;
    this._entry = value?.config?.entry_id || null;

    this._load();
  }

  get panel() {
    return this._panel;
  }

  /**
   * Keep compatibility with possible older panel/custom
   * integrations that use setConfig().
   */
  setConfig(config) {
    this._entry = config?.entry_id || null;
    this._config = config || {};

    this._load();
  }

  set hass(value) {
    this._hass = value;

    if (!this._entry && this._panel) {
      this._entry =
        this._panel?.config?.entry_id || null;
    }

    if (!this._ready) {
      this._ready = true;
      this._load();
      return;
    }

    if (
      Date.now() - this._last > 3000
      && !this._loading
    ) {
      this._last = Date.now();
      this._render();
    }
  }

  get hass() {
    return this._hass;
  }

  async _load() {
    if (
      !this._hass
      || !this._entry
      || this._loading
    ) {
      return;
    }

    this._loading = true;

    try {
      this._data = await this._hass.callWS({
        type: "lakis_solarworld/get_config",
        entry_id: this._entry,
      });
    } catch (error) {
      console.error(
        "LAKIS SOLARWORLD: configuration could not be loaded",
        error
      );

      this._data = {
        modules: [
          "energy",
          "pv",
          "grid",
          "battery",
        ],
      };
    }

    const states = this._hass.states;

    this._weather =
      this._data.weather_entity
      && states[this._data.weather_entity]
        ? states[this._data.weather_entity]
        : Object.values(states).find(
            (state) =>
              state.entity_id.startsWith(
                "weather."
              )
          );

    this._loading = false;

    this._render();
  }

  _v(id) {
    const state =
      id && this._hass?.states?.[id];

    return state
      ? state.state
      : "--";
  }

  _unit(id) {
    const state =
      id && this._hass?.states?.[id];

    return (
      state?.attributes
        ?.unit_of_measurement || ""
    );
  }

  _metric(id, label) {
    return `
      <div class="metric">
        <span>${label}</span>
        <b>
          ${this._v(id)}
          ${this._unit(id)}
        </b>
      </div>
    `;
  }

  _tabs() {
    const names = {
      pv: "PV",
      grid: "Netz",
      battery: "Batterie",
      wallbox: "Wallbox",
      vehicle: "Fahrzeug",
      heatpump: "Wärmepumpe",
      climate: "Klima",
    };

    return [
      ["overview", "Übersicht"],
      ...(
        this._data.modules || []
      )
        .filter(
          (module) =>
            module !== "energy"
        )
        .map(
          (module) => [
            module,
            names[module] || module,
          ]
        ),
      ["settings", "⚙️ Einstellungen"],
    ];
  }

  _render() {
    if (!this._hass) {
      return;
    }

    const tabs = this._tabs();

    this.innerHTML = `
      <style>
        :host {
          display: block;
          color: #eef5ff;
          font-family:
            var(
              --paper-font-body1_-_font-family,
              Arial
            );
        }

        .app {
          background:
            linear-gradient(
              145deg,
              #06101e,
              #0b1b31
            );
          border:
            1px solid #1e3a59;
          border-radius: 24px;
          padding: 18px;
          min-height: 72vh;
        }

        .brand {
          text-align: center;
        }

        .brand img {
          max-width: 260px;
          max-height: 68px;
          border-radius: 12px;
        }

        .sub {
          text-align: center;
          opacity: .72;
          margin: 5px 0 14px;
        }

        nav {
          display: flex;
          gap: 7px;
          overflow: auto;
          padding-bottom: 12px;
        }

        button {
          background: #122741;
          color: #e7f1ff;
          border:
            1px solid #2a4766;
          border-radius: 12px;
          padding: 10px 13px;
          white-space: nowrap;
          cursor: pointer;
        }

        button.active {
          background: #1c486d;
          border-color: #60c7ff;
        }

        .grid {
          display: grid;
          grid-template-columns:
            repeat(
              auto-fit,
              minmax(210px, 1fr)
            );
          gap: 12px;
        }

        .card {
          background:
            rgba(
              14,
              34,
              57,
              .86
            );
          border:
            1px solid #234463;
          border-radius: 18px;
          padding: 16px;
        }

        .muted {
          opacity: .65;
        }

        .metric {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          border-bottom:
            1px solid #213b56;
        }

        .metric b {
          font-variant-numeric:
            tabular-nums;
        }

        .flow {
          height: 300px;
          position: relative;
          margin: 10px 0;
          border-radius: 22px;
          background:
            radial-gradient(
              circle at center,
              #143450,
              #081424
            );
          overflow: hidden;
        }

        .node {
          position: absolute;
          padding: 13px 16px;
          border-radius: 14px;
          background: #102944;
          border:
            1px solid #52b9ef;
          box-shadow:
            0 0 18px
            rgba(
              70,
              180,
              240,
              .2
            );
          text-align: center;
        }

        .node small {
          display: block;
          opacity: .7;
          margin-top: 4px;
        }

        .pv {
          left: 4%;
          top: 8%;
        }

        .house {
          left: 40%;
          top: 40%;
        }

        .bat {
          right: 4%;
          top: 8%;
        }

        .gridn {
          left: 4%;
          bottom: 8%;
        }

        .wall {
          right: 4%;
          bottom: 8%;
        }

        .line {
          position: absolute;
          height: 4px;
          border-radius: 3px;
          background:
            repeating-linear-gradient(
              90deg,
              #57d77d 0 12px,
              transparent 12px 24px
            );
          animation:
            dash .7s linear infinite;
          filter:
            drop-shadow(
              0 0 5px #57d77d
            );
        }

        .line.inactive {
          background: #637181;
          animation: none;
          filter: none;
          opacity: .22;
        }

        .flowlabel {
          position: absolute;
          font-size: 11px;
          font-weight: 700;
          padding: 3px 6px;
          border-radius: 8px;
          background: #081424cc;
        }

        .flowlabel.inactive {
          opacity: .35;
        }

        .legend {
          display: flex;
          gap: 14px;
          flex-wrap: wrap;
          justify-content: center;
          margin: 8px 0 14px;
          opacity: .82;
          font-size: 12px;
        }

        .red {
          background:
            repeating-linear-gradient(
              90deg,
              #ff5964 0 12px,
              transparent 12px 24px
            );
          filter:
            drop-shadow(
              0 0 5px #ff5964
            );
        }

        .blue {
          background:
            repeating-linear-gradient(
              90deg,
              #5bb8ff 0 12px,
              transparent 12px 24px
            );
          filter:
            drop-shadow(
              0 0 5px #5bb8ff
            );
        }

        .l1 {
          left: 20%;
          top: 26%;
          width: 22%;
        }

        .l2 {
          left: 57%;
          top: 26%;
          width: 22%;
        }

        .l3 {
          left: 20%;
          top: 66%;
          width: 22%;
        }

        .l4 {
          left: 57%;
          top: 66%;
          width: 22%;
        }

        .l1 + .flowlabel {
          left: 27%;
          top: 20%;
        }

        .l2 + .flowlabel {
          left: 64%;
          top: 20%;
        }

        .l3 + .flowlabel {
          left: 27%;
          top: 70%;
        }

        .l4 + .flowlabel {
          left: 64%;
          top: 70%;
        }

        @keyframes dash {
          to {
            background-position: 24px 0;
          }
        }

        .weather {
          text-align: center;
        }

        .weather b {
          font-size: 24px;
        }

        .upload input {
          width: 100%;
          margin-top: 10px;
        }
      </style>

      <div class="app">

        <div class="brand">
          <img
            src="/local/lakis_solarworld/customer_logo.jpeg"
            alt="LAKIS SOLARWORLD"
          >
        </div>

        <div class="sub">
          ${this._dateLine()}
        </div>

        <nav>
          ${tabs
            .map(
              ([key, name]) => `
                <button
                  data-tab="${key}"
                  class="${
                    this._tab === key
                      ? "active"
                      : ""
                  }"
                >
                  ${name}
                </button>
              `
            )
            .join("")}
        </nav>

        ${
          this._tab === "overview"
            ? this._overview()
            : this._tab === "settings"
              ? this._settings()
              : this._module(
                  this._tab
                )
        }

      </div>
    `;

    this
      .querySelectorAll(
        "[data-tab]"
      )
      .forEach(
        (button) => {
          button.onclick = () => {
            this._tab =
              button.dataset.tab;

            this._render();
          };
        }
      );

    const file =
      this.querySelector(
        "#vehicle-file"
      );

    if (file) {
      file.onchange = (event) =>
        this._upload(
          event.target.files[0]
        );
    }

    const save =
      this.querySelector(
        "#save-modules"
      );

    if (save) {
      save.onclick = () =>
        this._save({
          modules: [
            ...this.querySelectorAll(
              "input[name=mod]:checked"
            ),
          ].map(
            (input) =>
              input.value
          ),
        });
    }
  }

  _dateLine() {
    const date = new Date();

    const weather =
      this._weather;

    const location =
      this._hass.config
        .location_name ||
      this._hass.config.location ||
      "Home Assistant";

    return `
      ${date.toLocaleDateString(
        "de-DE",
        {
          weekday: "long",
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        }
      )}
      ·
      ${date.toLocaleTimeString(
        "de-DE",
        {
          hour: "2-digit",
          minute: "2-digit",
        }
      )}
      ·
      ${location}
      ${
        weather
          ? ` · ${
              weather.attributes
                ?.friendly_name ||
              "Wetter"
            }`
          : ""
      }
    `;
  }

  _num(id) {
    const value =
      parseFloat(
        this._v(id)
      );

    return Number.isFinite(value)
      ? value
      : 0;
  }

  _overview() {
    const pv =
      this._num(
        this._data.pv_power
      );

    const house =
      Math.max(
        0,
        this._num(
          this._data.house_power
        )
      );

    const grid =
      this._num(
        this._data.grid_power
      );

    const batt =
      this._num(
        this._data.battery_power
      );

    const wall =
      Math.max(
        0,
        this._num(
          this._data.wallbox_power
        )
      );

    const pvToHouse =
      Math.min(
        Math.max(pv, 0),
        house
      );

    const pvSurplus =
      Math.max(
        0,
        pv - house
      );

    const pvToBattery =
      Math.max(
        0,
        Math.min(
          pvSurplus,
          Math.max(
            0,
            batt
          )
        )
      );

    const pvToWall =
      Math.max(
        0,
        Math.min(
          Math.max(
            0,
            pvSurplus -
              pvToBattery
          ),
          wall
        )
      );

    const batteryToHouse =
      batt < 0
        ? Math.min(
            Math.abs(batt),
            house
          )
        : 0;

    const gridToHouse =
      grid > 50
        ? Math.min(
            grid,
            Math.max(
              0,
              house -
                pvToHouse -
                batteryToHouse
            )
          )
        : 0;

    const gridExport =
      grid < -50
        ? Math.abs(grid)
        : 0;

    const line = (
      classes,
      label,
      power
    ) => `
      <div
        class="line ${classes}
        ${
          Math.abs(power) < 50
            ? "inactive"
            : ""
        }"
      ></div>

      <span
        class="flowlabel
        ${
          Math.abs(power) < 50
            ? "inactive"
            : ""
        }"
      >
        ${label}
      </span>
    `;

    return `
      <div class="flow">

        <div class="node pv">
          ☀️ PV
          <small>
            ${this._v(
              this._data.pv_power
            )}
            ${this._unit(
              this._data.pv_power
            )}
          </small>
        </div>

        <div class="node house">
          🏠 Haus
          <small>
            ${this._v(
              this._data.house_power
            )}
            ${this._unit(
              this._data.house_power
            )}
          </small>
        </div>

        <div class="node bat">
          🔋 Batterie
          <small>
            ${this._v(
              this._data.battery_soc
            )}
            %
            ·
            ${this._v(
              this._data.battery_power
            )}
            ${this._unit(
              this._data.battery_power
            )}
          </small>
        </div>

        <div class="node gridn">
          🔌 Netz
          <small>
            ${this._v(
              this._data.grid_power
            )}
            ${this._unit(
              this._data.grid_power
            )}
          </small>
        </div>

        <div class="node wall">
          🚗 Wallbox
          <small>
            ${this._v(
              this._data.wallbox_power
            )}
            ${this._unit(
              this._data.wallbox_power
            )}
          </small>
        </div>

        ${line(
          "l1 green",
          `${pvToHouse.toFixed(0)} W`,
          pvToHouse
        )}

        ${line(
          `l2 ${
            pvToBattery > 0
              ? "green"
              : "blue"
          }`,
          `${(
            pvToBattery ||
            batteryToHouse
          ).toFixed(0)} W`,
          pvToBattery ||
            batteryToHouse
        )}

        ${line(
          `l3 ${
            gridToHouse > 0
              ? "red"
              : "green"
          }`,
          `${(
            gridToHouse ||
            gridExport
          ).toFixed(0)} W`,
          gridToHouse ||
            gridExport
        )}

        ${line(
          `l4 ${
            pvToWall > 0
              ? "green"
              : "red"
          }`,
          `${(
            pvToWall ||
            Math.max(
              0,
              wall -
                pvToWall
            )
          ).toFixed(0)} W`,
          pvToWall ||
            Math.max(
              0,
              wall -
                pvToWall
            )
        )}

      </div>

      <div class="legend">
        <span>
          🟢 PV / erneuerbar
        </span>
        <span>
          🔴 Netzbezug
        </span>
        <span>
          🔵 Batterie
        </span>
        <span>
          ⚪ kein relevanter Fluss
        </span>
      </div>

      <div class="grid">

        <div class="card">
          ${this._metric(
            this._data.pv_power,
            "PV"
          )}
        </div>

        <div class="card">
          ${this._metric(
            this._data.house_power,
            "Hausverbrauch"
          )}
        </div>

        <div class="card">
          ${this._metric(
            this._data.grid_power,
            "Netz"
          )}
        </div>

        <div class="card">
          ${this._metric(
            this._data.battery_soc,
            "Batterie SOC"
          )}
          ${this._metric(
            this._data.battery_power,
            "Batterieleistung"
          )}
        </div>

        <div class="card">
          ${this._metric(
            this._data.wallbox_power,
            "Wallbox"
          )}
        </div>

        <div class="card weather">
          ${
            this._weather
              ? `
                <b>
                  🌤️
                  ${this._weather.state}
                </b>

                <div>
                  ${
                    this._weather
                      .attributes
                      ?.temperature ??
                    "--"
                  }
                  ${
                    this._weather
                      .attributes
                      ?.temperature_unit ||
                    "°C"
                  }
                </div>
              `
              : `
                <div class="muted">
                  Keine Wetter-Entity
                  vorhanden
                </div>
              `
          }
        </div>

      </div>
    `;
  }

  _settings() {
    const modules = [
      ["energy", "Energie / Haus"],
      ["pv", "PV"],
      ["grid", "Netz"],
      ["battery", "Batterie"],
      ["wallbox", "Wallbox"],
      ["vehicle", "Fahrzeug"],
      ["heatpump", "Wärmepumpe"],
      ["climate", "Klimaanlagen"],
    ];

    return `
      <div class="grid">

        <div class="card">

          <h2>
            Installation
          </h2>

          <p class="muted">
            Nur aktivierte Module
            werden angezeigt.
          </p>

          ${
            modules
              .map(
                ([key, name]) => `
                  <label
                    style="
                      display:block;
                      padding:8px
                    "
                  >
                    <input
                      type="checkbox"
                      name="mod"
                      value="${key}"
                      ${
                        this._data
                          .modules
                          ?.includes(
                            key
                          )
                          ? "checked"
                          : ""
                      }
                    >
                    ${name}
                  </label>
                `
              )
              .join("")
          }

          <button
            id="save-modules"
          >
            Module speichern
          </button>

        </div>

        <div class="card">

          <h2>
            Wetter
          </h2>

          <p class="muted">
            Automatisch aus
            vorhandenen
            Home-Assistant
            weather.*
            Entities.
          </p>

          ${
            this._weather
              ? `✓ ${this._weather.entity_id}`
              : "Keine Wetter-Entity gefunden."
          }

        </div>

      </div>
    `;
  }

  _module(module) {
    if (module === "battery") {
      return `
        <div class="card">
          <h2>
            🔋 Batterie
          </h2>

          ${this._metric(
            this._data.battery_soc,
            "SOC"
          )}

          ${this._metric(
            this._data.battery_power,
            "Leistung"
          )}
        </div>
      `;
    }

    if (module === "wallbox") {
      return `
        <div class="card">

          <h2>
            🚗 Wallbox
          </h2>

          ${this._metric(
            this._data.wallbox_power,
            "Ladeleistung"
          )}

          ${this._metric(
            this._data.wallbox_status,
            "Status"
          )}

        </div>
      `;
    }

    if (module === "vehicle") {
      return `
        <div class="grid">

          <div class="card">

            <h2>
              🚘
              ${
                this._data
                  .vehicle_name ||
                "Fahrzeug"
              }
            </h2>

            ${this._metric(
              this._data.vehicle_soc,
              "SOC"
            )}

            ${this._metric(
              this._data.vehicle_status,
              "Status"
            )}

          </div>

          <div class="card upload">

            ${
              this._data.vehicle_image
                ? `
                  <img
                    src="${
                      this._data
                        .vehicle_image
                    }"
                    style="
                      width:100%;
                      max-height:260px;
                      object-fit:cover;
                      border-radius:14px
                    "
                  >
                `
                : ""
            }

            <input
              id="vehicle-file"
              type="file"
              accept="
                image/jpeg,
                image/png,
                image/webp
              "
            >

          </div>

        </div>
      `;
    }

    if (module === "heatpump") {
      return `
        <div class="grid">

          <div class="card">

            <h2>
              🔥 Wärmepumpe
            </h2>

            ${this._metric(
              this._data.heatpump_power,
              "Leistung"
            )}

            ${this._metric(
              this._data.heatpump_entity,
              "Status"
            )}

          </div>

          <div class="card">

            ${this._metric(
              this._data
                .heatpump_outdoor_temp,
              "Außen"
            )}

            ${this._metric(
              this._data
                .heatpump_flow_temp,
              "Vorlauf"
            )}

            ${this._metric(
              this._data
                .heatpump_return_temp,
              "Rücklauf"
            )}

          </div>

        </div>
      `;
    }

    if (module === "climate") {
      return `
        <div class="grid">

          ${
            (
              this._data
                .climate_entities ||
              []
            )
              .map(
                (id) => `
                  <div class="card">

                    <h3>
                      ${id}
                    </h3>

                    ${this._metric(
                      id,
                      "Status"
                    )}

                  </div>
                `
              )
              .join("")
          }

          ${
            (
              this._data
                .climate_entities ||
              []
            ).length === 0
              ? `
                <div class="card">
                  Keine Klimaanlage
                  konfiguriert.
                </div>
              `
              : ""
          }

        </div>
      `;
    }

    return `
      <div class="card">

        <h2>
          ${module.toUpperCase()}
        </h2>

        ${this._metric(
          this._data[
            module + "_power"
          ],
          "Leistung"
        )}

      </div>
    `;
  }

  async _save(patch) {
    this._data = {
      ...this._data,
      ...patch,
    };

    await this._hass.callWS({
      type:
        "lakis_solarworld/save_config",
      entry_id: this._entry,
      config: this._data,
    });

    await this._load();
  }

  async _upload(file) {
    if (!file) {
      return;
    }

    const reader =
      new FileReader();

    reader.onload = async () => {
      await this._hass.callWS({
        type:
          "lakis_solarworld/"
          + "upload_vehicle_image",
        entry_id: this._entry,
        filename: file.name,
        data: reader.result,
      });

      await this._load();
    };

    reader.readAsDataURL(file);
  }
}


if (
  !customElements.get(
    "lakis-solarworld-panel"
  )
) {
  customElements.define(
    "lakis-solarworld-panel",
    LakisSolarworldDashboard
  );
}


if (
  !customElements.get(
    "lakis-solarworld-dashboard"
  )
) {
  customElements.define(
    "lakis-solarworld-dashboard",
    LakisSolarworldDashboard
  );
}


window.customCards =
  window.customCards || [];

window.customCards.push({
  type:
    "lakis-solarworld-dashboard",
  name:
    "LAKIS SOLARWORLD Dashboard",
  description:
    "Modulares Energie-Dashboard",
});


window.customStrategies =
  window.customStrategies || [];