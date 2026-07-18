import React, { useState } from 'react';
import { I } from '../../../constants';
import { IconArchive } from '../icons';
import DeleteConfirmModal from '../../../shared/modals/DeleteConfirmModal';
import { formatArDate } from '../../../shared/ui/arabicLocale';
import type { CaseRow, ClientRow, CaseFeeRow } from '../../../types';

export type ArchiveTabId = 'cases' | 'clients' | 'fees';

interface ArchiveSectionProps {
  // ─ بحث موحّد (مربوط بالتبويب النشط من AdminPanel) ─
  archiveSearchInput: string;
  handleArchiveSearchChange: (val: string) => void;
  ARCHIVE_PAGE_SIZE: number;
  clients: ClientRow[];

  // ─ قضايا ─
  archivedCases: CaseRow[];
  archivedCasesTotal: number;
  loadingArchivedCases: boolean;
  archivedCasesPage: number;
  setArchivedCasesPage: React.Dispatch<React.SetStateAction<number>>;
  restoringCaseId: string | null;
  handleRestoreCase: (caseId: string) => void | Promise<void>;
  confirmDeleteCase: CaseRow | null;
  setConfirmDeleteCase: React.Dispatch<React.SetStateAction<CaseRow | null>>;
  deletingCase: boolean;
  handlePermanentDeleteCase: (caseId: string) => void | Promise<void>;

  // ─ موكلين ─
  archivedClients: ClientRow[];
  archivedClientsTotal: number;
  loadingArchivedClients: boolean;
  archivedClientsPage: number;
  setArchivedClientsPage: React.Dispatch<React.SetStateAction<number>>;
  restoringClientId: string | null;
  handleRestoreClient: (clientId: string) => void | Promise<void>;
  confirmDeleteClient: ClientRow | null;
  setConfirmDeleteClient: React.Dispatch<React.SetStateAction<ClientRow | null>>;
  deletingClient: boolean;
  handlePermanentDeleteClient: (clientId: string) => void | Promise<void>;

  // ─ أتعاب ─
  archivedFees: CaseFeeRow[];
  archivedFeesTotal: number;
  loadingArchivedFees: boolean;
  archivedFeesPage: number;
  setArchivedFeesPage: React.Dispatch<React.SetStateAction<number>>;
  restoringFeeId: string | null;
  handleRestoreFee: (feeId: string) => void | Promise<void>;
  confirmDeleteFee: CaseFeeRow | null;
  setConfirmDeleteFee: React.Dispatch<React.SetStateAction<CaseFeeRow | null>>;
  deletingFee: boolean;
  handlePermanentDeleteFee: (feeId: string) => void | Promise<void>;

  // ─ التبويب النشط (مُدار من AdminPanel عشان يتحكم في أي فetch يتنادى) ─
  archiveTab: ArchiveTabId;
  setArchiveTab: React.Dispatch<React.SetStateAction<ArchiveTabId>>;
}

