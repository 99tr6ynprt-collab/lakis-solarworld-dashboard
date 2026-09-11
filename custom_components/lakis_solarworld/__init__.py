from __future__ import annotations

import base64
import binascii
from pathlib import Path
from typing import Any

import voluptuous as vol

from homeassistant.components import (
    frontend,
    panel_custom,
    websocket_api,
)
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import config_validation as cv


DOMAIN = "lakis_solarworld"

PLATFORMS: list[str] = []


# ---------------------------------------------------------------------------
# Config entry data
# ---------------------------------------------------------------------------

# These values belong to the installation/license and remain in entry.data.
LICENSE_DATA_KEYS = {
    "license_key",
    "license_id",
    "license_plan",
    "license_lifetime",
    "license_customer",
}


def _get_combined_config(
    entry: ConfigEntry,
) -> dict[str, Any]:
    """Return license data and dashboard options as one configuration."""
    config = dict(entry.data)
    config.update(entry.options)
    return config


# ---------------------------------------------------------------------------
# Integration setup
# ---------------------------------------------------------------------------

async def async_setup(
    hass: HomeAssistant,
    config: dict,
) -> bool:
    """Set up LAKIS SOLARWORLD."""
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

    hass.data.setdefault(DOMAIN, {})[
        entry.entry_id
    ] = _get_combined_config(entry)

    # Register the native Home Assistant sidebar panel.
    if not hass.data[DOMAIN].get("panel_registered"):
        await panel_custom.async_register_panel(
            hass,
            webcomponent_name="lakis-solarworld-panel",
            frontend_url_path="lakis-solarworld",
            module_url=(
                "/api/lakis_solarworld/static/"
                "lakis-dashboard.js"
            ),
            sidebar_title="LAKIS SOLARWORLD",
            sidebar_icon="mdi:solar-power",
            require_admin=False,
            config={
                "entry_id": entry.entry_id,
            },
            config_panel_domain=DOMAIN,
        )

        hass.data[DOMAIN]["panel_registered"] = True
        hass.data[DOMAIN]["panel_entry_id"] = (
            entry.entry_id
        )

    return True


async def async_unload_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
) -> bool:
    """Unload a LAKIS SOLARWORLD config entry."""

    hass.data.get(DOMAIN, {}).pop(
        entry.entry_id,
        None,
    )

    if (
        hass.data.get(DOMAIN, {}).get(
            "panel_entry_id"
        )
        == entry.entry_id
    ):
        frontend.async_remove_panel(
            hass,
            "lakis-solarworld",
        )

        hass.data[DOMAIN].pop(
            "panel_registered",
            None,
        )

        hass.data[DOMAIN].pop(
            "panel_entry_id",
            None,
        )

    return True


# ---------------------------------------------------------------------------
# Config entry migration
# ---------------------------------------------------------------------------

async def async_migrate_entry(
    hass: HomeAssistant,
    config_entry: ConfigEntry,
) -> bool:
    """Migrate an older LAKIS SOLARWORLD config entry."""

    new_data = dict(config_entry.data)
    new_options = dict(config_entry.options)

    # Older LAKIS versions stored dashboard configuration
    # directly in entry.data.
    #
    # New architecture:
    #   entry.data    = license / installation data
    #   entry.options = mutable dashboard configuration

    for key in list(new_data):
        if key in LICENSE_DATA_KEYS:
            continue

        # Do not overwrite an option that already exists.
        new_options.setdefault(
            key,
            new_data[key],
        )

        new_data.pop(key, None)

    # Explicitly preserve the old module configuration.
    if "modules" in config_entry.data:
        new_options.setdefault(
            "modules",
            config_entry.data["modules"],
        )

    # Only update if necessary.
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


# ---------------------------------------------------------------------------
# Config helper
# ---------------------------------------------------------------------------

def _get_entry(
    hass: HomeAssistant,
    entry_id: str,
) -> ConfigEntry:
    """Return and validate a LAKIS config entry."""

    entry = hass.config_entries.async_get_entry(
        entry_id,
    )

    if not entry or entry.domain != DOMAIN:
        raise HomeAssistantError(
            "Invalid LAKIS SOLARWORLD config entry"
        )

    return entry


def _split_config(
    config: dict[str, Any],
) -> tuple[
    dict[str, Any],
    dict[str, Any],
]:
    """Split frontend configuration into data and options."""

    data: dict[str, Any] = {}
    options: dict[str, Any] = {}

    for key, value in config.items():
        if key in LICENSE_DATA_KEYS:
            data[key] = value
        else:
            options[key] = value

    return data, options


# ---------------------------------------------------------------------------
# WebSocket API
# ---------------------------------------------------------------------------

