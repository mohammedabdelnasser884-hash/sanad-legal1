import React from 'react';
import { createPortal } from 'react-dom';
import DeleteConfirmModal from '@/shared/modals/DeleteConfirmModal';
import EditUserModal from './users/EditUserModal';
import UserFormModal from './users/UserFormModal';
import ChangePasswordModal from './security/ChangePasswordModal';
import AddPortalUserModal from './portal/AddPortalUserModal';
import ClientPortalModal from './portal/ClientPortalModal';
import LegalLibraryModal from './legal-library/LegalLibraryModal';
import type { ProfileRow, ClientRow, LawRow, LegalCategoryRow } from '../../types';
import type { EditUserForm, AddUserForm, ChangePasswordPayload } from './users/hooks/useAdminUsers';
import type { PortalAccessRow, PortalSaveForm } from './portal/hooks/useAdminPortal';
import type { LawForm } from './legal-library/hooks/useAdminLegalLibrary';

// مودالز مستقلة عن قسم العرض الحالي (section) — بتتفتح فوق أي قسم أو من غير قسم مفتوح خالص.
// اتنقلت هنا بنفس المنطق تمامًا من AdminPanel.tsx (صفر تغيير سلوك) عشان تخفيف حجم الملف الرئيسي.
interface AdminPanelModalsProps {
  // تعديل مستخدم
  editUser: ProfileRow | null;
  setEditUser: (u: ProfileRow | null) => void;
  handleEditUser: (form: EditUserForm) => void;
  saving: boolean;

  // إضافة مستخدم
  showAddUser: boolean;
  setShowAddUser: (v: boolean) => void;
  handleAddUser: (form: AddUserForm) => void;

  // إضافة وصول بوابة موكل
  showAddPortalUser: boolean;
  setShowAddPortalUser: (v: boolean) => void;
  clients: ClientRow[];
  portalAccess: PortalAccessRow[];
  handleSavePortal: (data: PortalSaveForm) => Promise<void>;
  savingPortal: boolean;

  // تعديل وصول بوابة موكل قائم
  portalClient: ClientRow | null;
  setPortalClient: (c: ClientRow | null) => void;

  // تغيير كلمة مرور
  changePassUser: ProfileRow | null;
  setChangePassUser: (u: ProfileRow | null) => void;
  handleChangePassword: (data: ChangePasswordPayload) => void;

  // إضافة / تعديل قانون
  showLawModal: boolean;
  setShowLawModal: (v: boolean) => void;
  legalCategories: LegalCategoryRow[];
  editingLaw: LawRow | null;
  setEditingLaw: (l: LawRow | null) => void;
  savingLaw: boolean;
  handleSaveLaw: (form: LawForm, file: File | null) => void;

  // تأكيد حذف قانون
  confirmDeleteLaw: LawRow | null;
  setConfirmDeleteLaw: (l: LawRow | null) => void;
  handleDeleteLaw: (law: LawRow) => void;

  // تأكيد حذف مستخدم
  confirmDelete: ProfileRow | null;
  setConfirmDelete: (u: ProfileRow | null) => void;
  handleDeleteUser: (user: ProfileRow) => void;
}

export default function AdminPanelModals(props: AdminPanelModalsProps) {
  const {
    editUser, setEditUser, handleEditUser, saving,
    showAddUser, setShowAddUser, handleAddUser,
    showAddPortalUser, setShowAddPortalUser, clients, portalAccess, handleSavePortal, savingPortal,
    portalClient, setPortalClient,
    changePassUser, setChangePassUser, handleChangePassword,
    showLawModal, setShowLawModal, legalCategories, editingLaw, setEditingLaw, savingLaw, handleSaveLaw,
    confirmDeleteLaw, setConfirmDeleteLaw, handleDeleteLaw,
    confirmDelete, setConfirmDelete, handleDeleteUser,
  } = props;

  return React.createElement(React.Fragment, null,

    editUser && React.createElement(EditUserModal, {
      user: editUser, onSave: handleEditUser,
      onClose: () => setEditUser(null), saving
    }),

    showAddUser && React.createElement(UserFormModal, {
      onSave: handleAddUser,
      onClose: () => setShowAddUser(false), loading: saving,
      title: 'إضافة مستخدم جديد'
    }),

    showAddPortalUser && React.createElement(AddPortalUserModal, {
      clients, portalAccess,
      onSave: async (data: PortalSaveForm) => { await handleSavePortal(data); setShowAddPortalUser(false); },
      onClose: () => setShowAddPortalUser(false), saving: savingPortal
    }),

    portalClient && React.createElement(ClientPortalModal, {
      client: portalClient, portalAccess,
      onSave: handleSavePortal,
      onClose: () => setPortalClient(null), saving: savingPortal
    }),

    // مودال تغيير كلمة المرور
    changePassUser && React.createElement(ChangePasswordModal, {
      user: changePassUser,
      onSave: handleChangePassword,
      onClose: () => setChangePassUser(null),
      saving
    }),

    // مودال إضافة / تعديل قانون في المكتبة القانونية
    showLawModal && React.createElement(LegalLibraryModal, {
      categories: legalCategories,
      editingLaw,
      saving: savingLaw,
      onSave: handleSaveLaw,
      onClose: () => { setShowLawModal(false); setEditingLaw(null); }
    }),

    // تأكيد حذف قانون
    confirmDeleteLaw && createPortal(React.createElement(DeleteConfirmModal, {
      title: "حذف هذا القانون؟",
      itemName: confirmDeleteLaw.title || '—',
      itemType: "القانون",
      mode: "delete",
      loading: savingLaw,
      onConfirm: () => handleDeleteLaw(confirmDeleteLaw),
      onCancel: () => setConfirmDeleteLaw(null)
    }), document.body),

    // تأكيد حذف مستخدم
    confirmDelete && createPortal(React.createElement(DeleteConfirmModal, {
      title: "حذف المستخدم؟",
      itemName: confirmDelete.full_name || '—',
      itemType: "المستخدم",
      mode: "delete",
      loading: saving,
      onConfirm: () => handleDeleteUser(confirmDelete),
      onCancel: () => setConfirmDelete(null)
    }), document.body)
  );
}
