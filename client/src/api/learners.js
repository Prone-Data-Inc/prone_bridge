import { request } from './client.js'

/* The courses a buyer has unlocked. */
export const listCourses = (buyerId, options) => request(`/learners/${buyerId}/courses`, options)
