from __future__ import annotations

from copy import deepcopy
from typing import Any

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.config_entries import (
    ConfigEntry,
    ConfigFlowResult,
    OptionsFlowWithReload,
)
from homeassistant.core import callback
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

DEFAULT_MODULES = [
    "energy",
    "pv",
    "grid",
    "battery",
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
    """Create an entity selector."""
    if domain is None:
        return EntitySelector(
            EntitySelectorConfig(multiple=multiple)
        )

    return EntitySelector(
        EntitySelectorConfig(
            domain=domain,
            multiple=multiple,
        )
    )


def module_selector(default: list[str]) -> SelectSelector:
    """Create the module selector."""
    return SelectSelector(
        SelectSelectorConfig(
            options=MODULES,
            multiple=True,
            mode=SelectSelectorMode.LIST,
        )
    )


class LakisConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle the LAKIS SOLARWORLD configuration flow."""

    VERSION = 3

    async def async_step_user(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> ConfigFlowResult:
        """Set up LAKIS SOLARWORLD."""
        errors: dict[str, str] = {}

        if user_input is not None:
            try:
                info = verify_license(
                    user_input["license_key"].strip()
                )
            except ValueError:
                errors["license_key"] = "invalid_license"
            else:
                await self.async_set_unique_id(info.license_id)
                self._abort_if_unique_id_configured()

                data = {
                    "license_key": user_input["license_key"].strip(),
                    "license_id": info.license_id,
                    "license_plan": "PRO",
                    "license_lifetime": True,
                    "license_customer": info.customer,
                    "modules": list(DEFAULT_MODULES),
                }

                return self.async_create_entry(
                    title="LAKIS SOLARWORLD PRO",
                    data=data,
                )

        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema(
                {
                    vol.Required("license_key"): str,
                }
            ),
            errors=errors,
        )

    @staticmethod
    @callback
    def async_get_options_flow(
        config_entry: ConfigEntry,
    ) -> LakisOptionsFlow:
        """Return the LAKIS SOLARWORLD options flow."""
        return LakisOptionsFlow()


class LakisOptionsFlow(OptionsFlowWithReload):
    """Handle LAKIS SOLARWORLD options."""

    def __init__(self) -> None:
        """Initialize the options flow."""
        self._data: dict[str, Any] = {}

    async def async_step_init(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> ConfigFlowResult:
        """Select the active modules."""
        if not self._data:
            self._data = deepcopy(dict(self.config_entry.options))

        current_modules = list(
            self._data.get(
                "modules",
                self.config_entry.data.get(
                    "modules",
                    DEFAULT_MODULES,
                ),
            )
        )

        if user_input is not None:
            self._data["modules"] = list(
                user_input["modules"]
            )

            # Remove settings belonging to modules
            # that have been disabled.
            active = set(self._data["modules"])

            module_fields = {
                "energy": (
                    "energy_power",
                    "house_power",
                ),
                "pv": (
                    "pv_power",
                ),
                "grid": (
                    "grid_power",
                ),
                "battery": (
                    "battery_soc",
                    "battery_power",
                    "battery_capacity_kwh",
                    "battery_target_soc",
                ),
                "wallbox": (
                    "wallbox_power",
                    "wallbox_status",
                    "wallbox_start_service",
                    "wallbox_stop_service",
                ),
                "vehicle": (
                    "vehicle_name",
                    "vehicle_soc",
                    "vehicle_target_soc",
                    "vehicle_status",
                ),
                "heatpump": (
                    "heatpump_entity",
                    "heatpump_power",
                    "heatpump_flow_temp",
                    "heatpump_return_temp",
                    "heatpump_outdoor_temp",
                    "heatpump_dhw_temp",
                ),
                "climate": (
                    "climate_entities",
                ),
            }

            for module, fields in module_fields.items():
                if module not in active:
                    for field in fields:
                        self._data.pop(field, None)

            return await self._next_step("energy")

        schema = vol.Schema(
            {
                vol.Required(
                    "modules",
                    default=current_modules,
                ): module_selector(current_modules),
            }
        )

        return self.async_show_form(
            step_id="init",
            data_schema=schema,
        )

    async def _next_step(
        self,
        current_module: str,
    ) -> ConfigFlowResult:
        """Continue with the next enabled module."""
        try:
            index = ORDER.index(current_module)
        except ValueError:
            index = -1

        active = set(
            self._data.get("modules", DEFAULT_MODULES)
        )

        for module in ORDER[index + 1 :]:
            if module in active:
                return await getattr(
                    self,
                    f"async_step_{module}",
                )()

        return self.async_create_entry(
            title="",
            data=self._data,
        )

    async def _module_step(
        self,
        module: str,
        schema: vol.Schema,
        user_input: dict[str, Any] | None,
    ) -> ConfigFlowResult:
        """Handle a module-specific step."""
        if user_input is not None:
            self._data.update(user_input)
            return await self._next_step(module)

        return self.async_show_form(
            step_id=module,
            data_schema=schema,
        )

    async def async_step_energy(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> ConfigFlowResult:
        """Configure energy / house."""
        return await self._module_step(
            "energy",
            vol.Schema(
                {
                    vol.Optional("energy_power"): entity_selector(),
                    vol.Optional("house_power"): entity_selector(),
                }
            ),
            user_input,
        )

    async def async_step_pv(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> ConfigFlowResult:
        """Configure PV."""
        return await self._module_step(
            "pv",
            vol.Schema(
                {
                    vol.Optional("pv_power"): entity_selector(),
                }
            ),
            user_input,
        )

    async def async_step_grid(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> ConfigFlowResult:
        """Configure grid."""
        return await self._module_step(
            "grid",
            vol.Schema(
                {
                    vol.Optional("grid_power"): entity_selector(),
                }
            ),
            user_input,
        )

    async def async_step_battery(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> ConfigFlowResult:
        """Configure battery."""
        return await self._module_step(
            "battery",
            vol.Schema(
                {
                    vol.Optional("battery_soc"): entity_selector(),
                    vol.Optional("battery_power"): entity_selector(),
                    vol.Optional(
                        "battery_capacity_kwh",
                        default=10.0,
                    ): vol.Coerce(float),
                    vol.Optional(
                        "battery_target_soc",
                        default=80,
                    ): vol.All(
                        vol.Coerce(int),
                        vol.Range(min=1, max=100),
                    ),
                }
            ),
            user_input,
        )

    async def async_step_wallbox(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> ConfigFlowResult:
        """Configure wallbox."""
        return await self._module_step(
            "wallbox",
            vol.Schema(
                {
                    vol.Optional("wallbox_power"): entity_selector(),
                    vol.Optional("wallbox_status"): entity_selector(),
                    vol.Optional(
                        "wallbox_start_service"
                    ): str,
                    vol.Optional(
                        "wallbox_stop_service"
                    ): str,
                }
            ),
            user_input,
        )

    async def async_step_vehicle(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> ConfigFlowResult:
        """Configure vehicle."""
        return await self._module_step(
            "vehicle",
            vol.Schema(
                {
                    vol.Optional(
                        "vehicle_name",
                        default="Fahrzeug",
                    ): str,
                    vol.Optional("vehicle_soc"): entity_selector(),
                    vol.Optional(
                        "vehicle_target_soc",
                        default=80,
                    ): vol.All(
                        vol.Coerce(int),
                        vol.Range(min=1, max=100),
                    ),
                    vol.Optional(
                        "vehicle_status"
                    ): entity_selector(),
                }
            ),
            user_input,
        )

    async def async_step_heatpump(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> ConfigFlowResult:
        """Configure heat pump."""
        return await self._module_step(
            "heatpump",
            vol.Schema(
                {
                    vol.Optional(
                        "heatpump_entity"
                    ): entity_selector(
                        domain="climate"
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
            ),
            user_input,
        )

    async def async_step_climate(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> ConfigFlowResult:
        """Configure climate devices."""
        return await self._module_step(
            "climate",
            vol.Schema(
                {
                    vol.Optional(
                        "climate_entities"
                    ): entity_selector(
                        domain="climate",
                        multiple=True,
                    ),
                }
            ),
            user_input,
        )