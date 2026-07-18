import React from 'react';
import { createPortal } from 'react-dom';
import { COUNTRY_CONFIGS } from '../constants';
import type { TabName } from '../useNavigation';
import type { NavigationState } from '../useNavigation';
import type { DeleteConfirmState, CaseFormSubmitData } from '@/features/cases/hooks/useCaseActions';
import type { ClientFormData } from '@/features/clients/hooks/useClientActions';
import type { MappedCase, MappedClient } from '../hooks/useAppData';
import type { ProfileRow } from '../types';
import NewCaseModal from '../features/cases/NewCaseModal';
import NewClientModal from '../features/clients/NewClientModal';
import UserFormModal from '@/features/admin/users/UserFormModal';
import ClientDetailModal from '../features/clients/ClientDetailModal';
import UniversalSearchModal from '../shared/modals/UniversalSearchModal';
import AILegalAssistant from '../features/ai/AILegalAssistant';
import SettingsPage from '../pages/Settings/SettingsPage';
import DeleteConfirmModal from '@/shared/modals/DeleteConfirmModal';
import NewStandaloneSessionModal from '../features/calendar/NewStandaloneSessionModal';
import CaseDetailView from '../features/cases/CaseDetailView';

interface AppModalsProps {
    // ── بيانات أساسية ──
    cases: MappedCase[];
    clients: MappedClient[];
    lawyers: ProfileRow[];
    profile: ProfileRow | null;
    country: string;
    isAdmin: boolean;
    casesFilter: string;
    nav: NavigationState;

    // ── حالات إظهار المودالات ──
    showSearch: boolean;
    showAI: boolean;
    showSettings: boolean;
    showCaseModal: boolean;
    showNewSessionModal: boolean;
    showLawyerModal: boolean;
    showClientModal: boolean;
    savingCase: boolean;
    savingLawyer: boolean;
    savingClient: boolean;
    deleteConfirm: DeleteConfirmState | null;
    selectedClient: MappedClient | null;
    selectedCase: MappedCase | null;
    selectedCaseInitialTab: string;

    // ── setters ──
    setShowSearch: (v: boolean) => void;
    setShowAI: (v: boolean) => void;
    setShowSettings: (v: boolean) => void;
    setShowCaseModal: (v: boolean) => void;
    setShowNewSessionModal: (v: boolean) => void;
    setShowLawyerModal: (v: boolean) => void;
    setShowClientModal: (v: boolean) => void;
    setCountry: (c: string) => void;
    setTab: (tab: TabName) => void;
    setSelectedCase: (caseOrUpdater: React.SetStateAction<MappedCase | null>, initialTab?: string) => void;
    setSelectedClient: (clientOrNull: MappedClient | null) => void;
    _setDeleteConfirm: React.Dispatch<React.SetStateAction<DeleteConfirmState | null>>;
    _setSelectedClient: React.Dispatch<React.SetStateAction<MappedClient | null>>;
    _setSelectedCase: React.Dispatch<React.SetStateAction<MappedCase | null>>;
    setCases: React.Dispatch<React.SetStateAction<MappedCase[]>>;
    setCasesFilter: (filter: string) => void;
    setCasesPage: (page: number) => void;

    // ── دوال fetch ──
    fetchCases: (page?: number, filter?: string) => Promise<void>;
    fetchTodaySessions: () => Promise<void>;
    fetchUpcomingSessions: () => Promise<void>;

    // ── هاندلرز ──
    handleSaveCase: (form: CaseFormSubmitData) => void | Promise<void>;
    handleDeleteCase: (caseId: string) => void | Promise<void>;
    handleUpdateCase: (caseId: string, form: CaseFormSubmitData) => void | Promise<void>;
    handleSaveClient: (form: ClientFormData, idFile: File | null, poaFile: File | null) => void | Promise<void>;
    handleDeleteClient: (clientId: string) => void | Promise<void>;
    handleUpdateClient: (clientId: string, form: ClientFormData, idFile?: File | null, poaFile?: File | null) => void | Promise<void>;
    handleSaveLawyer: (form: { email: string; password: string; full_name: string; role?: string }) => void | Promise<void>;
    sendTelegram: (msg: string) => void | Promise<void>;
}

