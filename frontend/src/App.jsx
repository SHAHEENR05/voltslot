import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import Layout from './components/layout/Layout.jsx';
import ProtectedRoute from './components/layout/ProtectedRoute.jsx';
import NotFound from './components/layout/NotFound.jsx';
import Skeleton from './components/ui/Skeleton.jsx';

// Every page is lazy-loaded. Add a page = create src/pages/X.jsx + one <Route> below (see README_DEV.md).
const Home = lazy(() => import('./pages/Home.jsx'));
const Login = lazy(() => import('./pages/Login.jsx'));
const Register = lazy(() => import('./pages/Register.jsx'));
const StationDetail = lazy(() => import('./pages/StationDetail.jsx'));
const Trip = lazy(() => import('./pages/Trip.jsx'));
const Bookings = lazy(() => import('./pages/Bookings.jsx'));
const Garage = lazy(() => import('./pages/Garage.jsx'));
const Reminders = lazy(() => import('./pages/Reminders.jsx'));
const Wallet = lazy(() => import('./pages/Wallet.jsx'));
const Notifications = lazy(() => import('./pages/Notifications.jsx'));
const Profile = lazy(() => import('./pages/Profile.jsx'));
const Fleet = lazy(() => import('./pages/Fleet.jsx'));
const Operator = lazy(() => import('./pages/Operator.jsx'));
const Admin = lazy(() => import('./pages/Admin.jsx'));
const Insights = lazy(() => import('./pages/Insights.jsx'));

const Fallback = () => <div className="page"><Skeleton h={28} w={220} /><div style={{ height: 16 }} /><Skeleton h={240} r={16} /></div>;
const P = ({ roles, children }) => <ProtectedRoute roles={roles}>{children}</ProtectedRoute>;

export default function App() {
  return (
    <Suspense fallback={<Fallback />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route element={<Layout />}>
          {/* public */}
          <Route path="/" element={<Home />} />
          <Route path="/station/:id" element={<StationDetail />} />
          <Route path="/trip" element={<Trip />} />
          {/* any signed-in user */}
          <Route path="/bookings" element={<P><Bookings /></P>} />
          <Route path="/garage" element={<P><Garage /></P>} />
          <Route path="/reminders" element={<P><Reminders /></P>} />
          <Route path="/wallet" element={<P><Wallet /></P>} />
          <Route path="/notifications" element={<P><Notifications /></P>} />
          <Route path="/profile" element={<P><Profile /></P>} />
          {/* role based */}
          <Route path="/fleet" element={<P roles={['FLEET_MANAGER', 'ADMIN']}><Fleet /></P>} />
          <Route path="/operator" element={<P roles={['OPERATOR', 'ADMIN']}><Operator /></P>} />
          <Route path="/admin" element={<P roles={['ADMIN']}><Admin /></P>} />
          <Route path="/insights" element={<P roles={['ADMIN', 'OPERATOR']}><Insights /></P>} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
