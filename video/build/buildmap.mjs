/* Prepares the world map of the first scene: country shapes (Natural Earth, public domain, through the world-atlas package),
   an ESTIMATED tier for each country, random points where payments pulse, and a few arcs between big hubs.
   The tiers are an estimate for illustration, not official data, and the film says so on screen.
   Usage: node buildmap.mjs */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { geoArea, geoBounds, geoContains, geoNaturalEarth1, geoPath } from 'd3-geo'
import { feature } from 'topojson-client'
import { random } from './render/lib.js'

const here = import.meta.dirname
const work = join(here, '..', 'work')
mkdirSync(work, { recursive: true })

/* 4 very high, 3 high, 2 medium, 1 low. "limited" is where Visa and Mastercard stopped, or PayPal is not offered. */
const TIERS = {
  4: [
    'United States of America',
    'Canada',
    'United Kingdom',
    'Ireland',
    'Germany',
    'France',
    'Netherlands',
    'Belgium',
    'Luxembourg',
    'Switzerland',
    'Austria',
    'Denmark',
    'Sweden',
    'Norway',
    'Finland',
    'Iceland',
    'Australia',
    'New Zealand',
    'Japan',
    'South Korea',
    'Singapore',
    'Israel',
    'United Arab Emirates',
    'Hong Kong',
  ],
  3: [
    'Spain',
    'Italy',
    'Portugal',
    'Poland',
    'Czechia',
    'Slovakia',
    'Slovenia',
    'Hungary',
    'Greece',
    'Croatia',
    'Estonia',
    'Latvia',
    'Lithuania',
    'Romania',
    'Bulgaria',
    'Cyprus',
    'Malta',
    'Brazil',
    'Mexico',
    'Chile',
    'Argentina',
    'Uruguay',
    'Colombia',
    'Saudi Arabia',
    'Qatar',
    'Kuwait',
    'Bahrain',
    'Oman',
    'Malaysia',
    'Thailand',
    'Taiwan',
    'Turkey',
  ],
  2: [
    'China',
    'India',
    'Indonesia',
    'Philippines',
    'Vietnam',
    'Peru',
    'Ecuador',
    'Costa Rica',
    'Panama',
    'Dominican Rep.',
    'Jamaica',
    'Trinidad and Tobago',
    'Ukraine',
    'Serbia',
    'Bosnia and Herz.',
    'Albania',
    'Macedonia',
    'Montenegro',
    'Moldova',
    'Georgia',
    'Armenia',
    'Azerbaijan',
    'Kazakhstan',
    'Uzbekistan',
    'Jordan',
    'Lebanon',
    'Sri Lanka',
    'Bangladesh',
    'Pakistan',
    'South Africa',
    'Morocco',
    'Egypt',
    'Tunisia',
    'Mauritius',
    'Botswana',
    'Namibia',
    'Seychelles',
    'Paraguay',
    'Bolivia',
    'Guatemala',
    'El Salvador',
    'Honduras',
    'Mongolia',
    'Greenland',
    'Kosovo',
    'Iraq',
    'Bahamas',
    'Puerto Rico',
    'Papua New Guinea',
    'Fiji',
    'Maldives',
    'Brunei',
    'Macao',
  ],
  limited: ['Russia', 'Belarus', 'Iran', 'North Korea', 'Syria', 'Cuba', 'Afghanistan', 'Yemen', 'Myanmar'],
}

const AFRICA = new Set([
  'Algeria',
  'Angola',
  'Benin',
  'Botswana',
  'Burkina Faso',
  'Burundi',
  'Cabo Verde',
  'Cameroon',
  'Central African Rep.',
  'Chad',
  'Comoros',
  'Congo',
  "Côte d'Ivoire",
  'Dem. Rep. Congo',
  'Djibouti',
  'Egypt',
  'Eq. Guinea',
  'Eritrea',
  'Ethiopia',
  'Gabon',
  'Gambia',
  'Ghana',
  'Guinea',
  'Guinea-Bissau',
  'Kenya',
  'Lesotho',
  'Liberia',
  'Libya',
  'Madagascar',
  'Malawi',
  'Mali',
  'Mauritania',
  'Mauritius',
  'Morocco',
  'Mozambique',
  'Namibia',
  'Niger',
  'Nigeria',
  'Rwanda',
  'S. Sudan',
  'Senegal',
  'Seychelles',
  'Sierra Leone',
  'Somalia',
  'Somaliland',
  'South Africa',
  'Sudan',
  'São Tomé and Principe',
  'Tanzania',
  'Togo',
  'Tunisia',
  'Uganda',
  'W. Sahara',
  'Zambia',
  'Zimbabwe',
  'eSwatini',
])

const tierOf = (name) => {
  for (const [tier, names] of Object.entries(TIERS))
    if (names.includes(name)) return tier === 'limited' ? 0 : Number(tier)
  return 1
}

