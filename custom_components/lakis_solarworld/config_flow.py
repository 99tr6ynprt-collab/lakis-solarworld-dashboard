from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.config_entries import ConfigEntry

from .license import verify_license


DOMAIN = "lakis_solarworld"

DEFAULT_MODULES = [
    "energy",
    "pv",
    "grid",
    "battery",
]


class LakisConfigFlow(
    config_entries.ConfigFlow,
    domain=DOMAIN,
):
    """Handle the LAKIS SOLARWORLD configuration flow."""

    VERSION = 1

    async def async_step_user(
        self,
        user_input: dict[str, Any] | None = None,
    ):
        """Handle the initial setup step."""

        errors: dict[str, str] = {}

        if user_input is not None:
            license_key = str(
                user_input.get("license_key", "")
            ).strip()

            try:
                license_info = verify_license(
                    license_key
                )
            except ValueError:
                errors["license_key"] = "invalid_license"
            else:
                await self.async_set_unique_id(
                    license_info.license_id
                )

                self._abort_if_unique_id_configured()

                return self.async_create_entry(
                    title="LAKIS SOLARWORLD PRO",
                    data={
                        "license_key": license_key,
                        "license_id": license_info.license_id,
                        "license_plan": "PRO",
                        "license_lifetime": True,
                        "license_customer": license_info.customer,
                        "modules": DEFAULT_MODULES.copy(),
                    },
                )

        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema(
                {
                    vol.Required(
                        "license_key"
                    ): str,
                }
            ),
            errors=errors,
        )

    @staticmethod
    async def async_get_options_flow(
        config_entry: ConfigEntry,
    ):
        """Return the options flow."""
        return LakisOptionsFlow(config_entry)


class LakisOptionsFlow(
    config_entries.OptionsFlow,
):
    """Handle LAKIS SOLARWORLD options."""

    def __init__(
        self,
        config_entry: ConfigEntry,
    ) -> None:
        """Initialize the options flow."""
        self.config_entry = config_entry

    async def async_step_init(
        self,
        user_input: dict[str, Any] | None = None,
    ):
        """Handle options."""

        if user_input is not None:
            data = dict(
                self.config_entry.data
            )

            data.update(user_input)

            self.hass.config_entries.async_update_entry(
                self.config_entry,
                data=data,
            )

            return self.async_create_entry(
                title="",
                data={},
            )

        return self.async_show_form(
            step_id="init",
            data_schema=vol.Schema({}),
        )