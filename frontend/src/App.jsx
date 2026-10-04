import React, { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';

// Pages are loaded on demand so each route ships only the code it needs
const Home = lazy(() => import('./pages/Home'));
const Properties = lazy(() => import('./pages/Properties'));
const PropertyDetails = lazy(() => import('./pages/PropertyDetails'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const UserProfile = lazy(() => import('./pages/UserProfile'));
const CreateProperty = lazy(() => import('./pages/CreateProperty'));
const EditProperty = lazy(() => import('./pages/EditProperty'));
const Owners = lazy(() => import('./pages/Owners'));
const Tenants = lazy(() => import('./pages/Tenants'));
const OwnerProperties = lazy(() => import('./pages/OwnerProperties'));
const Notifications = lazy(() => import('./pages/Notifications'));
const ProfileSettings = lazy(() => import('./pages/ProfileSettings'));
const ProfileStatus = lazy(() => import('./pages/ProfileStatus'));
const UserRatings = lazy(() => import('./pages/UserRatings'));
const PropertyReviews = lazy(() => import('./pages/PropertyReviews'));
const PropertyReviewNew = lazy(() => import('./pages/PropertyReviewNew'));
const Favourites = lazy(() => import('./pages/Favourites'));
const Compare = lazy(() => import('./pages/Compare'));
const Chat = lazy(() => import('./pages/Chat'));
const LeaveRequests = lazy(() => import('./pages/LeaveRequests'));
const LeaveRequestNew = lazy(() => import('./pages/LeaveRequestNew'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ForceChangePassword = lazy(() => import('./pages/ForceChangePassword'));
const NotFound = lazy(() => import('./pages/NotFound'));

// Redirects users with expired passwords to the force-change screen
function PasswordExpiryGuard({ children }) {
  const { user, passwordExpired } = useAuth();
  const navigate = useNavigate();
  React.useEffect(() => {
    if (user && passwordExpired) {
      navigate('/force-change-password', { replace: true });
    }
  }, [user, passwordExpired, navigate]);
  return children;
}

function PageLoader() {
  return (
    <div className="flex justify-center items-center min-h-[50vh]" role="status" aria-label="Loading">
      <div className="spinner text-primary-600" />
    </div>
  );
}

// Resets the error boundary when the user navigates to another route
function RouteErrorBoundary({ children }) {
  const location = useLocation();
  return <ErrorBoundary resetKey={location.pathname}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Router>
          <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 transition-colors duration-200">
            <PasswordExpiryGuard>
              <Navbar />
              <main className="pt-20">
                <RouteErrorBoundary>
                <Suspense fallback={<PageLoader />}>
                <Routes>
                <Route path="/compare" element={<Compare />} />
                <Route path="/" element={<Home />} />
                <Route path="/properties" element={<Properties />} />
                <Route 
                  path="/properties/new" 
                  element={
                    <ProtectedRoute roles={['owner','admin']}>
                      <CreateProperty />
                    </ProtectedRoute>
                  } 
                />
                <Route path="/properties/:id" element={<PropertyDetails />} />
                {/* Alias route for direct property links */}
                <Route path="/property/:id" element={<PropertyDetails />} />
                <Route 
                  path="/properties/:id/edit" 
                  element={
                    <ProtectedRoute roles={['owner','admin']}>
                      <EditProperty />
                    </ProtectedRoute>
                  } 
                />
                <Route path="/owners" element={<Owners />} />
                <Route path="/tenants" element={<Tenants />} />
                <Route path="/owners/:id/properties" element={<OwnerProperties />} />
                {/* Map page removed */}
                <Route path="/login" element={<Login />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/force-change-password" element={<ForceChangePassword />} />
                <Route path="/register" element={<Register />} />
                <Route path="/users/:id" element={<UserProfile />} />
                <Route path="/users/:id/ratings" element={<UserRatings />} />
                <Route path="/property/:id/reviews" element={<PropertyReviews />} />
                {/* Alias for pluralized properties path */}
                <Route path="/properties/:id/reviews" element={<PropertyReviews />} />
                {/* New review form (tenants only) */}
                <Route 
                  path="/properties/:id/reviews/new" 
                  element={
                    <ProtectedRoute roles={['tenant']}>
                      <PropertyReviewNew />
                    </ProtectedRoute>
                  } 
                />
                <Route 
                  path="/favourites" 
                  element={
                    <ProtectedRoute roles={['tenant']}>
                      <Favourites />
                    </ProtectedRoute>
                  }
                />
                <Route 
                  path="/profile-settings" 
                  element={
                    <ProtectedRoute>
                      <ProfileSettings />
                    </ProtectedRoute>
                  }
                />
                <Route 
                  path="/profile-status" 
                  element={
                    <ProtectedRoute>
                      <ProfileStatus />
                    </ProtectedRoute>
                  }
                />
                <Route 
                  path="/dashboard" 
                  element={
                    <ProtectedRoute>
                      <Dashboard />
                    </ProtectedRoute>
                  } 
                />
                <Route 
                  path="/notifications" 
                  element={
                    <ProtectedRoute>
                      <Notifications />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/chat"
                  element={
                    <ProtectedRoute>
                      <Chat />
                    </ProtectedRoute>
                  }
                />
                <Route 
                  path="/leave-requests" 
                  element={
                    <ProtectedRoute roles={['tenant','owner','admin']}>
                      <LeaveRequests />
                    </ProtectedRoute>
                  }
                />
                <Route 
                  path="/leave-requests/new" 
                  element={
                    <ProtectedRoute roles={['tenant']}>
                      <LeaveRequestNew />
                    </ProtectedRoute>
                  }
                />
                <Route path="*" element={<NotFound />} />
              </Routes>
                </Suspense>
                </RouteErrorBoundary>
              </main>
            </PasswordExpiryGuard>
          </div>
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
