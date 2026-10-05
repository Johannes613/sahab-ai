import React from 'react';
import { Layers, Flame, ListOrdered, ExternalLink } from 'lucide-react';
import Card from '../components/ui/Card';

const PILLARS = [
  {
    icon: Layers,
    title: 'Land cover mapping',
    text: 'A Random Forest labels each pixel from satellite spectra as vegetation, built-up, bare ground, water, and with hyperspectral data, roof or pavement type. Two dates show where green space was lost.',
  },
  {
    icon: Flame,
    title: 'Heat risk scoring',
    text: 'Landsat surface temperature is combined with how many people live in each block and how little green space they have. Weights are stated openly and sensitivity-checked.',
  },
  {
    icon: ListOrdered,
    title: 'Intervention ranking',
    text: 'Simple rules pick tree planting or cool roofs for each block, a regression estimates the surface cooling, and blocks are ranked by risk times expected benefit.',
  },
];

const SOURCES = [
  ['Tanager', 'Planet', 'Hyperspectral imagery for surface materials'],
  ['Sentinel-2', 'ESA Copernicus', 'Vegetation and built-up change over time'],
  ['Landsat', 'NASA / USGS', 'Land surface temperature (thermal bands)'],
  ['WorldPop', 'WorldPop', 'Population per block'],
  ['OpenStreetMap', 'OSM contributors', 'Building density, distance to green space'],
];

const LIMITS = [
  'Estimates surface temperature, not air temperature or what a person feels.',
  'Cooling numbers are modelled scenarios from relationships in the data, not guarantees. Confirm with pilots or ground measurements.',
  'Open data resolution limits block size, so this is a screening and prioritization tool for planners, not a replacement for field surveys.',
  'Open Tanager scenes are single dates; Landsat and Sentinel-2 provide the temperature and change signals.',
];

export default function About() {
  return (
    <div className="space-y-6 max-w-5xl">
      <div
        className="rounded-2xl px-8 py-8"
        style={{ background: 'linear-gradient(135deg, #8100D1 0%, #5a0099 50%, #3b006b 100%)' }}
      >
        <h1 className="text-3xl font-bold text-white mb-2">About Sahab AI</h1>
        <p className="text-purple-100 text-sm leading-relaxed max-w-3xl">
          Cities across the UAE and the Arab region are growing fast, and built-up land holds far more heat than
          vegetation or lighter surfaces. Planners have limited budgets and little block-level evidence about where
          trees or cool roofs help most. Sahab AI turns satellite data into a ranked list of blocks to fix first, what
          to do there, and roughly how much surface cooling to expect.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {PILLARS.map(({ icon: Icon, title, text }) => (
          <Card key={title}>
            <div className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center mb-3">
              <Icon size={20} />
            </div>
            <h3 className="text-sm font-semibold mb-1">{title}</h3>
            <p className="text-xs text-[var(--text-muted)] leading-relaxed">{text}</p>
          </Card>
        ))}
      </div>

      <Card>
        <h3 className="text-sm font-semibold mb-3">Data sources</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-xs text-[var(--text-muted)] text-left">
                <th className="py-2 pr-4 font-medium">Source</th>
                <th className="py-2 pr-4 font-medium">Provider</th>
                <th className="py-2 font-medium">Used for</th>
              </tr>
            </thead>
            <tbody>
              {SOURCES.map(([a, b, c]) => (
                <tr key={a} className="border-b border-[var(--border)] last:border-0">
                  <td className="py-2 pr-4 font-medium">{a}</td>
                  <td className="py-2 pr-4 text-[var(--text-muted)]">{b}</td>
                  <td className="py-2 text-[var(--text-muted)]">{c}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <h3 className="text-sm font-semibold mb-3">Honest limitations</h3>
        <ul className="list-disc pl-5 space-y-1.5 text-sm text-[var(--text-muted)]">
          {LIMITS.map((l) => <li key={l}>{l}</li>)}
        </ul>
      </Card>

      <div className="flex items-center justify-between text-sm text-[var(--text-muted)]">
        <span>Built by Team Abyssinia for the Arab Youth Space Hackathon 2026.</span>
        <a
          href="https://github.com/Johannes613/sahab-ai"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-accent hover:underline"
        >
          GitHub repository <ExternalLink size={13} />
        </a>
      </div>
    </div>
  );
}
