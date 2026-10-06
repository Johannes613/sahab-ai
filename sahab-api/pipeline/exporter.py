"""Map rasters (PNG overlays) and the standalone HTML map for a finished run."""
import os

import numpy as np
from matplotlib import colormaps
from matplotlib.image import imsave

from pipeline.classifier import CLASS_NAMES

CLASS_COLORS = ['#2196F3', '#4CAF50', '#8BC34A', '#212121', '#BDBDBD', '#F5F5F5', '#E0B07A']
ACTION_COLORS = {'tree_planting': '#22c55e', 'cool_roofs': '#f59e0b', 'both': '#3b82f6', 'none': '#9ca3af'}
ACTION_TEXT = {'tree_planting': 'Tree planting', 'cool_roofs': 'Cool roofs',
               'both': 'Tree planting + Cool roofs', 'none': 'No action'}


def _hex_rgb(h):
    h = h.lstrip('#')
    return [int(h[i:i + 2], 16) for i in (0, 2, 4)]


def _rgba(values, cmap_name, vmin, vmax, alpha=0.85):
    """Colour a float raster; NaN becomes fully transparent."""
    v = np.clip((values - vmin) / max(vmax - vmin, 1e-9), 0, 1)
    rgba = colormaps[cmap_name](v)
    rgba[..., 3] = np.where(np.isfinite(values), alpha, 0.0)
    return rgba


def material_rgba(material_map):
    out = np.zeros(material_map.shape + (4,), dtype='float32')
    for cid, color in enumerate(CLASS_COLORS):
        m = material_map == cid
        out[m, :3] = np.array(_hex_rgb(color)) / 255.0
        out[m, 3] = 0.85
    return out


def block_to_pixels(block_arr, bsz, shape):
    """Upsample a (nR, nC) block raster to pixel resolution, NaN-padded to `shape`."""
    up = np.repeat(np.repeat(block_arr, bsz, axis=0), bsz, axis=1).astype('float32')
    out = np.full(shape, np.nan, dtype='float32')
    h, w = min(shape[0], up.shape[0]), min(shape[1], up.shape[1])
    out[:h, :w] = up[:h, :w]
    return out


def export_layers(run_dir: str, material_map, temperature, risk_px, change) -> dict[str, np.ndarray]:
    """Writes the four overlay PNGs and returns their RGBA arrays keyed like the API response."""
    os.makedirs(run_dir, exist_ok=True)
    layers = {'material_map': material_rgba(material_map)}
    finite = temperature[np.isfinite(temperature)]
    lo, hi = (np.percentile(finite, 2), np.percentile(finite, 98)) if finite.size else (30, 60)
    layers['temperature_map'] = _rgba(temperature, 'inferno', lo, hi)
    layers['risk_map'] = _rgba(risk_px, 'YlOrRd', 0.0, 1.0)
    if change is not None:
        layers['change_map'] = _rgba(change, 'RdBu_r', -0.5, 0.5)
    for name, rgba in layers.items():
        imsave(os.path.join(run_dir, f'{name}.png'), rgba)
    return layers


def export_html_map(path: str, city: str, bbox, blocks: list[dict], layers: dict[str, np.ndarray],
                    sources: dict, max_blocks: int = 400):
    """Single-file Leaflet map (Folium). Overlays are embedded in the file; the base map tiles
    still need an internet connection."""
    import folium
    from folium.raster_layers import ImageOverlay

    bounds = [[bbox[1], bbox[0]], [bbox[3], bbox[2]]]
    m = folium.Map(location=[(bbox[1] + bbox[3]) / 2, (bbox[0] + bbox[2]) / 2], zoom_start=12,
                   tiles='OpenStreetMap')
    titles = {'risk_map': 'Risk score', 'material_map': 'Surface materials',
              'temperature_map': 'Surface temperature', 'change_map': 'Urban expansion (change)'}
    for key, rgba in layers.items():
        ImageOverlay(image=rgba, bounds=bounds, opacity=0.6, name=titles.get(key, key),
                     show=(key == 'risk_map')).add_to(m)

    group = folium.FeatureGroup(name='Priority blocks', show=True)
    for b in blocks[:max_blocks]:
        if b['action_key'] == 'none':
            continue
        color = ACTION_COLORS[b['action_key']]
        popup = (f"<b>Rank {b['rank']}</b><br>Risk score: {b['risk_score']}<br>"
                 f"Action: {ACTION_TEXT[b['action_key']]}<br>"
                 f"Est. cooling: {b['est_cooling_c']} ± {b['cooling_ci_c']} °C<br>"
                 f"Dominant material: {b['dominant_material']}<br>"
                 f"Vegetation: {b['materials']['vegetation']:.0%} · Asphalt: {b['materials']['asphalt']:.0%}<br>"
                 f"{b['lat']}, {b['lon']}")
        folium.CircleMarker([b['lat'], b['lon']], radius=5 + b['risk_score'] * 12, color=color,
                            fill=True, fill_color=color, fill_opacity=0.75,
                            popup=folium.Popup(popup, max_width=260)).add_to(group)
    group.add_to(m)
    folium.LayerControl(collapsed=False).add_to(m)

    src = ' | '.join(x for x in [
        f"Tanager T2 {sources.get('tanager_t2')}" if sources.get('tanager_t2') else '',
        f"T1 {sources.get('tanager_t1')}" if sources.get('tanager_t1') else '',
        f"Temperature: {sources.get('lst_source')}" if sources.get('lst_source') else '',
    ] if x)
    legend = (
        '<div style="position:fixed;bottom:24px;left:24px;z-index:1000;background:white;padding:12px;'
        'border-radius:8px;border:1px solid #ccc;font:12px sans-serif;max-width:300px">'
        f'<b>Sahab AI: {city}</b><br><br>'
        + ''.join(f'<span style="background:{c};display:inline-block;width:10px;height:10px;'
                  f'border-radius:50%"></span> {ACTION_TEXT[k]}<br>'
                  for k, c in ACTION_COLORS.items() if k != 'none')
        + f'<br>Circle size = risk score<br><span style="color:#666">{src}</span></div>')
    m.get_root().html.add_child(folium.Element(legend))
    m.save(path)
