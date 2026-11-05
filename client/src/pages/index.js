/* The pages of the app, by 'tab/section'. A page that is not listed here shows the placeholder, so every step adds its
   pages here as it builds them. A page receives the name after its address (the course in #/buyer/course/ai-for-work)
   as `param`. Pages load on demand. */
import { lazy } from 'react'

export const PAGES = {
  'buyer/home': lazy(() => import('./buyer/Storefront.jsx')),
  'buyer/course': lazy(() => import('./buyer/CourseDetail.jsx')),
  'buyer/checkout': lazy(() => import('./buyer/checkout/Checkout.jsx')),
  'buyer/learn': lazy(() => import('./buyer/MyCourses.jsx')),
  'buyer/link': lazy(() => import('./buyer/LinkPage.jsx')),

  'seller/home': lazy(() => import('./seller/Overview.jsx')),
  'seller/payments': lazy(() => import('./seller/Payments.jsx')),
  'seller/customers': lazy(() => import('./seller/Customers.jsx')),
  'seller/payouts': lazy(() => import('./seller/Payouts.jsx')),
  'seller/links': lazy(() => import('./seller/Links.jsx')),
  'seller/countries': lazy(() => import('./seller/Countries.jsx')),
  'seller/copilot': lazy(() => import('./seller/Copilot.jsx')),

  'admin/overview': lazy(() => import('./admin/Overview.jsx')),
  'admin/transactions': lazy(() => import('./admin/Transactions.jsx')),
  'admin/review': lazy(() => import('./admin/Review.jsx')),
  'admin/merchants': lazy(() => import('./admin/Merchants.jsx')),
  'admin/corridors': lazy(() => import('./admin/Corridors.jsx')),
  'admin/settlements': lazy(() => import('./admin/Settlements.jsx')),
  'admin/fairness': lazy(() => import('./admin/Fairness.jsx')),
  'admin/audit': lazy(() => import('./admin/Audit.jsx')),
}
