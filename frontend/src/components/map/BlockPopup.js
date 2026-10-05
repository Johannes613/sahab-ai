import React from 'react';
import { Popup } from 'react-leaflet';
import { ACTIONS } from '../../constants';

export default function BlockPopup({ block: b }) {
  const rows = [
    ['Risk score', b.risk_score.toFixed(2)],
    ['Action', ACTIONS[b.action]?.label],
    ['Est. cooling', b.est_cooling_C ? `${b.est_cooling_C} °C` : '-'],
    ['Dominant material', b.dominant_material],
    ['Vegetation fraction', Number(b.veg_fraction).toFixed(2)],
    ['Asphalt fraction', Number(b.asphalt_fraction).toFixed(2)],
    ['Area', `${Number(b.area_m2).toLocaleString()} m²`],
    ['Lat / Lon', `${b.lat.toFixed(4)}, ${b.lon.toFixed(4)}`],
  ];
  return (
    <Popup>
      <div className="text-xs" style={{ minWidth: 190 }}>
        <p className="font-bold text-sm mb-1">Block #{b.rank}</p>
        <table className="w-full">
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k}>
                <td style={{ opacity: 0.65, paddingRight: 8 }}>{k}</td>
                <td className="font-medium text-right">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Popup>
  );
}
