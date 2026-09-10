from __future__ import annotations

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.helpers.selector import EntitySelector, EntitySelectorConfig, SelectSelector, SelectSelectorConfig

from .license import verify_license

DOMAIN = "lakis_solarworld"
MODULES = ["energy", "pv", "grid", "battery", "wallbox", "vehicle", "heatpump", "climate"]
ORDER = ["energy", "pv", "grid", "battery", "wallbox", "vehicle", "heatpump", "climate"]

def ent(domain=None, multiple=False):
    return EntitySelector(EntitySelectorConfig(domain=domain, multiple=multiple))

class LakisConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 2

    def __init__(self):
        self._data = {}
        self._license = None

    async def async_step_user(self, user_input=None):
        errors = {}
        if user_input:
            try:
                info = verify_license(user_input["license_key"].strip())
            except ValueError:
                errors["license_key"] = "invalid_license"
            else:
                await self.async_set_unique_id(info.license_id)
                self._abort_if_unique_id_configured()
                self._license = info
                self._data = {
                    "license_key": user_input["license_key"].strip(),
                    "license_id": info.license_id,
                    "license_plan": "PRO",
                    "license_lifetime": True,
                    "license_customer": info.customer,
                    "modules": list(user_input["modules"]),
                }
                return await self._next("energy")
        return self.async_show_form("user", vol.Schema({
            vol.Required("license_key"): str,
            vol.Required("modules", default=["energy", "pv", "grid", "battery"]):
                SelectSelector(SelectSelectorConfig(options=MODULES, multiple=True, mode="list"))
        }), errors=errors)

    async def _next(self, module):
        idx = ORDER.index(module)
        for nxt in ORDER[idx:]:
            if nxt in self._data["modules"]:
                return await getattr(self, f"async_step_{nxt}")()
        return self.async_create_entry(title="LAKIS SOLARWORLD PRO", data=self._data)

    async def _conditional(self, name, schema, user_input):
        if user_input is None:
            return self.async_show_form(step_id=name, data_schema=schema)
        self._data.update(user_input)
        idx = ORDER.index(name)
        for nxt in ORDER[idx + 1:]:
            if nxt in self._data["modules"]:
                return await getattr(self, f"async_step_{nxt}")()
        return self.async_create_entry(title="LAKIS SOLARWORLD PRO", data=self._data)

    async def async_step_energy(self, user_input=None):
        return await self._conditional("energy", vol.Schema({vol.Optional("energy_power"): ent(), vol.Optional("house_power"): ent()}), user_input)

    async def async_step_pv(self, user_input=None):
        return await self._conditional("pv", vol.Schema({vol.Optional("pv_power"): ent()}), user_input)

    async def async_step_grid(self, user_input=None):
        return await self._conditional("grid", vol.Schema({vol.Optional("grid_power"): ent()}), user_input)

    async def async_step_battery(self, user_input=None):
        return await self._conditional("battery", vol.Schema({
            vol.Optional("battery_soc"): ent(), vol.Optional("battery_power"): ent(),
            vol.Optional("battery_capacity_kwh", default=10.0): vol.Coerce(float),
            vol.Optional("battery_target_soc", default=80): vol.All(vol.Coerce(int), vol.Range(min=1, max=100))
        }), user_input)

    async def async_step_wallbox(self, user_input=None):
        return await self._conditional("wallbox", vol.Schema({
            vol.Optional("wallbox_power"): ent(), vol.Optional("wallbox_status"): ent(),
            vol.Optional("wallbox_start_service"): str, vol.Optional("wallbox_stop_service"): str
        }), user_input)

    async def async_step_vehicle(self, user_input=None):
        return await self._conditional("vehicle", vol.Schema({
            vol.Optional("vehicle_name", default="Fahrzeug"): str,
            vol.Optional("vehicle_soc"): ent(), vol.Optional("vehicle_target_soc", default=80): vol.All(vol.Coerce(int), vol.Range(min=1, max=100)),
            vol.Optional("vehicle_status"): ent()
        }), user_input)

    async def async_step_heatpump(self, user_input=None):
        return await self._conditional("heatpump", vol.Schema({
            vol.Optional("heatpump_entity"): ent(domain="climate"), vol.Optional("heatpump_power"): ent(),
            vol.Optional("heatpump_flow_temp"): ent(), vol.Optional("heatpump_return_temp"): ent(),
            vol.Optional("heatpump_outdoor_temp"): ent(), vol.Optional("heatpump_dhw_temp"): ent()
        }), user_input)

    async def async_step_climate(self, user_input=None):
        return await self._conditional("climate", vol.Schema({vol.Optional("climate_entities"): ent(domain="climate", multiple=True)}), user_input)

    @staticmethod
    async def async_get_options_flow(config_entry):
        return LakisOptionsFlow(config_entry)

class LakisOptionsFlow(config_entries.OptionsFlow):
    def __init__(self, config_entry):
        self.config_entry = config_entry

    async def async_step_init(self, user_input=None):
        current = self.config_entry.data
        if user_input is not None:
            merged = dict(current)
            merged["modules"] = list(user_input["modules"])
            self.hass.config_entries.async_update_entry(self.config_entry, data=merged)
            return self.async_create_entry(title="", data={})
        return self.async_show_form("init", data_schema=vol.Schema({
            vol.Required("modules", default=current.get("modules", ["energy", "pv", "grid", "battery"])):
                SelectSelector(SelectSelectorConfig(options=MODULES, multiple=True, mode="list"))
        }))
