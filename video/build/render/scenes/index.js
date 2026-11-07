/* Every scene of the film, by the id used in script.json. A scene is a function that builds its picture inside a root
   element and answers { update(localTime) }, which draws the scene at that moment. */
import { admin, buyer, copilot, seller } from './app.js'
import arch from './arch.js'
import { aiCode, paypalCode } from './codeScenes.js'
import end from './end.js'
import intro from './intro.js'
import mapScene from './map.js'
import problem from './problem.js'

export const scenes = {
  s01_map: mapScene,
  s02_problem: problem,
  s03_intro: intro,
  s04_buyer: buyer,
  s05_seller: seller,
  s06_admin: admin,
  s07_copilot: copilot,
  s08_arch: arch,
  s09_paypal: paypalCode,
  s10_ai: aiCode,
  s11_close: end,
}
