import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { useAuth } from './auth/useAuth';
import ProtectedRoute from './components/ProtectedRoute';
import AppLayout from './components/AppLayout';
import DashboardPage from './pages/DashboardPage';
import AdminPage from './pages/AdminPage';
import TendersPage from './pages/TendersPage';
import RuleBuilderPage from './pages/RuleBuilderPage';
import RecordsPage from './pages/RecordsPage';
import DocumentsPage from './pages/DocumentsPage';
import DocumentVerificationPage from './pages/DocumentVerificationPage';
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
    <Route element={<ProtectedRoute />}><Route element={<AppLayout />}>
      <Route path="/app" element={<DashboardPage />} />
      <Route path="/records" element={<RecordsPage />} />
      <Route path="/documents" element={<DocumentsPage />} />
      <Route path="/verification" element={<DocumentVerificationPage />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/tenders" element={<TendersPage />} />
      <Route path="/rules" element={<RuleBuilderPage />} />
    </Route></Route>
    <Route path="*" element={<HomeRedirect />} />
  </Routes></AuthProvider></BrowserRouter>;
}
