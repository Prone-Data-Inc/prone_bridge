/* The pages of the app, by 'tab/section'. A page that is not listed here shows the placeholder, so every step adds its
   pages here as it builds them. A page receives the name after its address (the course in #/buyer/course/ai-for-work)
   as `param`. Pages load on demand. */
import { lazy } from 'react'

export const PAGES = {
  'buyer/home': lazy(() => import('./buyer/Storefront.jsx')),
  'buyer/course': lazy(() => import('./buyer/CourseDetail.jsx')),
  'buyer/checkout': lazy(() => import('./buyer/checkout/Checkout.jsx')),
  'buyer/learn': lazy(() => import('./buyer/MyCourses.jsx')),
}
