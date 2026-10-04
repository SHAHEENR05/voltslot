import { MapPin, Route, CalendarCheck, Car, BellRing, Wallet, Bell, UserCircle, Truck, Gauge, ShieldCheck, BarChart3, LogIn } from 'lucide-react';

const FIND = { to: '/', label: 'Find chargers', icon: MapPin, end: true };
const TRIP = { to: '/trip', label: 'Trip planner', icon: Route };
const USER_PAGES = [
  { to: '/bookings', label: 'My bookings', icon: CalendarCheck },
  { to: '/garage', label: 'Garage', icon: Car },
  { to: '/reminders', label: 'Smart reminders', icon: BellRing },
  { to: '/wallet', label: 'Wallet', icon: Wallet },
  { to: '/notifications', label: 'Notifications', icon: Bell, badge: 'unread' },
  { to: '/profile', label: 'Profile', icon: UserCircle },
];
const OPERATOR = { to: '/operator', label: 'Operator console', icon: Gauge };
const INSIGHTS = { to: '/insights', label: 'Insights', icon: BarChart3 };
const FLEET = { to: '/fleet', label: 'Fleet console', icon: Truck };
const ADMIN = { to: '/admin', label: 'Admin console', icon: ShieldCheck };

/** Role-aware navigation -> [{ title, items:[{to,label,icon,end?,badge?}] }]. Edit here to add a nav item. */
export function navFor(user) {
  const role = user?.role;
  if (!role) return [{ title: 'Discover', items: [FIND, TRIP, { to: '/login', label: 'Sign in', icon: LogIn }] }];
  if (role === 'ADMIN') return [
    { title: 'Management', items: [ADMIN, INSIGHTS, OPERATOR, FLEET] },
    { title: 'Drive', items: [FIND, TRIP, ...USER_PAGES] },
  ];
  if (role === 'OPERATOR') return [
    { title: 'Management', items: [OPERATOR, INSIGHTS] },
    { title: 'Drive', items: [FIND, TRIP, USER_PAGES[4], USER_PAGES[5]] },
  ];
  if (role === 'FLEET_MANAGER') return [
    { title: 'Management', items: [FLEET, { ...USER_PAGES[1], label: 'Fleet garage' }] },
    { title: 'Drive', items: [FIND, TRIP, USER_PAGES[0], USER_PAGES[3], USER_PAGES[4], USER_PAGES[5]] },
  ];
  return [{ title: 'Drive', items: [FIND, TRIP, ...USER_PAGES] }];
}
