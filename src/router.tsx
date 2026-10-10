import { createBrowserRouter, Navigate } from 'react-router';
import { AppLayout } from './components/AppLayout';
import { Home } from './pages/Home';
import { InvoiceFormPage } from './pages/InvoiceForm';
import { Masters } from './pages/Masters';
import { Settings } from './pages/Settings';

export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/invoices/new', element: <InvoiceFormPage /> },
      { path: '/lists', element: <Masters /> },
      { path: '/settings', element: <Settings /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