// ── صف عام لعنصر مؤرشف (قضية/موكل/أتعاب) — نفس شكل البطاقة، بمحتوى مختلف ──
function ArchiveRow({
  title, subLines, deletedAt, isRestoring, onRestore, onDeleteClick,
}: {
  title: string;
  subLines: string[];
  deletedAt: string | null | undefined;
  isRestoring: boolean;
  onRestore: () => void;
  onDeleteClick: () => void;
}) {
  return React.createElement('div',{
    className:"bg-premium-card border border-white/5 rounded-2xl overflow-hidden"
  },
    React.createElement('div',{className:"p-3 space-y-1"},
      React.createElement('p',{className:"text-xs font-black text-white leading-tight"}, title || 'بدون عنوان'),
      React.createElement('div',{className:"flex flex-wrap gap-2 mt-1"},
        ...subLines.filter(Boolean).map((s, i) =>
          React.createElement('span',{key:i, className:"text-[9px] text-slate-500"}, s)),
        deletedAt && React.createElement('span',{className:"text-[9px] text-slate-600"},
          "أُرشف: "+formatArDate(deletedAt, {year:'numeric',month:'long',day:'numeric'}))
      )
    ),
    React.createElement('div',{
      className:"grid grid-cols-2 gap-px",
      style:{background:'rgba(255,255,255,0.04)'}
    },
      React.createElement('button',{
        onClick: onRestore,
        disabled: isRestoring,
        className:"flex items-center justify-center gap-1.5 py-2.5 bg-premium-card hover:bg-[#C9A84C]/10 transition-colors active:scale-95 disabled:opacity-50"
      },
        isRestoring
          ? React.createElement(I.Spin)
          : React.createElement(React.Fragment, null,
              React.createElement('span',{className:"text-xs"},"↩️"),
              React.createElement('span',{className:"text-[10px] font-bold text-[#C9A84C]"},"استرجاع")
            )
      ),
      React.createElement('button',{
        onClick: onDeleteClick,
        className:"flex items-center justify-center gap-1.5 py-2.5 bg-premium-card hover:bg-rose-500/10 transition-colors active:scale-95"
      },
        React.createElement('span',{className:"text-xs"},"🗑"),
        React.createElement('span',{className:"text-[10px] font-bold text-rose-400"},"حذف نهائي")
      )
    )
  );
}

// ── شريط ترقيم صفحات عام ──
function ArchivePagination({
  page, setPage, total, pageSize,
}: {
  page: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
  total: number;
  pageSize: number;
}) {
  if (total <= pageSize) return null;
  return React.createElement('div',{className:"flex items-center justify-between pt-1"},
    React.createElement('button',{
      onClick: () => setPage((p: number) => Math.max(0,p-1)),
      disabled: page===0,
      className:"flex items-center gap-1 px-3 py-1.5 rounded-xl text-[10px] font-bold bg-white/8 text-slate-300 disabled:opacity-30 active:scale-95 transition-transform"
    }, React.createElement(I.ChevronRight,{className:"w-3 h-3"}), "السابق"),
    React.createElement('p',{className:"text-[10px] text-slate-500"},
      `${page+1} / ${Math.ceil(total/pageSize)}`),
    React.createElement('button',{
      onClick: () => setPage((p: number) => p+1),
      disabled: (page+1)*pageSize>=total,
      className:"flex items-center gap-1 px-3 py-1.5 rounded-xl text-[10px] font-bold bg-white/8 text-slate-300 disabled:opacity-30 active:scale-95 transition-transform"
    }, "التالي", React.createElement(I.ChevronLeft,{className:"w-3 h-3"}))
  );
}

// ── حالة فاضية عامة ──
function ArchiveEmpty({ hasSearch, emptyLabel }: { hasSearch: boolean; emptyLabel: string }) {
  return React.createElement('div',{
    className:"bg-premium-card border border-white/5 rounded-xl p-8 text-center space-y-3"
  },
    React.createElement('div',{className:"w-10 h-10 rounded-xl bg-slate-500/10 flex items-center justify-center mx-auto"},
      React.createElement(IconArchive,{className:"w-5 h-5 text-slate-500"})),
    hasSearch
      ? React.createElement('p',{className:"text-slate-400 text-xs font-bold"},"لا توجد نتائج للبحث المحدد")
      : React.createElement('p',{className:"text-slate-400 text-xs font-bold"}, emptyLabel)
  );
}

