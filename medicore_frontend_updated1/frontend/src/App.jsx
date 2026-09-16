import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useAuthStore } from './store/authStore'
import ProtectedRoute from './components/auth/ProtectedRoute'

import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import UnauthorizedPage from './pages/UnauthorizedPage'

import PatientListPage from './pages/patients/PatientListPage'
import RegisterPatientPage from './pages/patients/RegisterPatientPage'
import PatientDetailPage from './pages/patients/PatientDetailPage'
import PatientReportPage from './pages/patients/PatientReportPage'

import AppointmentsPage from './pages/appointments/AppointmentsPage'
import TelemedicinePage from './pages/telemedicine/TelemedicinePage'
import BillingPage from './pages/billing/BillingPage'
import PharmacyPage from './pages/pharmacy/PharmacyPage'
import LabPage from './pages/lab/LabPage'
import NursingPage from './pages/nursing/NursingPage'
import IPDPage from './pages/ipd/IPDPage'
import DoctorWorkbench from './pages/doctor/doctor';
import SessionRoomPage from './pages/telemedicine/SessionRoomPage'
import JoinSessionPage from './pages/telemedicine/JoinSessionPage'
import ActivityPage from './pages/director/ActivityPage'
import MaternityPage from './pages/maternity/MaternityPage'
import PWAInstallPrompt from './components/PWAInstallPrompt'

const P = ({ children, allowedRoles }) => <ProtectedRoute allowedRoles={allowedRoles}>{children}</ProtectedRoute>

export default function App() {
    const init = useAuthStore((s) => s.init)
    useEffect(() => { init() }, [])

    return (
        <BrowserRouter>
            <Toaster position="top-right" toastOptions={{
                duration: 3000,
                style: { fontFamily: "'DM Sans',sans-serif", fontSize: '13.5px', borderRadius: '10px' },
            }} />
            <PWAInstallPrompt />
            <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/telemedicine/join/:token" element={<JoinSessionPage />} />
                <Route path="/unauthorized" element={<UnauthorizedPage />} />

                <Route path="/dashboard" element={<P><DashboardPage /></P>} />
                <Route path="/patients" element={<P allowedRoles={['admin', 'doctor', 'nurse', 'receptionist']}><PatientListPage /></P>} />
                <Route path="/patients/register" element={<P allowedRoles={['admin', 'receptionist', 'nurse']}><RegisterPatientPage /></P>} />
                <Route path="/patients/:patientId" element={<P><PatientDetailPage /></P>} />
                <Route path="/patients/:patientId/report" element={<P><PatientReportPage /></P>} />
                <Route path="/appointments" element={<P allowedRoles={['admin', 'doctor', 'nurse', 'receptionist']}><AppointmentsPage /></P>} />
                <Route path="/telemedicine" element={<P allowedRoles={['admin', 'doctor', 'receptionist']}><TelemedicinePage /></P>} />
                <Route path="/telemedicine/session/:sessionId" element={<P><SessionRoomPage /></P>} />
                <Route path="/billing" element={<P allowedRoles={['admin', 'receptionist']}><BillingPage /></P>} />
                <Route path="/pharmacy" element={<P allowedRoles={['admin', 'pharmacist']}><PharmacyPage /></P>} />
                <Route path="/lab" element={<P allowedRoles={['admin', 'lab_tech', 'radiologist', 'doctor']}><LabPage /></P>} />
                <Route path="/nursing" element={<P allowedRoles={['admin', 'nurse']}><NursingPage /></P>} />
                <Route path="/ipd" element={<P allowedRoles={['admin', 'nurse', 'doctor']}><IPDPage /></P>} />
                <Route path="/doctor" element={<P allowedRoles={['admin', 'doctor']}><DoctorWorkbench /></P>} />
                <Route path="/maternity" element={<P allowedRoles={['admin', 'doctor', 'nurse']}><MaternityPage /></P>} />
                <Route path="/activity" element={<P allowedRoles={['admin']}><ActivityPage /></P>} />   {/* ← uses P like the rest */}

                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
        </BrowserRouter>
    )
}
