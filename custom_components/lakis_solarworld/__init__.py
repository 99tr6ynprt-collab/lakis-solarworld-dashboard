from __future__ import annotations

import base64
import binascii
import shutil
from pathlib import Path

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.components import websocket, frontend, panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import entity_registry as er

from .license import verify_license

DOMAIN = "lakis_solarworld"
PLATFORMS: list[str] = []

async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    hass.data.setdefault(DOMAIN, {})
    static_dir = Path(__file__).parent / "frontend"
    await hass.http.async_register_static_paths([
        StaticPathConfig("/api/lakis_solarworld/static", str(static_dir), True)
    ])
    _register_websocket(hass)
    return True

async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = dict(entry.data)
    # Register a native sidebar panel so no manual Lovelace resource is required.
    if not hass.data[DOMAIN].get("panel_registered"):
        await panel_custom.async_register_panel(
            hass,
            webcomponent_name="lakis-solarworld-panel",
            frontend_url_path="lakis-solarworld",
            module_url="/api/lakis_solarworld/static/lakis-dashboard.js",
            sidebar_title="LAKIS SOLARWORLD",
            sidebar_icon="mdi:solar-power",
            require_admin=False,
            config={"entry_id": entry.entry_id},
            config_panel_domain=DOMAIN,
        )
        hass.data[DOMAIN]["panel_registered"] = True
        hass.data[DOMAIN]["panel_entry_id"] = entry.entry_id
    return True

async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    hass.data.get(DOMAIN, {}).pop(entry.entry_id, None)
    if hass.data.get(DOMAIN, {}).get("panel_entry_id") == entry.entry_id:
        frontend.async_remove_panel(hass, "lakis-solarworld")
        hass.data[DOMAIN].pop("panel_registered", None)
        hass.data[DOMAIN].pop("panel_entry_id", None)
    return True

def _get_entry(hass, entry_id):
    entry = hass.config_entries.async_get_entry(entry_id)
    if not entry or entry.domain != DOMAIN:
        raise HomeAssistantError("Invalid LAKIS SOLARWORLD config entry")
    return entry

def _register_websocket(hass):
    async def get_config(hass, connection, msg):
        entry = _get_entry(hass, msg["entry_id"])
        connection.send_result(msg["id"], dict(entry.data))

    async def save_config(hass, connection, msg):
        entry = _get_entry(hass, msg["entry_id"])
        await hass.config_entries.async_update_entry(entry, data=dict(msg["config"]))
        hass.data.setdefault(DOMAIN, {})[entry.entry_id] = dict(msg["config"])
        connection.send_result(msg["id"], {"ok": True})

    async def suggest_entities_ws(hass, connection, msg):
        connection.send_result(msg["id"], suggest_entities(hass))

    async def upload_vehicle_image(hass, connection, msg):
        entry = _get_entry(hass, msg["entry_id"])
        raw = msg["data"]
        if "," in raw:
            raw = raw.split(",", 1)[1]
        try:
            data = base64.b64decode(raw, validate=True)
        except (binascii.Error, ValueError) as err:
            raise HomeAssistantError("Invalid image data") from err
        if len(data) > 8 * 1024 * 1024:
            raise HomeAssistantError("Image is larger than 8 MB")
        if data.startswith(b"\xff\xd8\xff"):
            ext = ".jpg"
        elif data.startswith(b"\x89PNG\r\n\x1a\n"):
            ext = ".png"
        elif data.startswith(b"RIFF") and b"WEBP" in data[:16]:
            ext = ".webp"
        else:
            raise HomeAssistantError("Only JPEG, PNG or WebP images are supported")
        target_dir = Path(hass.config.path("www/lakis_solarworld/vehicles"))
        target_dir.mkdir(parents=True, exist_ok=True)
        target = target_dir / ("vehicle" + ext)
        await hass.async_add_executor_job(target.write_bytes, data)
        cfg = dict(entry.data)
        cfg["vehicle_image"] = f"/local/lakis_solarworld/vehicles/vehicle{ext}"
        await hass.config_entries.async_update_entry(entry, data=cfg)
        hass.data.setdefault(DOMAIN, {})[entry.entry_id] = cfg
        connection.send_result(msg["id"], {"ok": True, "url": cfg["vehicle_image"]})

    websocket.async_register_command(hass, {"type": "lakis_solarworld/get_config", "entry_id": str}, get_config)
    websocket.async_register_command(hass, {"type": "lakis_solarworld/save_config", "entry_id": str, "config": dict}, save_config)
    websocket.async_register_command(hass, {"type": "lakis_solarworld/suggest_entities"}, suggest_entities_ws)
    websocket.async_register_command(hass, {"type": "lakis_solarworld/upload_vehicle_image", "entry_id": str, "filename": str, "data": str}, upload_vehicle_image)

def suggest_entities(hass):
    states = hass.states.async_all()
    out = {"pv_power": [], "house_power": [], "grid_power": [], "battery_power": [], "battery_soc": [], "wallbox_power": [], "wallbox_status": [], "weather": []}
    for s in states:
        eid = s.entity_id.lower(); attrs = s.attributes; name = str(attrs.get("friendly_name", "")).lower(); text = f"{eid} {name}"; unit = str(attrs.get("unit_of_measurement", "")).lower()
        if s.entity_id.startswith("weather."): out["weather"].append(s.entity_id)
        if any(x in text for x in ("sigen", "sigenergy")):
            if "pv" in text and ("power" in text or unit in ("w", "kw")): out["pv_power"].append(s.entity_id)
            if ("load" in text or "house" in text or "home" in text) and unit in ("w", "kw"): out["house_power"].append(s.entity_id)
            if "grid" in text and unit in ("w", "kw"): out["grid_power"].append(s.entity_id)
            if ("battery" in text or "ess" in text) and unit in ("w", "kw"): out["battery_power"].append(s.entity_id)
            if ("soc" in text or "state of charge" in text) and unit == "%": out["battery_soc"].append(s.entity_id)
            if ("charger" in text or "wallbox" in text) and unit in ("w", "kw"): out["wallbox_power"].append(s.entity_id)
            if ("charger" in text or "wallbox" in text) and unit not in ("w", "kw"): out["wallbox_status"].append(s.entity_id)
    return out
