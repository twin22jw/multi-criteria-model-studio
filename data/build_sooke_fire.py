"""Build the static Sooke Lake teaching grid from public geography and elevation APIs.

Run with Python 3. The generated JSON is committed so the activity works offline.
"""
import json
import math
import urllib.parse
import urllib.request
import concurrent.futures
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
COLS, ROWS = 21, 21
WEST, EAST, SOUTH, NORTH = -123.765, -123.635, 48.490, 48.620
LAKE_URL = ("https://mapservices.crd.bc.ca/arcgis/rest/services/Root/"
            "WaterFeaturesDrainage/MapServer/7/query?where=OBJECTID%3D4053"
            "&outFields=OBJECTID,Name&returnGeometry=true&outSR=4326&f=geojson")
ELEVATION_URL = "https://geogratis.gc.ca/services/elevation/cdem/altitude"


def get_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "GEOG328 teaching data builder"})
    with urllib.request.urlopen(req, timeout=45) as response:
        return json.load(response)


def point_in_ring(x, y, ring):
    inside = False
    j = len(ring) - 1
    for i, (xi, yi) in enumerate(ring):
        xj, yj = ring[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def simplify(points, tolerance=0.00017):
    if len(points) < 3:
        return points
    a, b = points[0], points[-1]
    dx, dy = b[0] - a[0], b[1] - a[1]
    scale = dx * dx + dy * dy
    distances = []
    for p in points[1:-1]:
        t = max(0, min(1, ((p[0]-a[0])*dx + (p[1]-a[1])*dy) / scale)) if scale else 0
        distances.append(math.hypot(p[0] - a[0] - t*dx, p[1] - a[1] - t*dy))
    largest = max(distances, default=0)
    if largest <= tolerance:
        return [a, b]
    middle = distances.index(largest) + 1
    return simplify(points[:middle+1], tolerance)[:-1] + simplify(points[middle:], tolerance)


def main():
    geometry = get_json(LAKE_URL)["features"][0]["geometry"]
    polygons = geometry["coordinates"] if geometry["type"] == "MultiPolygon" else [geometry["coordinates"]]
    rings = [ring for polygon in polygons for ring in polygon]
    coords = [((SOUTH + (ROWS - 1 - r) * (NORTH-SOUTH) / (ROWS-1)),
               (WEST + c * (EAST-WEST) / (COLS-1))) for r in range(ROWS) for c in range(COLS)]
    def elevation(coord):
        lat, lon = coord
        url = ELEVATION_URL + "?" + urllib.parse.urlencode({"lat": f"{lat:.6f}", "lon": f"{lon:.6f}"})
        for attempt in range(4):
            try:
                return get_json(url)["altitude"]
            except Exception:
                if attempt == 3:
                    raise
                time.sleep(attempt + 1)
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        elevations = list(pool.map(elevation, coords))
    lake = [any(point_in_ring(lon, lat, ring) for ring in rings) for lat, lon in coords]
    # Retain enough shoreline detail to draw the reservoir at classroom scale.
    shore = [simplify(ring) for ring in rings if len(ring) >= 4]
    result = {
        "title": "Sooke Lake Reservoir study area",
        "bounds": [WEST, SOUTH, EAST, NORTH],
        "cols": COLS, "rows": ROWS,
        "elevation_m": elevations,
        "lake": lake,
        "shoreline": shore,
        "sources": {
            "lake": LAKE_URL,
            "elevation": "https://geogratis.gc.ca/site/eng/elevation",
            "elevation_dataset": "Canadian Digital Elevation Model point samples via NRCan elevation API",
        },
    }
    (HERE / "sooke-fire-grid.json").write_text(json.dumps(result, separators=(",", ":")), encoding="utf-8")
    print("Lake cells:", sum(lake), "Elevation range:", min(elevations), max(elevations))


if __name__ == "__main__":
    main()

