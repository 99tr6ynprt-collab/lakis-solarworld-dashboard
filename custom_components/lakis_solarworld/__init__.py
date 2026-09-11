from __future__ import annotations

import base64
import binascii
from pathlib import Path
from typing import Any

import voluptuous as vol
from homeassistant.components import frontend, panel_custom, websocket_api
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import config_validation as cv

DOMAIN = "lakis_solarworld"
PLATFORMS: list[str] = []

LICENSE_DATA_KEYS = {
    "license_key",
    "license_id",
    "license_plan",
    "license_lifetime",
    "license_customer",
}

BACKGROUND_SCREENS = {
    "overview",
    "pv",
    "grid",
    "battery",
    "wallbox",
    "heatpump",
    "vehicle",
    "climate",
    "settings",
}


def _get_combined_config(entry: ConfigEntry) -> dict[str, Any]:
    config = dict(entry.data)
    config.update(entry.options)
    return config


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    hass.data.setdefault(DOMAIN, {})

    static_dir = Path(__file__).parent / "frontend"
    await hass.http.async_register_static_paths(
        [
            StaticPathConfig(
                "/api/lakis_solarworld/static",
                str(static_dir),
                False,
            )
        ]
    )

    _register_websocket(hass)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = _get_combined_config(entry)

    if not hass.data[DOMAIN].get("panel_registered"):
        await panel_custom.async_register_panel(
            hass,
            webcomponent_name="lakis-solarworld-panel",
            frontend_url_path="lakis-solarworld",
            module_url=(
                "/api/lakis_solarworld/static/"
                "lakis-dashboard.js?v=1012"
            ),
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


async def async_migrate_entry(hass: HomeAssistant, config_entry: ConfigEntry) -> bool:
    new_data = dict(config_entry.data)
    new_options = dict(config_entry.options)

    for key in list(new_data):
        if key in LICENSE_DATA_KEYS:
            continue
        new_options.setdefault(key, new_data[key])
        new_data.pop(key, None)

    if "modules" in config_entry.data:
        new_options.setdefault("modules", config_entry.data["modules"])

    new_options.setdefault(
        "backgrounds",
        {
            "overview": "",
            "pv": "",
            "grid": "",
            "battery": "",
            "wallbox": "",
            "heatpump": "",
            "vehicle": "",
            "climate": "",
            "settings": "",
        },
    )

    if (
        config_entry.version != 3
        or dict(config_entry.data) != new_data
        or dict(config_entry.options) != new_options
    ):
        hass.config_entries.async_update_entry(
            config_entry,
            data=new_data,
            options=new_options,
            version=3,
        )

    return True


def _get_entry(hass: HomeAssistant, entry_id: str) -> ConfigEntry:
    entry = hass.config_entries.async_get_entry(entry_id)
    if not entry or entry.domain != DOMAIN:
        raise HomeAssistantError("Invalid LAKIS SOLARWORLD config entry")
    return entry


def _split_config(
    config: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any]]:
    data: dict[str, Any] = {}
    options: dict[str, Any] = {}

    for key, value in config.items():
        if key in LICENSE_DATA_KEYS:
            data[key] = value
        else:
            options[key] = value

    return data, options


def _decode_image(raw: str) -> bytes:
    if "," in raw:
        raw = raw.split(",", 1)[1]

    try:
        data = base64.b64decode(raw, validate=True)
    except (binascii.Error, ValueError) as err:
        raise HomeAssistantError("Invalid image data") from err

    if len(data) > 8 * 1024 * 1024:
        raise HomeAssistantError("Image is larger than 8 MB")

    return data


def _image_extension(data: bytes) -> str:
    if data.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if data.startswith(b"RIFF") and b"WEBP" in data[:16]:
        return ".webp"
    raise HomeAssistantError("Only JPEG, PNG or WebP images are supported")


