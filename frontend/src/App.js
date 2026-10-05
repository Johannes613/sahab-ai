import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { ThemeProvider } from './context/ThemeContext';
import { RunProvider } from './context/RunContext';
import PageWrapper from './components/layout/PageWrapper';
import Dashboard from './pages/Dashboard';
import RunAnalysis from './pages/RunAnalysis';
import CityHistory from './pages/CityHistory';
import About from './pages/About';
import AgentChat from './pages/AgentChat';

export default function App() {
  return (
    <ThemeProvider>
      <RunProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<PageWrapper />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/run" element={<RunAnalysis />} />
              <Route path="/history" element={<CityHistory />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/chat" element={<AgentChat />} />
              <Route path="/about" element={<About />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: 'var(--surface)',
              color: 'var(--text-main)',
              border: '1px solid var(--border)',
              fontFamily: "'Roboto Mono', monospace",
              fontSize: 13,
            },
          }}
        />
      </RunProvider>
    </ThemeProvider>
  );
}
