/* What a buyer has unlocked. */
import { createLearnerRepository } from '#server/repositories/learner.repository.js'

export function createLearnerService({ db }) {
  const learners = createLearnerRepository({ db })
  return {
    async courses(buyerId) {
      return { courses: await learners.coursesOf(buyerId) }
    },
  }
}