def _register_websocket(
    hass: HomeAssistant,
) -> None:
    """Register LAKIS SOLARWORLD WebSocket commands."""

    # -----------------------------------------------------------------------
    # Get configuration
    # -----------------------------------------------------------------------

    @websocket_api.websocket_command(
        {
            vol.Required("type"): (
                "lakis_solarworld/get_config"
            ),
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

        entry = _get_entry(
            hass,
            msg["entry_id"],
        )

        connection.send_result(
            msg["id"],
            _get_combined_config(entry),
        )

    # -----------------------------------------------------------------------
    # Save configuration
    # -----------------------------------------------------------------------

    @websocket_api.websocket_command(
        {
            vol.Required("type"): (
                "lakis_solarworld/save_config"
            ),
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
        """Save LAKIS dashboard configuration."""

        entry = _get_entry(
            hass,
            msg["entry_id"],
        )

        new_config = dict(
            msg["config"]
        )

        new_data, new_options = _split_config(
            new_config
        )

        # Never remove existing license information.
        merged_data = dict(entry.data)
        merged_data.update(new_data)

        hass.config_entries.async_update_entry(
            entry,
            data=merged_data,
            options=new_options,
        )

        updated_config = _get_combined_config(
            entry
        )

        hass.data.setdefault(DOMAIN, {})[
            entry.entry_id
        ] = updated_config

        connection.send_result(
            msg["id"],
            {
                "ok": True,
                "config": updated_config,
            },
        )

    # -----------------------------------------------------------------------
    # Entity suggestions
    # -----------------------------------------------------------------------

    @websocket_api.websocket_command(
        {
            vol.Required("type"): (
                "lakis_solarworld/suggest_entities"
            ),
        }
    )
    @callback
    def suggest_entities_ws(
        hass: HomeAssistant,
        connection: websocket_api.ActiveConnection,
        msg: dict,
    ) -> None:
        """Return suggested Home Assistant entities."""

        connection.send_result(
            msg["id"],
            suggest_entities(hass),
        )

    # -----------------------------------------------------------------------
    # Vehicle image upload
    # -----------------------------------------------------------------------

    @websocket_api.websocket_command(
        {
            vol.Required("type"): (
                "lakis_solarworld/"
                "upload_vehicle_image"
            ),
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

        entry = _get_entry(
            hass,
            msg["entry_id"],
        )

        raw = msg["data"]

        if "," in raw:
            raw = raw.split(",", 1)[1]

        try:
            data = base64.b64decode(
                raw,
                validate=True,
            )
        except (
            binascii.Error,
            ValueError,
        ) as err:
            raise HomeAssistantError(
                "Invalid image data"
            ) from err

        # Maximum 8 MB.
        if len(data) > 8 * 1024 * 1024:
            raise HomeAssistantError(
                "Image is larger than 8 MB"
            )

        # Detect supported image format.
        if data.startswith(
            b"\xff\xd8\xff"
        ):
            extension = ".jpg"

        elif data.startswith(
            b"\x89PNG\r\n\x1a\n"
        ):
            extension = ".png"

        elif (
            data.startswith(b"RIFF")
            and b"WEBP" in data[:16]
        ):
            extension = ".webp"

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

        target = (
            target_dir
            / f"vehicle{extension}"
        )

        await hass.async_add_executor_job(
            target.write_bytes,
            data,
        )

        image_url = (
            "/local/lakis_solarworld/"
            f"vehicles/vehicle{extension}"
        )

        new_options = dict(
            entry.options
        )

        new_options[
            "vehicle_image"
        ] = image_url

        hass.config_entries.async_update_entry(
            entry,
            options=new_options,
        )

        updated_config = _get_combined_config(
            entry
        )

        hass.data.setdefault(DOMAIN, {})[
            entry.entry_id
        ] = updated_config

        connection.send_result(
            msg["id"],
            {
                "ok": True,
                "url": image_url,
            },
        )

    # Register all WebSocket commands.
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


# ---------------------------------------------------------------------------
# Entity suggestions
# ---------------------------------------------------------------------------

def suggest_entities(
    hass: HomeAssistant,
) -> dict[str, list[str]]:
    """Suggest matching Home Assistant entities."""

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

        friendly_name = str(
            attributes.get(
                "friendly_name",
                "",
            )
        ).lower()

        text = (
            f"{entity_id} "
            f"{friendly_name}"
        )

        unit = str(
            attributes.get(
                "unit_of_measurement",
                "",
            )
        ).lower()

        # Weather entities.
        if state.entity_id.startswith(
            "weather."
        ):
            result["weather"].append(
                state.entity_id
            )

        # Automatic suggestions are intentionally
        # limited to clearly identifiable
        # Sigen / Sigenergy entities.
        if not any(
            value in text
            for value in (
                "sigen",
                "sigenergy",
            )
        ):
            continue

        # PV.
        if (
            "pv" in text
            and (
                "power" in text
                or unit in ("w", "kw")
            )
        ):
            result["pv_power"].append(
                state.entity_id
            )

        # House / load.
        if (
            (
                "load" in text
                or "house" in text
                or "home" in text
            )
            and unit in ("w", "kw")
        ):
            result["house_power"].append(
                state.entity_id
            )

        # Grid.
        if (
            "grid" in text
            and unit in ("w", "kw")
        ):
            result["grid_power"].append(
                state.entity_id
            )

        # Battery power.
        if (
            (
                "battery" in text
                or "ess" in text
            )
            and unit in ("w", "kw")
        ):
            result["battery_power"].append(
                state.entity_id
            )

        # Battery SOC.
        if (
            (
                "soc" in text
                or "state of charge" in text
            )
            and unit == "%"
        ):
            result["battery_soc"].append(
                state.entity_id
            )

        # Wallbox / charger power.
        if (
            (
                "charger" in text
                or "wallbox" in text
            )
            and unit in ("w", "kw")
        ):
            result["wallbox_power"].append(
                state.entity_id
            )

        # Wallbox / charger status.
        if (
            (
                "charger" in text
                or "wallbox" in text
            )
            and unit not in ("w", "kw")
        ):
            result["wallbox_status"].append(
                state.entity_id
            )

    return result