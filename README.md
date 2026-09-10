# LAKIS SOLARWORLD Dashboard – HACS

**LAKIS SOLARWORLD Pro – Lifetime** ist ein modularer, herstellerneutraler Home-Assistant-Energie-Dashboard-Client.

## Lizenzmodell

LAKIS wird über einen signierten Pro-Lizenzschlüssel freigeschaltet.

- lebenslange Lizenz
- alle Module und Funktionen inklusive
- keine jährliche Verlängerung
- keine Modulbeschränkung
- Lizenzierung dient ausschließlich der Freischaltung für autorisierte/bevorzugte LAKIS-SOLARWORLD-Kunden

Der öffentliche Code enthält nur den öffentlichen Prüfschlüssel. Der private Signaturschlüssel gehört ausschließlich zum internen LAKIS Key Generator.

## Installation über HACS

HACS benötigt für veröffentlichte Integrationen ein **öffentliches GitHub-Repository**. Alle für die Integration erforderlichen Dateien liegen im `custom_components/lakis_solarworld/`-Verzeichnis.

Nach Veröffentlichung:

1. HACS öffnen.
2. `LAKIS SOLARWORLD Dashboard` installieren.
3. Home Assistant neu starten.
4. **Einstellungen → Geräte & Dienste → Integration hinzufügen → LAKIS SOLARWORLD Dashboard**.
5. Pro-Lizenzschlüssel eingeben.
6. Module und vorhandene Home-Assistant-Entities auswählen.
7. Das LAKIS-Dashboard erscheint als eigene Sidebar-Seite.

Die Integration registriert ihr Frontend selbst; es ist keine manuelle `/local/...js`-Ressource für den Sidebar-Panel-Betrieb erforderlich.

## Unterstützte logische Datenpunkte

LAKIS arbeitet intern herstellerneutral mit:

- PV-Leistung
- Haus-/Lastleistung
- Netzleistung (positiv = Bezug, negativ = Einspeisung)
- Batterieleistung (positiv = Laden, negativ = Entladen)
- Batterie-SOC
- Wallbox-Leistung/Status
- Fahrzeug-SOC/Status
- Wärmepumpe
- beliebige Klimageräte
- `weather.*` für Wetterdaten

Entity-Vorschläge werden nur aus tatsächlich vorhandenen Home-Assistant-Entities erzeugt. Es werden keine SigenStor-Entity-IDs erfunden.

## Energiefluss

Die Anzeige ist **Visualisierung, keine Energieregelung**. Sie verwendet die Messwerte aus Home Assistant.

- 🟢 grün = PV/erneuerbare Energie
- 🔴 rot = Netzbezug
- 🔵 blau = Batterieleistung
- ⚪ grau = kein relevanter Fluss

Die Anzeige berücksichtigt PV → Haus, PV-Überschuss → Batterie/Wallbox, Batterie → Haus sowie Netzbezug/Einspeisung.

## Interner Key Generator

Der Key Generator befindet sich bewusst **nicht** im HACS-Repository.

Er erzeugt kryptografisch signierte `LAKIS SOLARWORLD PRO – Lifetime`-Schlüssel. Der private Schlüssel darf niemals veröffentlicht oder an Kunden weitergegeben werden.

## Hinweis zum HACS-Release

Vor einer Veröffentlichung im HACS-Store müssen GitHub-Repository, Home-Assistant-Brands und die automatischen Hassfest/HACS-Prüfungen eingerichtet und erfolgreich durchlaufen werden. HACS verlangt unter anderem ein öffentliches GitHub-Repository und für Integrationen die Einhaltung der Integrationsstruktur.
