import React, { useState, useEffect, useCallback } from 'react';
import { I, COUNTRY_CONFIGS, loadOfficeSetting } from './constants';
import { useNavigation } from './useNavigation';
import type { TabName } from './useNavigation';
import type { DeleteConfirmState } from '@/features/cases/hooks/useCaseActions';
import type { MappedCase, MappedClient } from './hooks/useAppData';
import LoginScreen from './pages/Login/LoginScreen';
import HeaderMenu from './app/HeaderMenu';
import ExitConfirmModal from './app/ExitConfirmModal';
import CommandDock from './app/CommandDock';
import AppLoadingScreen from './app/AppLoadingScreen';
import AppModals from './app/AppModals';
import FeesTab from './features/fees/FeesTab';
import SessionsCalendar from '@/features/calendar/sessions-calendar/SessionsCalendar';
import RemindersTab from './features/reminders/RemindersTab';
import ArchiveTab from './features/dashboard/ArchiveTab';
import AdminPanel from './features/admin/AdminPanel';

// ─── Dashboard Components ─────────────────
import AppHeader from './features/dashboard/AppHeader';
import DashboardTab from './features/dashboard/DashboardTab';
import CasesTab from './features/dashboard/CasesTab';
import TeamTab from './features/dashboard/TeamTab';
import ClientsTab from './features/dashboard/ClientsTab';

// ─── Hooks ───────────────────────────────
import { useHealthMonitor } from './hooks/useHealthMonitor';
import { usePwaInstall } from './hooks/usePwaInstall';
import { useDashboardFeed } from '@/shared/hooks/useDashboardFeed';
import { useAppData } from './hooks/useAppData';
import { useTelegramAlerts } from './hooks/useTelegramAlerts';
import { useCaseActions } from '@/features/cases/hooks/useCaseActions';
import { useClientActions } from '@/features/clients/hooks/useClientActions';
import { useAutoLogout } from './hooks/useAutoLogout';
import { useAuthProfile } from './hooks/useAuthProfile';
import { useThemeMode } from './hooks/useThemeMode';
import { useNavbarHeightVar } from './hooks/useNavbarHeightVar';
import { useDbConnectivity } from './hooks/useDbConnectivity';
import { useInitialDataSync } from './hooks/useInitialDataSync';

