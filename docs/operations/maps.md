# Optional place maps

Coordinates and radius are stored in PostgreSQL. Leaflet and all icons are bundled
with Tendly; no hosted map SDK, API key or geocoding service is required. Tiles load
only when the map is opened. OpenStreetMap receives the browser IP, requested tile
area and Tendly origin (no path, account information or place name). No GPS permission
is requested. Coordinates remain editable when tiles are unavailable.

The default follows the [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/):
visible attribution, origin referrer, normal browser caching and no offline prefetch
or bulk downloads. Public tiles have no availability guarantee. Operators with
substantial usage should supply their own provider or self-hosted raster tiles.

To change provider without rebuilding, mount a JSON file into the web container:

```yaml
services:
  web:
    volumes:
      - ./map-config.json:/usr/share/nginx/html/map-config.json:ro
```

Use the shape of `apps/web/public/map-config.json`: `tileUrl` is a raster XYZ URL
with `{z}`, `{x}` and `{y}` placeholders; `attribution` is plain text,
`attributionUrl` is an optional HTTPS copyright link, and `maxZoom` is the provider's
maximum (2–22). Use HTTPS on HTTPS deployments, or a same-origin tile path. Never
put private credentials in public configuration. Honor your provider's terms.
Reload the page after changes.

Implementation uses the [Leaflet 1.9.4 API](https://leafletjs.com/reference).
When upgrading Lucide, run `node scripts/generate-icons.mjs`, then `pnpm api:generate`
to synchronize the server icon allowlist and contracts. Preserve existing icon IDs.
