from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.config_entries import ConfigEntry, ConfigFlowResult
from homeassistant.helpers.selector import (
    EntitySelector,
    EntitySelectorConfig,
    SelectSelector,
    SelectSelectorConfig,
    SelectSelectorMode,
)

from .license import verify_license


DOMAIN = "lakis_solarworld"

MODULES = [
    "energy",
    "pv",
    "grid",
    "battery",
    "wallbox",
    "vehicle",
    "heatpump",
    "climate",
]

ORDER = [
    "energy",
    "pv",
    "grid",
    "battery",
    "wallbox",
    "vehicle",
    "heatpump",
    "climate",
]


def entity_selector(
    domain: str | None = None,
    multiple: bool = False,
) -> EntitySelector:
    """Create a Home Assistant entity selector."""
    if domain is None:
        return EntitySelector(
            EntitySelectorConfig(
                multiple=multiple,
            )
        )

    return EntitySelector(
        EntitySelectorConfig(
            domain=domain,
            multiple=multiple,
        )
    )


class LakisConfigFlow(
    config_entries.ConfigFlow,
    domain=DOMAIN,
):
    """Handle the LAKIS SOLARWORLD configuration flow."""

    VERSION = 3

    def __init__(self) -> None:
        """Initialize the configuration flow."""
        self._data: dict[str, Any] = {}
        self._license = None

    async def async_step_user(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> ConfigFlowResult:
        """Handle the initial setup step."""

        errors: dict[str, str] = {}

        if user_input is not None:
            license_key = user_input["license_key"].strip()

            try:
                license_info = verify_license(license_key)

            except ValueError:
                errors["license_key"] = "invalid_license"

            else:
                await self.async_set_unique_id(
                    license_info.license_id
                )

                self._abort_if_unique_id_configured()

                self._license = license_info

                self._data = {
                    "license_key": license_key,
                    "license_id": license_info.license_id,
                    "license_plan": "PRO",
                    "license_lifetime": True,
                    "license_customer": license_info.customer,
                    "modules": list(user_input["modules"]),
                }

                return await self._next_module("energy")

        schema = vol.Schema(
            {
                vol.Required("license_key"): str,
                vol.Required(
                    "modules",
                    default=[
                        "energy",
                        "pv",
                        "grid",
                        "battery",
                    ],
                ): SelectSelector(
                    SelectSelectorConfig(
                        options=MODULES,
                        multiple=True,
                        mode=SelectSelectorMode.LIST,
                    )
                ),
            }
        )

        return self.async_show_form(
            step_id="user",
            data_schema=schema,
            errors=errors,
        )

    async def _next_module(
        self,
        current_module: str,
    ) -> ConfigFlowResult:
        """Open the next enabled module."""
        try:
            current_index = ORDER.index(current_module)
        except ValueError:
            return self.async_create_entry(
                title="LAKIS SOLARWORLD PRO",
                data=self._data,
            )

        for next_module in ORDER[current_index:]:
            if next_module in self._data.get(
                "modules",
                [],
            ):
                return await getattr(
                    self,
                    f"async_step_{next_module}",
                )()

        return self.async_create_entry(
            title="LAKIS SOLARWORLD PRO",
            data=self._data,
        )

    async def _conditional_step(
        self,
        step_name: str,
        schema: vol.Schema,
        user_input: dict[str, Any] | None,
    ) -> ConfigFlowResult:
        """Handle a conditional module step."""

        if user_input is None:
            return self.async_show_form(
                step_id=step_name,
                data_schema=schema,
            )

        self._data.update(user_input)

        try:
            current_index = ORDER.index(step_name)
        except ValueError:
            return self.async_create_entry(
                title="LAKIS SOLARWORLD PRO",
                data=self._data,
            )

        for next_module in ORDER[current_index + 1 :]:
            if next_module in self._data.get(
                "modules",
                [],
            ):
                return await getattr(
                    self,
                    f"async_step_{next_module}",
                )()

        return self.async_create_entry(
            title="LAKIS SOLARWORLD PRO",
            data=self._data,
        )

    async def async_step_energy(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> ConfigFlowResult:
        """Configure the energy / house module."""

        schema = vol.Schema(
            {
                vol.Optional(
                    "energy_power"
                ): entity_selector(),
                vol.Optional(
                    "house_power"
                ): entity_selector(),
            }
        )

        return await self._conditional_step(
            "energy",
            schema,
            user_input,
        )

    async def async_step_pv(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> ConfigFlowResult:
        """Configure the PV module."""

        schema = vol.Schema(
            {
                vol.Optional(
                    "pv_power"
                ): entity_selector(),
            }
        )

        return await self._conditional_step(
            "pv",
            schema,
            user_input,
        )

    async def async_step_grid(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> ConfigFlowResult:
        """Configure the grid module."""

        schema = vol.Schema(
            {
                vol.Optional(
                    "grid_power"
                ): entity_selector(),
            }
        )

        return await self._conditional_step(
            "grid",
            schema,
            user_input,
        )

    async def async_step_battery(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> ConfigFlowResult:
        """Configure the battery module."""

        schema = vol.Schema(
            {
                vol.Optional(
                    "battery_soc"
                ): entity_selector(),
                vol.Optional(
                    "battery_power"
                ): entity_selector(),
                vol.Optional(
                    "battery_capacity_kwh",
                    default=10.0,
                ): vol.All(
                    vol.Coerce(float),
                    vol.Range(
                        min=0.1,
                    ),
                ),
                vol.Optional(
                    "battery_target_soc",
                    default=80,
                ): vol.All(
                    vol.Coerce(int),
                    vol.Range(
                        min=1,
                        max=100,
                    ),
                ),
            }
        )

        return await self._conditional_step(
            "battery",
            schema,
            user_input,
        )

    async def async_step_wallbox(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> ConfigFlowResult:
        """Configure the wallbox module."""

        schema = vol.Schema(
            {
                vol.Optional(
                    "wallbox_power"
                ): entity_selector(),
                vol.Optional(
                    "wallbox_status"
                ): entity_selector(),
                vol.Optional(
                    "wallbox_start_service",
                    default="",
                ): str,
                vol.Optional(
                    "wallbox_stop_service",
                    default="",
                ): str,
            }
        )

        return await self._conditional_step(
            "wallbox",
            schema,
            user_input,
        )

    async def async_step_vehicle(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> ConfigFlowResult:
        """Configure the vehicle module."""

        schema = vol.Schema(
            {
                vol.Optional(
                    "vehicle_name",
                    default="Fahrzeug",
                ): str,
                vol.Optional(
                    "vehicle_soc"
                ): entity_selector(),
                vol.Optional(
                    "vehicle_target_soc",
                    default=80,
                ): vol.All(
                    vol.Coerce(int),
                    vol.Range(
                        min=1,
                        max=100,
                    ),
                ),
                vol.Optional(
                    "vehicle_status"
                ): entity_selector(),
            }
        )

        return await self._conditional_step(
            "vehicle",
            schema,
            user_input,
        )

    async def async_step_heatpump(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> ConfigFlowResult:
        """Configure the heat pump module."""

        schema = vol.Schema(
            {
                vol.Optional(
                    "heatpump_entity"
                ): entity_selector(
                    domain="climate",
                ),
                vol.Optional(
                    "heatpump_power"
                ): entity_selector(),
                vol.Optional(
                    "heatpump_flow_temp"
                ): entity_selector(),
                vol.Optional(
                    "heatpump_return_temp"
                ): entity_selector(),
                vol.Optional(
                    "heatpump_outdoor_temp"
                ): entity_selector(),
                vol.Optional(
                    "heatpump_dhw_temp"
                ): entity_selector(),
            }
        )

        return await self._conditional_step(
            "heatpump",
            schema,
            user_input,
        )

    async def async_step_climate(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> ConfigFlowResult:
        """Configure the climate module."""

        schema = vol.Schema(
            {
                vol.Optional(
                    "climate_entities"
                ): entity_selector(
                    domain="climate",
                    multiple=True,
                ),
            }
        )

        return await self._conditional_step(
            "climate",
            schema,
            user_input,
        )

    @staticmethod
    async def async_get_options_flow(
        config_entry: ConfigEntry,
    ) -> config_entries.OptionsFlow:
        """Return the LAKIS options flow."""
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
    ) -> ConfigFlowResult:
        """Handle module configuration."""

        current_modules = self.config_entry.data.get(
            "modules",
            [
                "energy",
                "pv",
                "grid",
                "battery",
            ],
        )

        if user_input is not None:
            merged = dict(
                self.config_entry.data
            )

            merged["modules"] = list(
                user_input["modules"]
            )

            self.hass.config_entries.async_update_entry(
                self.config_entry,
                data=merged,
            )

            return self.async_create_entry(
                title="",
                data={},
            )

        schema = vol.Schema(
            {
                vol.Required(
                    "modules",
                    default=current_modules,
                ): SelectSelector(
                    SelectSelectorConfig(
                        options=MODULES,
                        multiple=True,
                        mode=SelectSelectorMode.LIST,
                    )
                )
            }
        )

        return self.async_show_form(
            step_id="init",
            data_schema=schema,
        )