function App() {
    const { profile, setProfile, authUser, setAuthUser, authLoading, loadProfile } = useAuthProfile();

    // ── Navigation ────────────────────────────────────────────
    const nav = useNavigation();
    const tab = nav.tab;
    const setTab = useCallback((newTab: TabName) => nav.navigateTo(newTab), [nav]);

    const showCaseModal   = nav.isOpen('newCase');
    const showLawyerModal = nav.isOpen('newLawyer');
    const showClientModal = nav.isOpen('newClient');
    const showSearch      = nav.isOpen('search');
    const showAI          = nav.isOpen('ai');
    const showSettings    = nav.isOpen('settings');

    const setShowCaseModal   = useCallback((v: boolean) => v ? nav.openModal('newCase')    : nav.closeModal('newCase'),    [nav]);
    const setShowLawyerModal = useCallback((v: boolean) => v ? nav.openModal('newLawyer')  : nav.closeModal('newLawyer'),  [nav]);
    const setShowClientModal = useCallback((v: boolean) => v ? nav.openModal('newClient')  : nav.closeModal('newClient'),  [nav]);
    const setShowSearch      = useCallback((v: boolean) => v ? nav.openModal('search')     : nav.closeModal('search'),     [nav]);
    const setShowAI          = useCallback((v: boolean) => v ? nav.openModal('ai')         : nav.closeModal('ai'),         [nav]);
    const setShowSettings    = useCallback((v: boolean) => v ? nav.openModal('settings')   : nav.closeModal('settings'),   [nav]);
    const showNewSessionModal    = nav.isOpen('newSession');
    const setShowNewSessionModal = useCallback((v: boolean) => v ? nav.openModal('newSession') : nav.closeModal('newSession'), [nav]);

    // ── Local UI state ────────────────────────────────────────
    const [showMore,       setShowMore]       = useState(false);
    const [showHeaderMenu, setShowHeaderMenu] = useState(false);
    const [showFeesSummary,setShowFeesSummary]= useState(false);

    const { navRef } = useNavbarHeightVar();

    const [clientSearch,   setClientSearch]   = useState('');
    const [savingCase,     setSavingCase]     = useState(false);
    const [savingLawyer,   setSavingLawyer]   = useState(false);
    const [savingClient,   setSavingClient]   = useState(false);
    const [sessionsInitialTab,      setSessionsInitialTab]      = useState<'month'|'calendar'|'missed'|null>(null);
    const [remindersInitialFilter,  setRemindersInitialFilter]  = useState<string|null>(null);

    const [selectedCase,      _setSelectedCase]  = useState<MappedCase | null>(null);
    const [selectedCaseInitialTab, setSelectedCaseInitialTab] = useState('timeline');
    const [selectedClient,    _setSelectedClient]= useState<MappedClient | null>(null);
    const [deleteConfirm,     _setDeleteConfirm] = useState<DeleteConfirmState | null>(null);

    const { darkMode, toggleTheme } = useThemeMode();
    const [country, setCountry] = useState('EG');
    const { dbOnline } = useDbConnectivity(profile);

    // ── تحميل الدولة من office_settings بعد ما الـ profile يتحمّل ──
    useEffect(() => {
        if (!profile) return;
        loadOfficeSetting('country').then((saved) => {
            if (saved && COUNTRY_CONFIGS[saved]) setCountry(saved);
        }).catch(() => {/* استخدم SA كافتراضي */});
    }, [profile]);

    // ── Hooks ─────────────────────────────────────────────────
    const { healthErrors, setHealthErrors }                     = useHealthMonitor(profile);
    const { handlePwaInstall }                          = usePwaInstall();
    const feed                                          = useDashboardFeed(profile);
    const {
        todaySessions, upcomingSessions, missedSessions,
        upcomingTasks, missedTasks, loadingUrgent,
        upcomingTasksOpen, setUpcomingTasksOpen,
        todayOpen,     setTodayOpen,
        upcomingOpen,  setUpcomingOpen,
        fetchTodaySessions, fetchUpcomingSessions, fetchMissedSessions, fetchTasks,
    } = feed;
    const data = useAppData(profile);
    const {
        cases,    setCases,
        casesFilter, setCasesFilter, casesPage, setCasesPage, casesTotal, casesLoading, dbError,
        casesSearch, setCasesSearch,
        clients,  setClients,
        clientsPage, setClientsPage, clientsTotal, clientsLoading,
        lawyers,  setLawyers,
        fetchCases, fetchLawyers, fetchClients, searchCases,
    } = data;
    const { sendTelegram }                                      = useTelegramAlerts(profile);

    // ── Modal helpers ─────────────────────────────────────────
    const setSelectedCase = useCallback((caseOrUpdater: React.SetStateAction<MappedCase | null>, initialTab: string = 'timeline') => {
        if (typeof caseOrUpdater === 'function') { _setSelectedCase(caseOrUpdater); return; }
        if (caseOrUpdater) {
            _setSelectedCase(caseOrUpdater);
            setSelectedCaseInitialTab(initialTab);
            nav.openModal('caseDetail');
        } else { _setSelectedCase(null); }
    }, [nav]);

    const setSelectedClient = useCallback((clientOrNull: MappedClient | null) => {
        if (clientOrNull) { _setSelectedClient(clientOrNull); nav.openModal('clientDetail'); }
        else              { _setSelectedClient(null); }
    }, [nav]);

    const setDeleteConfirm = useCallback((v: DeleteConfirmState | null) => {
        if (v) { _setDeleteConfirm(v); nav.openModal('delete'); }
        else   { _setDeleteConfirm(null); }
    }, [nav]);

    const { handleLogout, handleSaveCase, handleDeleteCase, handleUpdateCase } = useCaseActions({
        sendTelegram, fetchCases, cases, lawyers, clients, selectedCase,
        setCases, setLawyers, setClients, setProfile, setAuthUser,
        setSelectedCase, setDeleteConfirm, setSavingCase, setShowCaseModal,
        casesFilter, nav, profile,
    });
    const { handleSaveClient, handleDeleteClient, handleUpdateClient, handleSaveLawyer } = useClientActions({
        sendTelegram, fetchClients, fetchLawyers, clients, clientSearch,
        setClients, setSelectedClient, setDeleteConfirm, setSavingClient,
        setSavingLawyer, setShowClientModal, setShowLawyerModal, nav, profile,
    });

    const handleAutoLogout = useCallback(() => {
        setCases([]); setLawyers([]); setClients([]);
        setProfile(null); setAuthUser(null);
    }, [setCases, setLawyers, setClients, setProfile, setAuthUser]);
    useAutoLogout(profile, handleAutoLogout);

    const isAdmin = profile?.role === 'admin';

    // ── Initial data fetch + إعادة تحميل بعد المزامنة الأوفلاين ──
    useInitialDataSync({
        profile, casesFilter, clientSearch,
        fetchTodaySessions, fetchMissedSessions, fetchTasks,
        fetchCases, fetchClients, fetchUpcomingSessions, fetchLawyers,
    });

    // ─────────────────────────────────────────────────────────
    //  Loading screen
    // ─────────────────────────────────────────────────────────
    if (authLoading) return React.createElement(AppLoadingScreen);

    if (!authUser || !profile) return React.createElement(LoginScreen, { onLogin: (u) => loadProfile(u) });

    // ─────────────────────────────────────────────────────────
    //  Render
    // ─────────────────────────────────────────────────────────
    const Header      = React.createElement(AppHeader, { profile, setShowMenu: (v: boolean) => setShowHeaderMenu(v), setShowSearch, isAdmin, fetchCases, casesFilter, loadingCases: casesLoading });
    const Dashboard   = React.createElement(DashboardTab, {
        profile, cases, clients,
        todaySessions, upcomingSessions, missedSessions,
        upcomingTasks, missedTasks, loadingUrgent,
        todayOpen, setTodayOpen, upcomingOpen, setUpcomingOpen,
        upcomingTasksOpen, setUpcomingTasksOpen,
        setSelectedCase, setShowCaseModal, setShowClientModal, setShowNewSessionModal,
        setTab, setRemindersInitialFilter, setSessionsInitialTab,
        dbOnline, healthErrors, setHealthErrors,
        fetchTodaySessions, fetchUpcomingSessions, fetchMissedSessions,
    });
    const CasesTabContent   = React.createElement(CasesTab, {
        cases, casesFilter, setCasesFilter, casesPage, setCasesPage,
        casesTotal, casesLoading, fetchCases, searchCases, casesSearch, setCasesSearch,
        setShowCaseModal, setSelectedCase,
        loadingCases: casesLoading, dbError,
    });
    const TeamTabContent    = React.createElement(TeamTab,    { lawyers, setShowLawyerModal });
    const ClientsTabContent = React.createElement(ClientsTab, {
        cases, clients, clientSearch, setClientSearch,
        clientsPage, setClientsPage, clientsTotal, clientsLoading,
        fetchClients, setSelectedClient, setShowClientModal,
    });
    const DocsTab = React.createElement(ArchiveTab, { cases, clients });

    const showMenu = showHeaderMenu;

    return React.createElement('div', { className: 'h-full flex flex-col bg-premium-bg', 'data-testid': 'app-shell' },

        React.createElement('div', {
            style: showMenu ? { filter: 'blur(3px) brightness(0.4)', transition: 'filter 0.2s ease', pointerEvents: 'none' } : { transition: 'filter 0.2s ease' }
        }, Header),

        // ── Dropdown menu ──
        React.createElement(HeaderMenu, { showMenu, setShowHeaderMenu, darkMode, toggleTheme, handlePwaInstall, setShowSettings, country, handleLogout }),

        React.createElement('main', {
            className: `flex-1 overflow-y-auto no-scrollbar ${tab === 'admin' ? '' : 'px-4 py-4 pb-32'}`,
            style: showMenu ? { filter: 'blur(3px) brightness(0.4)', transition: 'filter 0.2s ease', pointerEvents: 'none' } : { transition: 'filter 0.2s ease' }
        },
            tab === 'dashboard'  && Dashboard,
            tab === 'cases'      && CasesTabContent,
            tab === 'clients'    && ClientsTabContent,
            tab === 'calendar'   && React.createElement('div', { className: 'space-y-4 fade-in' },
                React.createElement('div', { className: 'flex items-center justify-between' },
                    React.createElement('h3', { className: 'text-xl font-black text-white' }, '📅 الجلسات'),
                    React.createElement('button', {
                        onClick: () => setShowNewSessionModal(true),
                        className: 'flex items-center gap-1 px-3 py-1.5 rounded-xl text-[11px] font-black text-premium-bg transition-all active:scale-95',
                        style: { background: 'linear-gradient(135deg,#d4af37,#f0c040)' }
                    }, React.createElement('span', { className: 'text-sm' }, '⚡'), 'إضافة جلسة')
                ),
                React.createElement(SessionsCalendar, {
                    cases, clients,
                    onOpenCase: (c) => { setSelectedCase(c, 'timeline'); },
                    onOpenReminders: () => { setRemindersInitialFilter('overdue'); setTab('reminders'); },
                    initialTab: sessionsInitialTab ?? undefined,
                })
            ),
            tab === 'fees' && React.createElement(FeesTab, { cases, clients, showSummaryModal: showFeesSummary, setShowSummaryModal: setShowFeesSummary, country, profile }),
            tab === 'reminders' && React.createElement('div', { className: 'space-y-4 fade-in' },
                React.createElement(RemindersTab, { initialFilter: remindersInitialFilter, profile })
            ),
            tab === 'team' && (isAdmin
                ? TeamTabContent
                : React.createElement('div', { className: 'text-center text-slate-500 text-xs pt-20' }, 'غير مصرح لك بهذا القسم')
            ),
            tab === 'documents' && DocsTab,
            tab === 'admin' && (isAdmin
                ? React.createElement(AdminPanel, { profile, lawyers, clients, fetchLawyers })
                : React.createElement('div', { className: 'flex flex-col items-center justify-center pt-24 gap-3' },
                    React.createElement('div', { className: 'w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center' },
                        React.createElement(I.Shield, { className: 'w-7 h-7 text-red-400' })
                    ),
                    React.createElement('p', { className: 'text-xs font-bold text-slate-400' }, 'هذا القسم للمديرين فقط')
                )
            )
        ),

        // ── COMMAND DOCK ──────────────────────────────────────────────────────
        React.createElement(CommandDock, {
            tab, setTab, showMore, setShowMore, isAdmin, navRef,
            setShowAI, setSessionsInitialTab, setRemindersInitialFilter,
        }),

        // ── Modals ────────────────────────────────────────────
        React.createElement(AppModals, {
            cases, clients, lawyers, profile, country, isAdmin, casesFilter, nav,
            showSearch, showAI, showSettings, showCaseModal, showNewSessionModal,
            showLawyerModal, showClientModal, savingCase, savingLawyer, savingClient,
            deleteConfirm, selectedClient, selectedCase, selectedCaseInitialTab,
            setShowSearch, setShowAI, setShowSettings, setShowCaseModal, setShowNewSessionModal,
            setShowLawyerModal, setShowClientModal, setCountry, setTab,
            setSelectedCase, setSelectedClient,
            _setDeleteConfirm, _setSelectedClient, _setSelectedCase,
            setCases, setCasesFilter, setCasesPage,
            fetchCases, fetchTodaySessions, fetchUpcomingSessions,
            handleSaveCase, handleDeleteCase, handleUpdateCase,
            handleSaveClient, handleDeleteClient, handleUpdateClient, handleSaveLawyer,
            sendTelegram,
        }),

        // ── Exit Confirm ──
        React.createElement(ExitConfirmModal, { nav })
    );
}

export default App;
