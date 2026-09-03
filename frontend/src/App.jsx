import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import PrivateRoute from "./components/PrivateRoute";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import CreditCards from "./pages/CreditCards";
import RecurringTransactions from "./pages/RecurringTransactions";
import Simulator from "./pages/Simulator";
import Settings from "./pages/Settings";
import Reports from "./pages/Reports";
import Login from "./pages/Login";
import Cadastro from "./pages/Cadastro";

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/cadastro" element={<Cadastro />} />
            <Route path="/" element={<PrivateRoute><Layout><Dashboard /></Layout></PrivateRoute>} />
            <Route path="/cartoes"      element={<PrivateRoute><Layout><CreditCards /></Layout></PrivateRoute>} />
            <Route path="/relatorios"   element={<PrivateRoute><Layout><Reports /></Layout></PrivateRoute>} />
            <Route path="/recorrentes"  element={<PrivateRoute><Layout><RecurringTransactions /></Layout></PrivateRoute>} />
            <Route path="/simulador"     element={<PrivateRoute><Layout><Simulator /></Layout></PrivateRoute>} />
            <Route path="/configuracoes" element={<PrivateRoute><Layout><Settings /></Layout></PrivateRoute>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
