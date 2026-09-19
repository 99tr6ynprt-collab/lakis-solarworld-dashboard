# LAKIS SOLARWORLD Entwicklung – Testintegration

Diese Integration ist aus dem stabilen Referenzstand 1.5.9 abgeleitet.

## Zweck

- Produktion bleibt `lakis_solarworld` / `LAKIS SOLARWORLD`.
- Entwicklung läuft separat als `lakis_solarworld_development` / `LAKIS SOLARWORLD Entwicklung`.
- Die Testintegration verwendet eigene WebSocket-Befehle, einen eigenen Static-Pfad,
  ein eigenes Custom Element und eigene `/config/www`-Pfade.
- Änderungen an Testbildern überschreiben damit keine Produktionsbilder.

## GitHub

Diese Dateien gehören in den Entwicklungszweig (`development`) des Projekts:

`custom_components/lakis_solarworld_development/`

Der bestehende `main`-Stand wird nicht verändert.

## Home Assistant

Die Testintegration kann parallel zur Produktion installiert werden, weil ihr
Manifest-Domainname und ihre internen Ressourcen getrennt sind.

Nach dem Kopieren nach:

`/config/custom_components/lakis_solarworld_development/`

Home Assistant neu starten und anschließend die Integration über
**Einstellungen → Geräte & Dienste → Integration hinzufügen** hinzufügen.

Die Lizenzprüfung bleibt produktseitig identisch; die Config-Entry-Domain ist
jedoch separat, sodass die Testintegration die Produktionsintegration nicht
überschreibt.

## Freigabeprozess

`main` = Produktion / stabil

`development` = Test / Entwicklung

Erst nach erfolgreichem Test wird eine Änderung von `development` nach `main`
übernommen.