def _register_websocket(hass: HomeAssistant) -> None:
    @websocket_api.websocket_command(
        {
            vol.Required("type"): "lakis_solarworld/get_config",
            vol.Required("entry_id"): cv.string,
        }
    )
    @callback
    def get_config(hass, connection, msg):
        entry = _get_entry(hass, msg["entry_id"])
        connection.send_result(msg["id"], _get_combined_config(entry))

    @websocket_api.websocket_command(
        {
            vol.Required("type"): "lakis_solarworld/save_config",
            vol.Required("entry_id"): cv.string,
            vol.Required("config"): dict,
        }
    )
    @websocket_api.async_response
    async def save_config(hass, connection, msg):
        entry = _get_entry(hass, msg["entry_id"])
        new_data, new_options = _split_config(dict(msg["config"]))

        merged_data = dict(entry.data)
        merged_data.update(new_data)

        hass.config_entries.async_update_entry(
            entry,
            data=merged_data,
            options=new_options,
        )

        updated_config = _get_combined_config(entry)
        hass.data.setdefault(DOMAIN, {})[entry.entry_id] = updated_config

        connection.send_result(
            msg["id"],
            {"ok": True, "config": updated_config},
        )

    @websocket_api.websocket_command(
        {
            vol.Required("type"): "lakis_solarworld/suggest_entities",
        }
    )
    @callback
    def suggest_entities_ws(hass, connection, msg):
        connection.send_result(msg["id"], suggest_entities(hass))

    @websocket_api.websocket_command(
        {
            vol.Required("type"): "lakis_solarworld/upload_vehicle_image",
            vol.Required("entry_id"): cv.string,
            vol.Required("filename"): cv.string,
            vol.Required("data"): cv.string,
        }
    )
    @websocket_api.async_response
    async def upload_vehicle_image(hass, connection, msg):
        entry = _get_entry(hass, msg["entry_id"])
        data = _decode_image(msg["data"])
        extension = _image_extension(data)

        target_dir = Path(hass.config.path("www/lakis_solarworld/vehicles"))
        target_dir.mkdir(parents=True, exist_ok=True)
        target = target_dir / f"vehicle{extension}"

        await hass.async_add_executor_job(target.write_bytes, data)

        image_url = f"/local/lakis_solarworld/vehicles/vehicle{extension}"
        options = dict(entry.options)
        options["vehicle_image"] = image_url

        hass.config_entries.async_update_entry(entry, options=options)
        updated_config = _get_combined_config(entry)
        hass.data.setdefault(DOMAIN, {})[entry.entry_id] = updated_config

        connection.send_result(msg["id"], {"ok": True, "url": image_url})

    @websocket_api.websocket_command(
        {
            vol.Required("type"): "lakis_solarworld/upload_background_image",
            vol.Required("entry_id"): cv.string,
            vol.Required("screen"): cv.string,
            vol.Required("data"): cv.string,
        }
    )
    @websocket_api.async_response
    async def upload_background_image(hass, connection, msg):
        entry = _get_entry(hass, msg["entry_id"])
        screen = msg["screen"]

        if screen not in BACKGROUND_SCREENS:
            raise HomeAssistantError("Invalid dashboard screen")

        data = _decode_image(msg["data"])
        extension = _image_extension(data)

        target_dir = Path(hass.config.path("www/lakis_solarworld/backgrounds"))
        target_dir.mkdir(parents=True, exist_ok=True)
        target = target_dir / f"{screen}{extension}"

        await hass.async_add_executor_job(target.write_bytes, data)

        image_url = f"/local/lakis_solarworld/backgrounds/{screen}{extension}"
        options = dict(entry.options)
        backgrounds = dict(options.get("backgrounds", {}))
        backgrounds[screen] = image_url
        options["backgrounds"] = backgrounds

        hass.config_entries.async_update_entry(entry, options=options)
        updated_config = _get_combined_config(entry)
        hass.data.setdefault(DOMAIN, {})[entry.entry_id] = updated_config

        connection.send_result(msg["id"], {"ok": True, "url": image_url})

    @websocket_api.websocket_command(
        {
            vol.Required("type"): "lakis_solarworld/reset_background",
            vol.Required("entry_id"): cv.string,
            vol.Required("screen"): cv.string,
        }
    )
    @websocket_api.async_response
    async def reset_background(hass, connection, msg):
        entry = _get_entry(hass, msg["entry_id"])
        screen = msg["screen"]

        if screen not in BACKGROUND_SCREENS:
            raise HomeAssistantError("Invalid dashboard screen")

        options = dict(entry.options)
        backgrounds = dict(options.get("backgrounds", {}))
        old_url = backgrounds.pop(screen, "")

        if old_url:
            old_path = Path(
                hass.config.path(
                    old_url.replace("/local/", "").replace("/", "/")
                )
            )
            # Delete only files inside the expected background directory.
            background_dir = Path(hass.config.path("www/lakis_solarworld/backgrounds"))
            if old_path.parent == background_dir and old_path.exists():
                try:
                    old_path.unlink()
                except OSError:
                    pass

        backgrounds[screen] = ""
        options["backgrounds"] = backgrounds
        hass.config_entries.async_update_entry(entry, options=options)

        updated_config = _get_combined_config(entry)
        hass.data.setdefault(DOMAIN, {})[entry.entry_id] = updated_config

        connection.send_result(msg["id"], {"ok": True, "config": updated_config})

    websocket_api.async_register_command(hass, get_config)
    websocket_api.async_register_command(hass, save_config)
    websocket_api.async_register_command(hass, suggest_entities_ws)
    websocket_api.async_register_command(hass, upload_vehicle_image)
    websocket_api.async_register_command(hass, upload_background_image)
    websocket_api.async_register_command(hass, reset_background)


def suggest_entities(hass: HomeAssistant) -> dict[str, list[str]]:
    states = hass.states.async_all()
    result = {
        "pv_power": [],
        "house_power": [],
        "grid_power": [],
        "battery_power": [],
        "battery_soc": [],
        "wallbox_power": [],
        "wallbox_status": [],
        "weather": [],
    }

    for state in states:
        entity_id = state.entity_id.lower()
        attributes = state.attributes
        friendly_name = str(attributes.get("friendly_name", "")).lower()
        text = f"{entity_id} {friendly_name}"
        unit = str(attributes.get("unit_of_measurement", "")).lower()

        if state.entity_id.startswith("weather."):
            result["weather"].append(state.entity_id)

        if not any(value in text for value in ("sigen", "sigenergy")):
            continue

        if "pv" in text and ("power" in text or unit in ("w", "kw")):
            result["pv_power"].append(state.entity_id)

        if (
            ("load" in text or "house" in text or "home" in text)
            and unit in ("w", "kw")
        ):
            result["house_power"].append(state.entity_id)

        if "grid" in text and unit in ("w", "kw"):
            result["grid_power"].append(state.entity_id)

        if (
            ("battery" in text or "ess" in text)
            and unit in ("w", "kw")
        ):
            result["battery_power"].append(state.entity_id)

        if (
            ("soc" in text or "state of charge" in text)
            and unit == "%"
        ):
            result["battery_soc"].append(state.entity_id)

        if (
            ("charger" in text or "wallbox" in text)
            and unit in ("w", "kw")
        ):
            result["wallbox_power"].append(state.entity_id)

        if (
            ("charger" in text or "wallbox" in text)
            and unit not in ("w", "kw")
        ):
            result["wallbox_status"].append(state.entity_id)

    return result