const topology = JSON.parse(readFileSync(join(here, 'node_modules/world-atlas/countries-50m.json'), 'utf8'))
const all = feature(topology, topology.objects.countries).features.filter(
  (entry) => entry.properties.name !== 'Antarctica',
)

const WIDTH = 1500
const HEIGHT = 770
const projection = geoNaturalEarth1().fitExtent(
  [
    [0, 0],
    [WIDTH, HEIGHT],
  ],
  { type: 'FeatureCollection', features: all },
)
const path = geoPath(projection)

/* Which part of the world, for the order the map lights up in. */
function regionOf(name, centroid) {
  if (AFRICA.has(name)) return 'africa'
  const [lon, lat] = centroid
  if (lon < -30) return 'americas'
  if (lon > -25 && lon < 40 && lat > 33) return 'europe'
  return 'asia'
}

const rng = random(20261107)
const WEIGHT = { 4: 14, 3: 9, 2: 5, 1: 2 }

/* A point inside the country, found by trying inside its bounds. */
function pointIn(entry) {
  const [[west, south], [east, north]] = geoBounds(entry)
  const span = east >= west ? east - west : east + 360 - west
  for (let attempt = 0; attempt < 400; attempt += 1) {
    let lon = west + rng() * span
    if (lon > 180) lon -= 360
    const lat = south + rng() * (north - south)
    if (geoContains(entry, [lon, lat])) return projection([lon, lat])
  }
  return null
}

const countries = []
const points = []
for (const entry of all) {
  const name = entry.properties.name
  const d = path(entry)
  if (!d) continue
  const tier = tierOf(name)
  /* the middle of the drawn shape, turned back into longitude and latitude (bounds break for shapes that cross the date line) */
  const [cx, cy] = path.centroid(entry)
  const centroidLonLat = projection.invert([cx, cy]) ?? [0, 0]
  countries.push({ name, d, cx, cy, tier, region: regionOf(name, centroidLonLat) })

  if (tier === 0) continue
  const size = Math.sqrt(geoArea(entry) * 4e5)
  const count = Math.max(1, Math.round(WEIGHT[tier] * Math.min(3, Math.max(0.5, size / 90))))
  for (let index = 0; index < count; index += 1) {
    const spot = pointIn(entry)
    if (!spot) continue
    points.push({
      x: +spot[0].toFixed(1),
      y: +spot[1].toFixed(1),
      net: Math.floor(rng() * 3),
      period: +(2.2 + rng() * 2).toFixed(2),
      phase: +(rng() * 4).toFixed(2),
      size: +(5 + rng() * 5).toFixed(1),
      tier,
      region: countries.at(-1).region,
    })
  }
}

const HUBS = {
  newyork: [-74, 40.7],
  london: [-0.1, 51.5],
  paris: [2.35, 48.9],
  dubai: [55.3, 25.2],
  singapore: [103.8, 1.35],
  sydney: [151.2, -33.9],
  tokyo: [139.7, 35.7],
  saopaulo: [-46.6, -23.5],
  sanfrancisco: [-122.4, 37.8],
  mumbai: [72.8, 19.1],
  toronto: [-79.4, 43.7],
  berlin: [13.4, 52.5],
}
const LINKS = [
  ['newyork', 'london'],
  ['london', 'dubai'],
  ['dubai', 'singapore'],
  ['singapore', 'sydney'],
  ['sanfrancisco', 'tokyo'],
  ['newyork', 'saopaulo'],
  ['paris', 'mumbai'],
  ['toronto', 'berlin'],
  ['tokyo', 'singapore'],
  ['sanfrancisco', 'newyork'],
]
const arcs = LINKS.map(([from, to]) => ({
  from,
  to,
  a: projection(HUBS[from]).map((n) => +n.toFixed(1)),
  b: projection(HUBS[to]).map((n) => +n.toFixed(1)),
}))

/* The box around Africa, for the camera. */
const africa = countries.filter((entry) => entry.region === 'africa')
const boxes = all.filter((entry) => AFRICA.has(entry.properties.name)).map((entry) => path.bounds(entry))
const bounds = {
  x0: Math.min(...boxes.map((box) => box[0][0])),
  y0: Math.min(...boxes.map((box) => box[0][1])),
  x1: Math.max(...boxes.map((box) => box[1][0])),
  y1: Math.max(...boxes.map((box) => box[1][1])),
}

writeFileSync(
  join(work, 'map.json'),
  JSON.stringify({ width: WIDTH, height: HEIGHT, countries, points, arcs, africa: bounds }),
)
const tally = [0, 1, 2, 3, 4]
  .map((tier) => `${tier}: ${countries.filter((entry) => entry.tier === tier).length}`)
  .join(', ')
console.log(
  `${countries.length} countries (${tally}), ${africa.length} in Africa, ${points.length} pulse points, ${arcs.length} arcs`,
)
console.log('africa box', JSON.stringify(bounds))
