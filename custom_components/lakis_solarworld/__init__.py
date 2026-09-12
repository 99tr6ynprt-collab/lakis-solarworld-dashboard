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
from homeassistant.helpers.storage import Store

DOMAIN = "lakis_solarworld"
PLATFORMS: list[str] = []
MODULE_STORE_VERSION = 1
MODULE_STORE_KEY = "module_states"

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


def _modules_from_config(config: dict[str, Any]) -> dict[str, bool]:
    raw = config.get("modules") or {}
    return {str(key): bool(value) for key, value in dict(raw).items()}


def _config_with_persisted_modules(
    hass: HomeAssistant, entry: ConfigEntry
) -> dict[str, Any]:
    config = _get_combined_config(entry)
    store_data = hass.data.get(DOMAIN, {}).get(MODULE_STORE_KEY, {})
    stored = store_data.get(entry.entry_id) if isinstance(store_data, dict) else None
    if isinstance(stored, dict):
        modules = _modules_from_config(config)
        modules.update({str(k): bool(v) for k, v in stored.items()})
        config["modules"] = modules
    return config


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    hass.data.setdefault(DOMAIN, {})
    store = Store(hass, MODULE_STORE_VERSION, "lakis_solarworld_modules")
    stored = await store.async_load()
    if not isinstance(stored, dict):
        stored = {}
    hass.data[DOMAIN]["module_store"] = store
    hass.data[DOMAIN][MODULE_STORE_KEY] = stored

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
                "lakis-dashboard.js?v=1021"
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
        config = _config_with_persisted_modules(hass, entry)
        connection.send_result(msg["id"], config)

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
        new_data, requested_options = _split_config(dict(msg["config"]))

        # Backward compatibility: older/cached frontends can still send the
        # modules block through save_config. Persist it instead of discarding it.
        incoming_modules = requested_options.pop("modules", None)
        if isinstance(incoming_modules, dict):
            domain_data = hass.data.setdefault(DOMAIN, {})
            module_store = domain_data.get("module_store")
            if module_store is None:
                module_store = Store(
                    hass, MODULE_STORE_VERSION, "lakis_solarworld_modules"
                )
                domain_data["module_store"] = module_store

            store_data = domain_data.setdefault(MODULE_STORE_KEY, {})
            stored_modules = dict(store_data.get(entry.entry_id, {}))
            if not stored_modules:
                stored_modules.update(
                    _modules_from_config(_get_combined_config(entry))
                )

            for key, value in incoming_modules.items():
                stored_modules[str(key)] = bool(value)

            store_data[entry.entry_id] = stored_modules
            await module_store.async_save(store_data)
            requested_options["modules"] = dict(stored_modules)

        merged_data = dict(entry.data)
        merged_data.update(new_data)
        merged_options = dict(entry.options)
        merged_options.update(requested_options)

        hass.config_entries.async_update_entry(
            entry,
            data=merged_data,
            options=merged_options,
        )

        # async_update_entry updates the ConfigEntry object immediately. Read
        # it back after the update so the response is the authoritative state.
        updated_config = _config_with_persisted_modules(hass, entry)
        hass.data.setdefault(DOMAIN, {})[entry.entry_id] = dict(updated_config)

        connection.send_result(
            msg["id"],
            {"ok": True, "config": updated_config},
        )

    @websocket_api.websocket_command(
        {
            vol.Required("type"): "lakis_solarworld/set_module",
            vol.Required("entry_id"): cv.string,
            vol.Required("module"): cv.string,
            vol.Required("enabled"): bool,
        }
    )
    @websocket_api.async_response
    async def set_module(hass, connection, msg):
        entry = _get_entry(hass, msg["entry_id"])
        module = msg["module"]
        if module not in {
            "energy", "pv", "grid", "battery",
            "wallbox", "vehicle", "heatpump", "climate",
        }:
            raise HomeAssistantError("Invalid LAKIS SOLARWORLD module")

        # Module state has its own persistent HA Store. This is deliberately
        # independent from the generic ConfigEntry save path so an older
        # configuration snapshot can never resurrect a disabled module.
        domain_data = hass.data.setdefault(DOMAIN, {})
        module_store = domain_data.get("module_store")
        if module_store is None:
            module_store = Store(hass, MODULE_STORE_VERSION, "lakis_solarworld_modules")
            domain_data["module_store"] = module_store

        store_data = domain_data.setdefault(MODULE_STORE_KEY, {})
        stored_modules = dict(store_data.get(entry.entry_id, {}))

        # Seed the independent store from the current ConfigEntry once, then
        # change only the requested module.
        if not stored_modules:
            stored_modules.update(_modules_from_config(_get_combined_config(entry)))
        stored_modules[module] = bool(msg["enabled"])

        store_data[entry.entry_id] = stored_modules
        await module_store.async_save(store_data)

        # Keep ConfigEntry.options in sync as a secondary copy. The Store above
        # remains authoritative for module visibility.
        options = dict(entry.options)
        options["modules"] = dict(stored_modules)
        hass.config_entries.async_update_entry(entry, options=options)

        updated_config = _config_with_persisted_modules(hass, entry)
        hass.data.setdefault(DOMAIN, {})[entry.entry_id] = dict(updated_config)

        connection.send_result(
            msg["id"],
            {
                "ok": True,
                "module": module,
                "enabled": bool(msg["enabled"]),
                "config": updated_config,
            },
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
    websocket_api.async_register_command(hass, set_module)
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
        "battery_charge_power": [],
        "battery_discharge_power": [],
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
            if any(token in text for token in ("charge", "charging", "laden")):
                result["battery_charge_power"].append(state.entity_id)
            if any(token in text for token in ("discharge", "discharging", "entladen")):
                result["battery_discharge_power"].append(state.entity_id)

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
