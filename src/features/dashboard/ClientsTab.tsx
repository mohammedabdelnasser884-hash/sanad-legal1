import React, { useState, useRef, useEffect } from 'react';
import { I } from '../../constants';
import type { MappedCase, MappedClient } from '../../hooks/useAppData';

const PAGE_SIZE = 20;

const SearchIcon = () => React.createElement('svg',{className:"w-4 h-4",fill:"none",viewBox:"0 0 24 24",strokeWidth:"2.2",stroke:"currentColor"},
  React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607z"})
);

// امتداد نوعي لـ window عشان مؤقت البحث المؤجّل (debounce) — نفس التقنية
// اللي الكود الأصلي كان بيعملها بـ `window as any`، بس هنا موثّقة بنوع صريح.
interface WindowWithClientSearchTimer extends Window {
  _clientSearchTimer?: ReturnType<typeof setTimeout>;
}

interface ClientsTabProps {
  cases: MappedCase[];
  clients: MappedClient[];
  clientSearch: string;
  setClientSearch: (v: string) => void;
  clientsPage: number;
  setClientsPage: (n: number) => void;
  clientsTotal: number;
  clientsLoading: boolean;
  fetchClients: (page?: number, search?: string) => void;
  setSelectedClient: (c: MappedClient) => void;
  setShowClientModal: (v: boolean) => void;
}

