"""Arab League city table shared by the chat agent and the cities endpoints."""
import math

# One representative city per Arab League member state (two for the UAE), with an
# approximate [west, south, east, north] box. The UTM EPSG code is derived from the
# box, so it cannot drift out of sync with the coordinates.
ARAB_CITIES = {
    'Abu Dhabi':   {'bbox': [54.28, 24.38, 54.55, 24.58], 'country': 'UAE'},
    'Dubai':       {'bbox': [55.10, 25.00, 55.50, 25.35], 'country': 'UAE'},
    'Riyadh':      {'bbox': [46.55, 24.55, 46.85, 24.85], 'country': 'Saudi Arabia'},
    'Cairo':       {'bbox': [31.15, 29.95, 31.40, 30.15], 'country': 'Egypt'},
    'Muscat':      {'bbox': [58.10, 23.40, 58.70, 23.80], 'country': 'Oman'},
    'Amman':       {'bbox': [35.80, 31.85, 36.10, 32.10], 'country': 'Jordan'},
    'Casablanca':  {'bbox': [-7.75, 33.45, -7.45, 33.70], 'country': 'Morocco'},
    'Doha':        {'bbox': [51.40, 25.20, 51.65, 25.40], 'country': 'Qatar'},
    'Kuwait City': {'bbox': [47.85, 29.30, 48.10, 29.50], 'country': 'Kuwait'},
    'Manama':      {'bbox': [50.50, 26.15, 50.65, 26.30], 'country': 'Bahrain'},
    'Baghdad':     {'bbox': [44.25, 33.25, 44.55, 33.45], 'country': 'Iraq'},
    'Beirut':      {'bbox': [35.45, 33.83, 35.60, 33.93], 'country': 'Lebanon'},
    'Algiers':     {'bbox': [3.00, 36.65, 3.20, 36.85], 'country': 'Algeria'},
    'Tunis':       {'bbox': [10.10, 36.75, 10.30, 36.90], 'country': 'Tunisia'},
    'Tripoli':     {'bbox': [13.10, 32.80, 13.30, 32.95], 'country': 'Libya'},
    'Khartoum':    {'bbox': [32.45, 15.50, 32.65, 15.65], 'country': 'Sudan'},
    'Sanaa':       {'bbox': [44.15, 15.30, 44.35, 15.45], 'country': 'Yemen'},
    'Damascus':    {'bbox': [36.20, 33.45, 36.40, 33.60], 'country': 'Syria'},
    'Ramallah':    {'bbox': [35.17, 31.88, 35.25, 31.93], 'country': 'Palestine'},
    'Nouakchott':  {'bbox': [-16.05, 18.02, -15.90, 18.15], 'country': 'Mauritania'},
    'Mogadishu':   {'bbox': [45.28, 2.00, 45.40, 2.10], 'country': 'Somalia'},
    'Djibouti':    {'bbox': [43.10, 11.54, 43.20, 11.62], 'country': 'Djibouti'},
    'Moroni':      {'bbox': [43.22, -11.73, 43.30, -11.66], 'country': 'Comoros'},
}
# Rabat is Morocco's capital; Casablanca is kept because it is the larger city.
ARAB_CITIES['Rabat'] = {'bbox': [-6.95, 33.93, -6.75, 34.07], 'country': 'Morocco'}


def utm_epsg(bbox: list[float]) -> int:
    """WGS84 / UTM zone EPSG code for the centre of a [W, S, E, N] box."""
    lon = (bbox[0] + bbox[2]) / 2
    lat = (bbox[1] + bbox[3]) / 2
    zone = int(math.floor((lon + 180) / 6)) + 1
    return (32600 if lat >= 0 else 32700) + zone


for _c in ARAB_CITIES.values():
    _c['epsg'] = utm_epsg(_c['bbox'])