// ─────────────────────────────────────────────────────────
//  AppModals — منقول حرفيًا من App.tsx (دفعة 4): كل المودالات
//  اللي كانت بتترسم بعد الـ Command Dock (البحث، الذكاء الاصطناعي،
//  الإعدادات، تأكيد الحذف، الموديلات الجديدة لقضية/جلسة/محامي/موكل،
//  تفاصيل الموكل، تفاصيل القضية). صفر تغيير في المنطق أو الترتيب أو
//  شروط العرض — استبدلنا فقط الاعتماد من closure لـ props.
//  (ExitConfirmModal فضل في App.tsx زي ما هو — مش جزء من كتلة
//  "Modals" الأصلية، وده مكوّن منفصل خالص اتعمل من قبل.)
// ─────────────────────────────────────────────────────────
function AppModals({
    cases, clients, lawyers, profile, country, isAdmin, casesFilter, nav,
    showSearch, showAI, showSettings, showCaseModal, showNewSessionModal,
    showLawyerModal, showClientModal, savingCase, savingLawyer, savingClient,
    deleteConfirm, selectedClient, selectedCase, selectedCaseInitialTab,
    setShowSearch, setShowAI, setShowSettings, setShowCaseModal, setShowNewSessionModal,
    setShowLawyerModal, setShowClientModal, setCountry, setTab,
    setSelectedCase, setSelectedClient, _setDeleteConfirm, _setSelectedClient, _setSelectedCase,
    setCases, setCasesFilter, setCasesPage,
    fetchCases, fetchTodaySessions, fetchUpcomingSessions,
    handleSaveCase, handleDeleteCase, handleUpdateCase,
    handleSaveClient, handleDeleteClient, handleUpdateClient, handleSaveLawyer,
    sendTelegram,
}: AppModalsProps) {
    return React.createElement(React.Fragment, null,
        // ⚠️ ملحوظة نوع (بدون تغيير سلوك): نتيجة بحث القضايا (SearchCaseResult
        // داخل UniversalSearchModal.tsx) شكلها أضيق من MappedCase الكامل —
        // ناقصها year/session_time. الحقلين دول مش بيتقراهم حد فعليًا في
        // CaseDetailView (اتأكد بالفحص) — يعني الفجوة خاملة (inert)، مالهاش
        // أثر وقت التشغيل. الكاست هنا بيحافظ على نفس السلوك الحالي بالظبط.
        // (فجوة بيانات الموكل المشابهة — notes/cr_number/contact_info/type —
        // اتقفلت: SearchClientResult بقت بتجيب الحقول دي فعليًا من الاستعلام.)
        showSearch && React.createElement(UniversalSearchModal, {
            cases, clients,
            onClose: () => setShowSearch(false),
            onOpenCase: (c) => { setSelectedCase(c as MappedCase, 'timeline'); },
            onOpenClient: (c) => { setSelectedClient(c as MappedClient); setTab('clients'); }
        }),
        showAI && createPortal(React.createElement(AILegalAssistant, { onClose: () => setShowAI(false), cases, clients, profile, country }), document.body),
        showSettings && createPortal(React.createElement(SettingsPage, { profile, isAdmin, country, onCountryChange: (c: string) => { setCountry(c); }, onClose: () => setShowSettings(false) }), document.body),
        deleteConfirm && nav.isOpen('delete') && createPortal(React.createElement(DeleteConfirmModal, {
            title: deleteConfirm.title, itemName: deleteConfirm.name, itemType: deleteConfirm.itemType,
            mode: deleteConfirm.mode || 'delete',
            onConfirm: deleteConfirm.onConfirm,
            onCancel: () => { nav.closeModal('delete'); _setDeleteConfirm(null); },
            loading: false,
            inputTestId: 'archive-confirm-input',
            confirmTestId: 'archive-confirm-button',
            cancelTestId: 'archive-cancel-button',
        }), document.body),
        showCaseModal && React.createElement(NewCaseModal, {
            onClose: () => setShowCaseModal(false), onSave: handleSaveCase, loading: savingCase,
            lawyers, isAdmin, clients,
            countryCourts: COUNTRY_CONFIGS[country]?.courts,
            countryCaseTypes: COUNTRY_CONFIGS[country]?.caseTypes,
        }),
        showNewSessionModal && React.createElement(NewStandaloneSessionModal, {
            onClose: () => setShowNewSessionModal(false),
            onSaved: () => { fetchTodaySessions(); fetchUpcomingSessions(); fetchCases(0, casesFilter); },
            onNotify: sendTelegram,
            cases,
        }),
        showLawyerModal && React.createElement(UserFormModal, { onClose: () => setShowLawyerModal(false), onSave: handleSaveLawyer, loading: savingLawyer }),
        showClientModal && React.createElement(NewClientModal, { onClose: () => setShowClientModal(false), onSave: handleSaveClient, loading: savingClient }),
        selectedClient && nav.isOpen('clientDetail') && React.createElement(ClientDetailModal, {
            client: selectedClient,
            cases: cases.filter((c) => c.client_id === selectedClient?.id),
            onClose: () => { nav.closeModal('clientDetail'); _setSelectedClient(null); },
            onDelete: handleDeleteClient, onEdit: handleUpdateClient,
            onOpenCase: (ca) => { nav.closeModal('clientDetail'); _setSelectedClient(null); setSelectedCase(ca); }
        }),
        selectedCase && nav.isOpen('caseDetail') && React.createElement(CaseDetailView, {
            caseData: selectedCase,
            client: clients.find((cl) => cl.id === selectedCase?.client_id) || null,
            initialTab: selectedCaseInitialTab,
            onClose: () => { nav.closeModal('caseDetail'); _setSelectedCase(null); },
            onUpdate: (newStatus: string) => {
                setSelectedCase((p) => ({ ...p, status: newStatus } as MappedCase));
                setCases((prev) => prev.map((c) => c.id === selectedCase?.id ? { ...c, status: newStatus } : c));
                setCasesFilter(newStatus); setCasesPage(0); fetchCases(0, newStatus);
            },
            onDelete: handleDeleteCase, onEdit: handleUpdateCase, onNotify: sendTelegram, profile, country,
        }),
    );
}

export default AppModals;
