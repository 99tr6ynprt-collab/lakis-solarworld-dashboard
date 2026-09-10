from __future__ import annotations

import base64
import binascii
from pathlib import Path

import voluptuous as vol

from homeassistant.components import frontend, panel_custom, websocket_api
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import config_validation as cv

DOMAIN = "lakis_solarworld"
PLATFORMS: list[str] = []


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Set up the LAKIS SOLARWORLD integration."""
    hass.data.setdefault(DOMAIN, {})

    static_dir = Path(__file__).parent / "frontend"

    await hass.http.async_register_static_paths(
        [
            StaticPathConfig(
                "/api/lakis_solarworld/static",
                str(static_dir),
                True,
            )
        ]
    )

    _register_websocket(hass)

    return True


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
) -> bool:
    """Set up a LAKIS SOLARWORLD config entry."""
    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = dict(entry.data)

    # Register the native sidebar panel.
    # No manual Lovelace resource is required.
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


async def async_unload_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
) -> bool:
    """Unload a LAKIS SOLARWORLD config entry."""
    hass.data.get(DOMAIN, {}).pop(entry.entry_id, None)

    if hass.data.get(DOMAIN, {}).get("panel_entry_id") == entry.entry_id:
        frontend.async_remove_panel(hass, "lakis-solarworld")

        hass.data[DOMAIN].pop("panel_registered", None)
        hass.data[DOMAIN].pop("panel_entry_id", None)

    return True


def _get_entry(
    hass: HomeAssistant,
    entry_id: str,
) -> ConfigEntry:
    """Return and validate a LAKIS config entry."""
    entry = hass.config_entries.async_get_entry(entry_id)

    if not entry or entry.domain != DOMAIN:
        raise HomeAssistantError(
            "Invalid LAKIS SOLARWORLD config entry"
        )

    return entry


def _register_websocket(hass: HomeAssistant) -> None:
    """Register LAKIS SOLARWORLD WebSocket commands."""

    @websocket_api.websocket_command(
        {
            vol.Required("type"): "lakis_solarworld/get_config",
            vol.Required("entry_id"): cv.string,
        }
    )
    @callback
    def get_config(
        hass: HomeAssistant,
        connection: websocket_api.ActiveConnection,
        msg: dict,
    ) -> None:
        """Return the current LAKIS configuration."""
        entry = _get_entry(hass, msg["entry_id"])

        connection.send_result(
            msg["id"],
            dict(entry.data),
        )

    @websocket_api.websocket_command(
        {
            vol.Required("type"): "lakis_solarworld/save_config",
            vol.Required("entry_id"): cv.string,
            vol.Required("config"): dict,
        }
    )
    @websocket_api.async_response
    async def save_config(
        hass: HomeAssistant,
        connection: websocket_api.ActiveConnection,
        msg: dict,
    ) -> None:
        """Save the LAKIS configuration."""
        entry = _get_entry(hass, msg["entry_id"])

        new_config = dict(msg["config"])

        await hass.config_entries.async_update_entry(
            entry,
            data=new_config,
        )

        hass.data.setdefault(DOMAIN, {})[entry.entry_id] = new_config

        connection.send_result(
            msg["id"],
            {"ok": True},
        )

    @websocket_api.websocket_command(
        {
            vol.Required("type"): "lakis_solarworld/suggest_entities",
        }
    )
    @callback
    def suggest_entities_ws(
        hass: HomeAssistant,
        connection: websocket_api.ActiveConnection,
        msg: dict,
    ) -> None:
        """Suggest matching Home Assistant entities."""
        connection.send_result(
            msg["id"],
            suggest_entities(hass),
        )

    @websocket_api.websocket_command(
        {
            vol.Required("type"): "lakis_solarworld/upload_vehicle_image",
            vol.Required("entry_id"): cv.string,
            vol.Required("filename"): cv.string,
            vol.Required("data"): cv.string,
        }
    )
    @websocket_api.async_response
    async def upload_vehicle_image(
        hass: HomeAssistant,
        connection: websocket_api.ActiveConnection,
        msg: dict,
    ) -> None:
        """Upload and store a vehicle image."""
        entry = _get_entry(hass, msg["entry_id"])

        raw = msg["data"]

        if "," in raw:
            raw = raw.split(",", 1)[1]

        try:
            data = base64.b64decode(
                raw,
                validate=True,
            )
        except (binascii.Error, ValueError) as err:
            raise HomeAssistantError(
                "Invalid image data"
            ) from err

        if len(data) > 8 * 1024 * 1024:
            raise HomeAssistantError(
                "Image is larger than 8 MB"
            )

        if data.startswith(b"\xff\xd8\xff"):
            ext = ".jpg"

        elif data.startswith(b"\x89PNG\r\n\x1a\n"):
            ext = ".png"

        elif (
            data.startswith(b"RIFF")
            and b"WEBP" in data[:16]
        ):
            ext = ".webp"

        else:
            raise HomeAssistantError(
                "Only JPEG, PNG or WebP images are supported"
            )

        target_dir = Path(
            hass.config.path(
                "www/lakis_solarworld/vehicles"
            )
        )

        target_dir.mkdir(
            parents=True,
            exist_ok=True,
        )

        target = target_dir / f"vehicle{ext}"

        await hass.async_add_executor_job(
            target.write_bytes,
            data,
        )

        cfg = dict(entry.data)

        cfg["vehicle_image"] = (
            f"/local/lakis_solarworld/vehicles/vehicle{ext}"
        )

        await hass.config_entries.async_update_entry(
            entry,
            data=cfg,
        )

        hass.data.setdefault(DOMAIN, {})[
            entry.entry_id
        ] = cfg

        connection.send_result(
            msg["id"],
            {
                "ok": True,
                "url": cfg["vehicle_image"],
            },
        )

    websocket_api.async_register_command(
        hass,
        get_config,
    )

    websocket_api.async_register_command(
        hass,
        save_config,
    )

    websocket_api.async_register_command(
        hass,
        suggest_entities_ws,
    )

    websocket_api.async_register_command(
        hass,
        upload_vehicle_image,
    )


def suggest_entities(hass: HomeAssistant) -> dict:
    """Suggest Home Assistant entities for LAKIS."""
    states = hass.states.async_all()

    out = {
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

        friendly_name = str(
            attributes.get(
                "friendly_name",
                "",
            )
        ).lower()

        text = f"{entity_id} {friendly_name}"

        unit = str(
            attributes.get(
                "unit_of_measurement",
                "",
            )
        ).lower()

        if state.entity_id.startswith("weather."):
            out["weather"].append(
                state.entity_id
            )

        # Only suggest Sigen/Sigenergy entities
        # automatically when the entity clearly
        # belongs to that ecosystem.
        if not any(
            value in text
            for value in (
                "sigen",
                "sigenergy",
            )
        ):
            continue

        if (
            "pv" in text
            and (
                "power" in text
                or unit in ("w", "kw")
            )
        ):
            out["pv_power"].append(
                state.entity_id
            )

        if (
            (
                "load" in text
                or "house" in text
                or "home" in text
            )
            and unit in ("w", "kw")
        ):
            out["house_power"].append(
                state.entity_id
            )

        if (
            "grid" in text
            and unit in ("w", "kw")
        ):
            out["grid_power"].append(
                state.entity_id
            )

        if (
            (
                "battery" in text
                or "ess" in text
            )
            and unit in ("w", "kw")
        ):
            out["battery_power"].append(
                state.entity_id
            )

        if (
            (
                "soc" in text
                or "state of charge" in text
            )
            and unit == "%"
        ):
            out["battery_soc"].append(
                state.entity_id
            )

        if (
            (
                "charger" in text
                or "wallbox" in text
            )
            and unit in ("w", "kw")
        ):
            out["wallbox_power"].append(
                state.entity_id
            )

        if (
            (
                "charger" in text
                or "wallbox" in text
            )
            and unit not in ("w", "kw")
        ):
            out["wallbox_status"].append(
                state.entity_id
            )

    return out