function ArchiveSection(props: ArchiveSectionProps) {
  const {
    archiveSearchInput, handleArchiveSearchChange, ARCHIVE_PAGE_SIZE, clients,
    archivedCases, archivedCasesTotal, loadingArchivedCases,
    archivedCasesPage, setArchivedCasesPage,
    restoringCaseId, handleRestoreCase,
    confirmDeleteCase, setConfirmDeleteCase, deletingCase, handlePermanentDeleteCase,
    archivedClients, archivedClientsTotal, loadingArchivedClients,
    archivedClientsPage, setArchivedClientsPage,
    restoringClientId, handleRestoreClient,
    confirmDeleteClient, setConfirmDeleteClient, deletingClient, handlePermanentDeleteClient,
    archivedFees, archivedFeesTotal, loadingArchivedFees,
    archivedFeesPage, setArchivedFeesPage,
    restoringFeeId, handleRestoreFee,
    confirmDeleteFee, setConfirmDeleteFee, deletingFee, handlePermanentDeleteFee,
    archiveTab, setArchiveTab,
  } = props;

  const [searchPlaceholder] = useState<Record<ArchiveTabId,string>>({
    cases:'🔍 بحث بالاسم أو رقم القضية...',
    clients:'🔍 بحث باسم الموكل...',
    fees:'🔍 بحث باسم الموكل أو القضية...',
  });

  const tabs: { id: ArchiveTabId; label: string; icon: React.ReactNode; total: number }[] = [
    { id:'cases', label:'قضايا', icon: React.createElement(I.Brief,{className:"w-3.5 h-3.5"}), total: archivedCasesTotal },
    { id:'clients', label:'موكلين', icon: React.createElement(I.Person,{className:"w-3.5 h-3.5"}), total: archivedClientsTotal },
    { id:'fees', label:'أتعاب', icon: React.createElement(I.Money,{className:"w-3.5 h-3.5"}), total: archivedFeesTotal },
  ];

  return React.createElement(React.Fragment, null,

    React.createElement('div',{className:"space-y-3"},

      // ── تبويبات فرعية (قضايا/موكلين/أتعاب) ──
      React.createElement('div',{className:"grid grid-cols-3 gap-1.5"},
        ...tabs.map((t) => React.createElement('button',{
          key: t.id,
          onClick: () => setArchiveTab(t.id),
          className:"flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-bold transition-colors active:scale-95",
          style: archiveTab===t.id
            ? {background:'rgba(129,140,248,0.14)', color:'#818cf8', border:'1px solid rgba(129,140,248,0.3)'}
            : {background:'rgba(255,255,255,0.03)', color:'#94a3b8', border:'1px solid rgba(255,255,255,0.06)'}
        }, t.icon, t.label, React.createElement('span',{
          className:"text-[9px] opacity-70"
        }, `(${t.total})`)))
      ),

      // ── بحث موحّد (النص بيتغير حسب التبويب) ──
      React.createElement('div',{className:"relative"},
        React.createElement('input',{
          value: archiveSearchInput,
          onChange: (e: React.ChangeEvent<HTMLInputElement>) => handleArchiveSearchChange(e.target.value),
          maxLength: 100,
          placeholder: searchPlaceholder[archiveTab],
          className:"w-full p-2.5 pr-4 text-xs rounded-xl border border-white/10 bg-premium-card text-white placeholder-slate-500",
          style:{fontFamily:'Cairo,sans-serif'}
        }),
        archiveSearchInput && React.createElement('button',{
          onClick: () => handleArchiveSearchChange(''),
          className:"absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
        }, React.createElement(I.X,{className:"w-3.5 h-3.5"}))
      ),

      // ══════════════ تبويب القضايا ══════════════
      archiveTab === 'cases' && React.createElement(React.Fragment, null,
        React.createElement('p',{className:"text-[10px] text-slate-500 px-1"},
          loadingArchivedCases ? "جاري البحث..." :
          archivedCasesTotal > ARCHIVE_PAGE_SIZE
            ? `صفحة ${archivedCasesPage+1} من ${Math.ceil(archivedCasesTotal/ARCHIVE_PAGE_SIZE)} (${archivedCasesTotal} قضية مؤرشفة)`
            : `${archivedCasesTotal} قضية مؤرشفة`
        ),
        loadingArchivedCases
          ? React.createElement('div',{className:"flex items-center justify-center py-10 gap-2 text-slate-500 text-xs"},
              React.createElement(I.Spin), "جاري التحميل...")
          : archivedCases.length === 0
          ? React.createElement(ArchiveEmpty,{hasSearch: !!archiveSearchInput, emptyLabel:"لا توجد قضايا مؤرشفة حاليًا"})
          : React.createElement('div',{className:"space-y-2"},
              ...archivedCases.map((c: CaseRow) => {
                const clientName = clients.find((cl) => cl.id === c.client_id)?.full_name || null;
                return React.createElement(ArchiveRow,{
                  key: c.id,
                  title: c.title || 'بدون عنوان',
                  subLines: [
                    c.case_number_official ? "رقم القيد: "+c.case_number_official : '',
                    clientName ? "👤 "+clientName : '',
                  ],
                  deletedAt: c.deleted_at,
                  isRestoring: restoringCaseId === c.id,
                  onRestore: () => handleRestoreCase(c.id),
                  onDeleteClick: () => setConfirmDeleteCase(c),
                });
              }),
              React.createElement(ArchivePagination,{page:archivedCasesPage, setPage:setArchivedCasesPage, total:archivedCasesTotal, pageSize:ARCHIVE_PAGE_SIZE})
            )
      ),

      // ══════════════ تبويب الموكلين ══════════════
      archiveTab === 'clients' && React.createElement(React.Fragment, null,
        React.createElement('p',{className:"text-[10px] text-slate-500 px-1"},
          loadingArchivedClients ? "جاري البحث..." :
          archivedClientsTotal > ARCHIVE_PAGE_SIZE
            ? `صفحة ${archivedClientsPage+1} من ${Math.ceil(archivedClientsTotal/ARCHIVE_PAGE_SIZE)} (${archivedClientsTotal} موكل مؤرشف)`
            : `${archivedClientsTotal} موكل مؤرشف`
        ),
        loadingArchivedClients
          ? React.createElement('div',{className:"flex items-center justify-center py-10 gap-2 text-slate-500 text-xs"},
              React.createElement(I.Spin), "جاري التحميل...")
          : archivedClients.length === 0
          ? React.createElement(ArchiveEmpty,{hasSearch: !!archiveSearchInput, emptyLabel:"لا يوجد موكلين مؤرشفين حاليًا"})
          : React.createElement('div',{className:"space-y-2"},
              ...archivedClients.map((cl: ClientRow) =>
                React.createElement(ArchiveRow,{
                  key: cl.id,
                  title: cl.full_name || cl.client_name || 'بدون اسم',
                  subLines: [
                    cl.phone ? "📞 "+cl.phone : '',
                    cl.national_id ? "الهوية: "+cl.national_id : '',
                  ],
                  deletedAt: cl.deleted_at,
                  isRestoring: restoringClientId === cl.id,
                  onRestore: () => handleRestoreClient(cl.id),
                  onDeleteClick: () => setConfirmDeleteClient(cl),
                })
              ),
              React.createElement(ArchivePagination,{page:archivedClientsPage, setPage:setArchivedClientsPage, total:archivedClientsTotal, pageSize:ARCHIVE_PAGE_SIZE})
            )
      ),

      // ══════════════ تبويب الأتعاب ══════════════
      archiveTab === 'fees' && React.createElement(React.Fragment, null,
        React.createElement('p',{className:"text-[10px] text-slate-500 px-1"},
          loadingArchivedFees ? "جاري البحث..." :
          archivedFeesTotal > ARCHIVE_PAGE_SIZE
            ? `صفحة ${archivedFeesPage+1} من ${Math.ceil(archivedFeesTotal/ARCHIVE_PAGE_SIZE)} (${archivedFeesTotal} سجل أتعاب مؤرشف)`
            : `${archivedFeesTotal} سجل أتعاب مؤرشف`
        ),
        loadingArchivedFees
          ? React.createElement('div',{className:"flex items-center justify-center py-10 gap-2 text-slate-500 text-xs"},
              React.createElement(I.Spin), "جاري التحميل...")
          : archivedFees.length === 0
          ? React.createElement(ArchiveEmpty,{hasSearch: !!archiveSearchInput, emptyLabel:"لا توجد أتعاب مؤرشفة حاليًا"})
          : React.createElement('div',{className:"space-y-2"},
              ...archivedFees.map((f: CaseFeeRow) =>
                React.createElement(ArchiveRow,{
                  key: f.id,
                  title: f.client_name || 'بدون اسم موكل',
                  subLines: [
                    f.case_title ? "📁 "+f.case_title : '',
                    f.total_fees != null ? "الإجمالي: "+f.total_fees : '',
                  ],
                  deletedAt: f.deleted_at,
                  isRestoring: restoringFeeId === f.id,
                  onRestore: () => handleRestoreFee(f.id),
                  onDeleteClick: () => setConfirmDeleteFee(f),
                })
              ),
              React.createElement(ArchivePagination,{page:archivedFeesPage, setPage:setArchivedFeesPage, total:archivedFeesTotal, pageSize:ARCHIVE_PAGE_SIZE})
            )
      )
    ),

    // ── تأكيد الحذف النهائي (mode ثابتة 'delete' — العنصر أصلاً مؤرشف، مفيش داعي لشاشة اختيار أرشفة/حذف تاني) ──
    confirmDeleteCase && React.createElement(DeleteConfirmModal, {
      title: 'حذف القضية نهائياً',
      itemName: confirmDeleteCase.title || 'القضية',
      itemType: 'القضية',
      mode: 'delete',
      loading: deletingCase,
      onConfirm: () => handlePermanentDeleteCase(confirmDeleteCase.id),
      onCancel: () => setConfirmDeleteCase(null),
      deleteConsequences: [
        'سيُحذف نهائيًا: بيانات القضية، الجلسات، المستندات المرفوعة (والملفات الفعلية)، وأي عناصر أخرى تابعة للقضية فقط.',
        'الأتعاب والفواتير المرتبطة بالقضية تفضل محفوظة بالكامل — بس رابطها بالقضية بيتصفّر.',
        'لا يمكن التراجع عن هذا الإجراء.',
      ],
    }),

    confirmDeleteClient && React.createElement(DeleteConfirmModal, {
      title: 'حذف الموكل نهائياً',
      itemName: confirmDeleteClient.full_name || confirmDeleteClient.client_name || 'الموكل',
      itemType: 'الموكل',
      mode: 'delete',
      loading: deletingClient,
      onConfirm: () => handlePermanentDeleteClient(confirmDeleteClient.id),
      onCancel: () => setConfirmDeleteClient(null),
      deleteConsequences: [
        'سيُحذف نهائيًا: بيانات الموكل، ورسائل/جلسات/أكواد بوابة الموكل الخاصة به فقط.',
        'القضايا والأتعاب المرتبطة بالموكل تفضل محفوظة بالكامل — بس رابطها بالموكل بيتصفّر.',
        'لا يمكن التراجع عن هذا الإجراء.',
      ],
    }),

    confirmDeleteFee && React.createElement(DeleteConfirmModal, {
      title: 'حذف الأتعاب نهائياً',
      itemName: confirmDeleteFee.client_name || confirmDeleteFee.case_title || 'سجل الأتعاب',
      itemType: 'سجل الأتعاب',
      mode: 'delete',
      loading: deletingFee,
      onConfirm: () => handlePermanentDeleteFee(confirmDeleteFee.id),
      onCancel: () => setConfirmDeleteFee(null),
      deleteConsequences: [
        'سيُحذف نهائيًا: سجل الأتعاب ودفعاته المرتبطة به فقط.',
        'الفاتورة الصادرة (لو موجودة) تفضل محفوظة بالكامل — بس رابطها بالأتعاب بيتصفّر.',
        'لا يمكن التراجع عن هذا الإجراء.',
      ],
    })
  );
}

export default ArchiveSection;
