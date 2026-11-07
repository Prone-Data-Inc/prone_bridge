/* Puts the frames and the mix together into the final video: 1920 by 1080, 30 frames a second, H.264 and AAC, ready for
   YouTube. Also copies the captions file next to it.
   Usage: node encode.mjs */
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import ffmpeg from 'ffmpeg-static'
import ffprobe from 'ffprobe-static'

const root = join(import.meta.dirname, '..')
const work = join(root, 'work')
const out = join(root, 'out')
mkdirSync(out, { recursive: true })
const timeline = JSON.parse(readFileSync(join(work, 'timeline.json'), 'utf8'))
const frames = Math.ceil(timeline.total * timeline.fps)
const have = readdirSync(join(work, 'frames')).filter((name) => name.endsWith('.jpg')).length
if (have < frames) throw new Error(`only ${have} of ${frames} frames are rendered`)

const file = join(out, 'ProneBridge-demo.mp4')
const result = spawnSync(
  ffmpeg,
  [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-stats',
    '-framerate',
    String(timeline.fps),
    '-i',
    join(work, 'frames', '%06d.jpg'),
    '-i',
    join(work, 'mix.wav'),
    '-map',
    '0:v',
    '-map',
    '1:a',
    '-vf',
    'scale=in_range=full:out_range=tv:out_color_matrix=bt709,format=yuv420p',
    '-c:v',
    'libx264',
    '-preset',
    'slow',
    '-crf',
    '17',
    '-profile:v',
    'high',
    '-r',
    String(timeline.fps),
    '-color_range',
    'tv',
    '-colorspace',
    'bt709',
    '-color_primaries',
    'bt709',
    '-color_trc',
    'bt709',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-ar',
    '48000',
    '-movflags',
    '+faststart',
    '-t',
    timeline.total.toFixed(3),
    file,
  ],
  { stdio: ['ignore', 'inherit', 'inherit'] },
)
if (result.status !== 0) throw new Error('ffmpeg failed')
if (existsSync(join(work, 'captions.srt'))) copyFileSync(join(work, 'captions.srt'), join(out, 'ProneBridge-demo.srt'))

const probe = spawnSync(
  ffprobe.path,
  [
    '-v',
    'error',
    '-show_entries',
    'format=duration,size:stream=codec_name,width,height,r_frame_rate',
    '-of',
    'default=nw=1',
    file,
  ],
  { encoding: 'utf8' },
)
console.log(probe.stdout.trim())
console.log(`${(statSync(file).size / 1e6).toFixed(1)} MB at ${file}`)
