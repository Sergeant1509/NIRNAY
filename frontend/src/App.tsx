import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { useAuth } from './auth/useAuth';
import ProtectedRoute from './components/ProtectedRoute';
import DashboardPage from './pages/DashboardPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import './App.css';

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <main className="centered-page"><p>Loading NIRNAY…</p></main>;
  return <Navigate to={user ? '/app' : '/login'} replace />;
}

export default function App() {
  return <BrowserRouter><AuthProvider><Routes>
    <Route path="/" element={<HomeRedirect />} />
    <Route path="/login" element={<LoginPage />} />
    <Route path="/register" element={<RegisterPage />} />
    <Route element={<ProtectedRoute />}><Route path="/app" element={<DashboardPage />} /></Route>
    <Route path="*" element={<HomeRedirect />} />
  </Routes></AuthProvider></BrowserRouter>;
}