function ClientsTab({ cases, clients, clientSearch, setClientSearch, clientsPage, setClientsPage, clientsTotal, clientsLoading, fetchClients, setSelectedClient, setShowClientModal }: ClientsTabProps) {
  const [searchOpen, setSearchOpen]   = useState(false);
  const [activeTab,  setActiveTab]    = useState<'individual'|'entity'>('individual');
  const searchRef = useRef<HTMLInputElement>(null);

  // ── لما يتضاف موكل جديد، روح للتاب الصح تلقائي ──
  const prevLengthRef = useRef(clients.length);
  useEffect(() => {
    if (clients.length > prevLengthRef.current && clients.length > 0) {
      const newest = clients[0]; // المضاف الجديد دايمًا أول واحد (order by created_at desc)
      const isEntity = newest.type === 'company' || newest.type === 'government';
      setActiveTab(isEntity ? 'entity' : 'individual');
    }
    prevLengthRef.current = clients.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients.length]);

  useEffect(() => {
    if (searchOpen && searchRef.current) searchRef.current.focus();
  }, [searchOpen]);

  const isEntity = (c: MappedClient) => c.type === 'company' || c.type === 'government';
  const filtered  = clients.filter((c: MappedClient) => activeTab === 'individual' ? !isEntity(c) : isEntity(c));
  const indCount  = clients.filter((c: MappedClient) => !isEntity(c)).length;
  const entCount  = clients.filter((c: MappedClient) =>  isEntity(c)).length;

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setClientSearch(val);
    const win = window as unknown as WindowWithClientSearchTimer;
    clearTimeout(win._clientSearchTimer);
    win._clientSearchTimer = setTimeout(() => fetchClients(0, val), 500);
  };

  const handleClearSearch = () => {
    setClientSearch('');
    fetchClients(0, '');
    if (searchRef.current) searchRef.current.focus();
  };

  const handleToggleSearch = () => {
    if (searchOpen) { setClientSearch(''); fetchClients(0, ''); }
    setSearchOpen((s: boolean) => !s);
  };

  return React.createElement(React.Fragment, null,

    // ── هيدر ──
    React.createElement('div', {className:"flex items-center justify-between"},
      React.createElement('h3', {className:"text-sm font-black text-white"}, "سجل الموكلين"),
      React.createElement('div', {className:"flex items-center gap-2"},
        React.createElement('button', {
          onClick: handleToggleSearch,
          title: "بحث",
          className: `w-8 h-8 flex items-center justify-center rounded-xl transition-all active:scale-95 ${
            searchOpen
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              : 'bg-white/5 text-slate-400 border border-white/10 hover:text-white'
          }`
        }, React.createElement(SearchIcon)),
        React.createElement('button', {
          onClick: () => setShowClientModal(true),
          'data-testid': 'new-client-button',
          className:"flex items-center bg-gradient-to-tr from-emerald-500 to-emerald-400 text-white px-3 py-2 rounded-xl text-xs font-black shadow-lg gap-1 active:scale-95 transition-transform"
        }, React.createElement(I.Plus), "موكل جديد")
      )
    ),

    // ── حقل البحث ──
    searchOpen && React.createElement('div', {className:"relative"},
      React.createElement('input', {
        ref: searchRef,
        type:"text", value:clientSearch,
        onChange: handleSearchChange,
        maxLength:100,
        placeholder:"🔍 ابحث بالاسم أو الموبايل أو الرقم القومي...",
        className:"w-full p-3 pr-4 text-xs rounded-xl border border-white/10 bg-premium-card text-white placeholder-slate-500 transition-colors",
        style:{fontFamily:'Cairo,sans-serif'}
      }),
      clientSearch && React.createElement('button', {
        onClick: handleClearSearch,
        className:"absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-xs"
      }, "✕")
    ),

    // ── التابين ──
    React.createElement('div', {
      className:"flex gap-2 p-1 rounded-2xl",
      style:{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.07)'}
    },
      // أفراد
      React.createElement('button', {
        onClick: () => setActiveTab('individual'),
        className:`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-black transition-all ${
          activeTab==='individual'
            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
            : 'text-slate-500 hover:text-slate-300 border border-transparent'
        }`
      },
        React.createElement('span',{className:"text-xl leading-none"},"🧑"),
        "أفراد",
        indCount > 0 && React.createElement('span',{
          className:`text-[9px] font-black px-1.5 py-0.5 rounded-full ${activeTab==='individual'?'bg-emerald-500/30 text-emerald-300':'bg-white/5 text-slate-500'}`
        }, indCount)
      ),
      // شركات
      React.createElement('button', {
        onClick: () => setActiveTab('entity'),
        className:`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-black transition-all ${
          activeTab==='entity'
            ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
            : 'text-slate-500 hover:text-slate-300 border border-transparent'
        }`
      },
        React.createElement('span',{className:"text-xl leading-none"},"🏢"),
        "شركات",
        entCount > 0 && React.createElement('span',{
          className:`text-[9px] font-black px-1.5 py-0.5 rounded-full ${activeTab==='entity'?'bg-blue-500/30 text-blue-300':'bg-white/5 text-slate-500'}`
        }, entCount)
      )
    ),

    // ── القائمة ──
    clientsLoading && clients.length===0
      ? React.createElement('div',{className:"flex items-center justify-center py-16 gap-2 text-slate-500 text-xs"},
          React.createElement(I.Spin),"جاري الجلب..."
        )
      : filtered.length===0
      ? React.createElement('div',{className:"bg-premium-card border border-white/5 rounded-xl p-10 text-center space-y-3"},
          React.createElement('div',{
            className:`w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-2 ${activeTab==='individual'?'bg-emerald-500/10 text-emerald-400':'bg-blue-500/10 text-blue-400'}`
          },
            activeTab==='individual'
              ? React.createElement(I.Person)
              : React.createElement('svg',{className:"w-5 h-5",fill:"none",viewBox:"0 0 24 24",strokeWidth:"1.5",stroke:"currentColor"},
                  React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21"})
                )
          ),
          React.createElement('p',{className:`font-black ${activeTab==='individual'?'text-emerald-400':'text-blue-400'}`},
            clientSearch ? `لا توجد نتائج لـ "${clientSearch}"` : activeTab==='individual' ? "لا يوجد أفراد بعد" : "لا توجد شركات بعد"
          ),
          React.createElement('p',{className:"text-slate-500 text-xs"},
            clientSearch ? "جرب كلمة بحث مختلفة" : "اضغط على موكل جديد للإضافة."
          )
        )
      : React.createElement('div',{className:"space-y-2"},
          filtered.map((c: MappedClient) => {
            const caseCount = cases.filter((ca: MappedCase) => ca.client_id===c.id).length;
            const ent = isEntity(c);
            const typeLabel = c.type==='company'?'شركة':c.type==='government'?'جهة حكومية':'فرد';
            return React.createElement('div',{
              key:c.id,
              onClick:()=>setSelectedClient(c),
              'data-testid': 'client-card',
              className:"bg-premium-card border border-white/5 rounded-xl px-3 py-2.5 active:scale-[0.98] transition-all cursor-pointer"
            },
              React.createElement('div',{className:"flex items-center gap-2.5"},
                React.createElement('div',{
                  className:`w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs shrink-0 ${ent?'bg-blue-500/10 text-blue-400':'bg-emerald-500/10 text-emerald-400'}`
                },
                  ent
                    ? React.createElement('svg',{className:"w-4 h-4",fill:"none",viewBox:"0 0 24 24",strokeWidth:"2",stroke:"currentColor"},
                        React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21"})
                      )
                    : (c.full_name||'م').charAt(0)
                ),
                React.createElement('div',{className:"flex-1 min-w-0"},
                  React.createElement('p',{className:"text-[12px] font-black text-white truncate"},c.full_name),
                  React.createElement('div',{className:"flex items-center gap-2 mt-0.5 flex-wrap"},
                    React.createElement('span',{
                      className:`text-[8px] font-bold px-1.5 py-0.5 rounded-full ${ent?'bg-blue-500/10 text-blue-400':'bg-emerald-500/10 text-emerald-400'}`
                    }, typeLabel),
                    c.phone&&React.createElement('span',{className:"text-[9px] text-slate-500"},c.phone),
                    caseCount>0&&React.createElement('span',{
                      className:"text-[8px] font-black px-1.5 py-0.5 rounded-full",
                      style:{background:'rgba(212,175,55,0.1)',color:'#D4AF37'}
                    }, caseCount+' قضية')
                  )
                ),
                React.createElement('svg',{className:"w-3.5 h-3.5 text-slate-600 shrink-0",fill:"none",viewBox:"0 0 24 24",strokeWidth:"2.5",stroke:"currentColor"},
                  React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"M15.75 19.5 8.25 12l7.5-7.5"})
                )
              )
            );
          }),
          clientsTotal>PAGE_SIZE&&React.createElement('div',{className:"flex items-center justify-between gap-2 pt-1"},
            React.createElement('button',{
              onClick:()=>{const p=clientsPage-1;setClientsPage(p);fetchClients(p,clientSearch);},
              disabled:clientsPage===0||clientsLoading,
              className:"flex-1 py-2.5 rounded-xl text-xs font-black active:scale-[0.98] transition-all disabled:opacity-30",
              style:{background:'rgba(52,211,153,0.06)',border:'1px solid rgba(52,211,153,0.18)',color:'#34d399'}
            },"→ السابق"),
            React.createElement('span',{className:"text-[10px] text-slate-500 font-black whitespace-nowrap"},
              `${clientsPage*PAGE_SIZE+1}–${Math.min((clientsPage+1)*PAGE_SIZE,clientsTotal)} / ${clientsTotal}`
            ),
            React.createElement('button',{
              onClick:()=>{const p=clientsPage+1;setClientsPage(p);fetchClients(p,clientSearch);},
              disabled:(clientsPage+1)*PAGE_SIZE>=clientsTotal||clientsLoading,
              className:"flex-1 py-2.5 rounded-xl text-xs font-black active:scale-[0.98] transition-all disabled:opacity-30",
              style:{background:'rgba(52,211,153,0.06)',border:'1px solid rgba(52,211,153,0.18)',color:'#34d399'}
            },"التالي ←")
          )
        )
  );
}

export default ClientsTab;
