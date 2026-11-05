/* The three fixed tabs and what each one contains. The tab strip, the sidebar, the toolbar and the router all read this.
   step says which build step fills a page in, until it exists. */
import {
  Bank,
  Buildings,
  ClipboardText,
  CreditCard,
  GearSix,
  GlobeHemisphereWest,
  House,
  LinkSimple,
  ListMagnifyingGlass,
  Path,
  Scales,
  ShieldCheck,
  ShieldWarning,
  ShoppingBag,
  Sparkle,
  SquaresFour,
  Storefront,
  Users,
  ArrowsLeftRight,
} from '@phosphor-icons/react'

export const TABS = [
  {
    id: 'buyer',
    label: 'Buyer',
    icon: ShoppingBag,
    audience: 'buyer',
    sidebar: false,
    identity: { name: 'Guest learner', role: 'Buyer' },
    sections: [
      { id: 'home', label: 'Courses', icon: House, subtitle: 'The storefront of Prone Data Learning.', step: 4 },
      {
        id: 'course',
        label: 'Course',
        icon: House,
        subtitle: 'A course from Prone Data Learning.',
        step: 4,
        hidden: true,
      },
      { id: 'checkout', label: 'Checkout', icon: CreditCard, subtitle: 'Pay with ProneBridge.', step: 4, hidden: true },
      { id: 'learn', label: 'My courses', icon: House, subtitle: 'What you have unlocked.', step: 4, hidden: true },
      {
        id: 'link',
        label: 'Payment link',
        icon: LinkSimple,
        subtitle: 'Pay through a seller link.',
        step: 6,
        hidden: true,
      },
    ],
  },
  {
    id: 'seller',
    label: 'Seller',
    icon: Storefront,
    audience: 'seller',
    sidebar: true,
    identity: { name: 'Prone Data Learning', role: 'Seller' },
    sections: [
      { id: 'home', label: 'Overview', icon: House, group: 'Business', subtitle: 'Your sales at a glance.', step: 6 },
      {
        id: 'payments',
        label: 'Payments',
        icon: CreditCard,
        group: 'Business',
        subtitle: 'Every payment, in every country.',
        step: 6,
      },
      {
        id: 'customers',
        label: 'Customers',
        icon: Users,
        group: 'Business',
        subtitle: 'The people who buy from you.',
        step: 6,
      },
      { id: 'payouts', label: 'Payouts', icon: Bank, group: 'Business', subtitle: 'Money on its way to you.', step: 6 },
      {
        id: 'links',
        label: 'Payment links',
        icon: LinkSimple,
        group: 'Business',
        subtitle: 'Share a course with one link, get paid anywhere.',
        step: 6,
      },
      {
        id: 'countries',
        label: 'Countries',
        icon: GlobeHemisphereWest,
        group: 'Reach',
        subtitle: 'Where buyers can pay, and with which methods.',
        step: 6,
      },
      {
        id: 'copilot',
        label: 'Copilot',
        icon: Sparkle,
        group: 'Assistant',
        subtitle: 'Ask anything about your business.',
        step: 7,
      },
      {
        id: 'settings',
        label: 'Settings',
        icon: GearSix,
        group: 'Account',
        subtitle: 'Your account and payout details.',
        step: 9,
      },
    ],
  },
  {
    id: 'admin',
    label: 'Admin',
    icon: ShieldCheck,
    audience: 'admin',
    sidebar: true,
    identity: { name: 'ProneBridge Admin', role: 'Admin' },
    sections: [
      {
        id: 'overview',
        label: 'Overview',
        icon: SquaresFour,
        group: 'Operations',
        subtitle: 'The whole network, live.',
        step: 8,
      },
      {
        id: 'transactions',
        label: 'Transactions',
        icon: ListMagnifyingGlass,
        group: 'Operations',
        subtitle: 'Every payment on ProneBridge.',
        step: 8,
      },
      {
        id: 'review',
        label: 'Risk review',
        icon: ShieldWarning,
        group: 'Operations',
        subtitle: 'Payments the AI wants a person to check.',
        step: 8,
      },
      {
        id: 'merchants',
        label: 'Merchants',
        icon: Buildings,
        group: 'Network',
        subtitle: 'Sellers on the platform.',
        step: 8,
      },
      {
        id: 'corridors',
        label: 'Corridors',
        icon: Path,
        group: 'Network',
        subtitle: 'Payment methods by country, and their health.',
        step: 8,
      },
      {
        id: 'settlements',
        label: 'Settlements',
        icon: ArrowsLeftRight,
        group: 'Network',
        subtitle: 'Payouts through PayPal.',
        step: 8,
      },
      {
        id: 'fairness',
        label: 'Fairness',
        icon: Scales,
        group: 'Trust',
        subtitle: 'Proof that country never decides risk.',
        step: 8,
      },
      {
        id: 'audit',
        label: 'Audit log',
        icon: ClipboardText,
        group: 'Trust',
        subtitle: 'What happened, and who did it.',
        step: 8,
      },
    ],
  },
]

export const DEFAULT_TAB = 'buyer'

export const tabById = (id) => TABS.find((tab) => tab.id === id)

export const sectionOf = (tabId, sectionId) => tabById(tabId)?.sections.find((section) => section.id === sectionId)

/* The sidebar groups of a tab, in order, each with its sections. Pages marked hidden are reached by links, not the sidebar. */
export function groupsOf(tab) {
  const groups = []
  for (const section of tab.sections.filter((item) => !item.hidden)) {
    let group = groups.find((item) => item.label === section.group)
    if (!group) groups.push((group = { label: section.group, sections: [] }))
    group.sections.push(section)
  }
  return groups
}
