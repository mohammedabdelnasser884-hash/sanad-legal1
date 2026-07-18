import React, { useState } from 'react';
import { I } from '../../constants';
import { formatArDate } from '../../shared/ui/arabicLocale';
import { useAIAssistant } from './hooks/useAIAssistant';
import type { AIMessage, AITopic, LegalArticle, GroqModel, DocTemplateConfig } from './hooks/aiAssistantTypes';
import type { ClientRow, ProfileRow } from '../../types';
import type { MappedCase } from '../../hooks/useAppData';

interface ApiKeyInputProps {
    onSave: (key: string) => void;
    onCancel: () => void;
    initial: string;
}

function ApiKeyInput({onSave, onCancel, initial}: ApiKeyInputProps){
    const [val,setVal]=useState(initial||'');
    const [show,setShow]=useState(false);
    return React.createElement('div',{className:"space-y-3"},
        React.createElement('div',{className:"relative"},
            React.createElement('input',{
                type:show?'text':'password',
                value:val,
                onChange:(e: React.ChangeEvent<HTMLInputElement>) =>setVal(e.target.value),
                placeholder:"AIzaSy...",
                className:"w-full p-3 text-xs rounded-xl border border-white/10 bg-premium-bg text-white placeholder-slate-600 pl-10",
                style:{fontFamily:'monospace',direction:'ltr',textAlign:'left'}
            }),
            React.createElement('button',{type:"button",onClick:()=>setShow(!show),className:"absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-premium-gold"},
                React.createElement(I.Eye)
            )
        ),
        React.createElement('div',{className:"flex gap-2"},
            React.createElement('button',{
                onClick:()=>onSave(val.trim()),
                disabled:val.trim().length < 10,
                className:"flex-1 py-3 rounded-xl font-black text-sm text-premium-bg disabled:opacity-40 active:scale-95 transition-all",
                style:{background:'linear-gradient(135deg,#D4AF37,#E8C84A)'}
            },"حفظ وتفعيل"),
            React.createElement('button',{onClick:onCancel,className:"px-4 py-3 bg-white/5 text-slate-400 rounded-xl text-xs font-bold active:scale-95"},"إلغاء")
        )
    );
}

// ══════════════════════════════════════════
//  AI المساعد القانوني — Professional Legal Expert
// ══════════════════════════════════════════

interface AILegalAssistantProps {
    onClose: () => void;
    cases: MappedCase[];
    clients: ClientRow[];
    profile: ProfileRow | null;
    country: string;
}

function AILegalAssistant({onClose, cases, clients, profile, country}: AILegalAssistantProps){
    const [disclaimerOpen, setDisclaimerOpen] = useState(true);
    const {
      mode, setMode,
      selectedModel, setSelectedModel, GROQ_MODELS,
      hasKey, keyLoading, showKeyInput, setShowKeyInput, saveKey,
      messages, setMessages, input, setInput, loading,
      topics, activeTopicId, setActiveTopicId,
      showTopics, setShowTopics, newTopic, deleteTopic,
      selectedCase, setSelectedCase,
      docType, setDocType, docFields, sf,
      generatedDoc, setGeneratedDoc, generatingDoc,
      copied, copyDoc, printDoc, downloadPDF, generateDocument,
      sendMessage, inputRef, messagesEndRef,
      today, activeCfg, DOC_TEMPLATES, colorMap,
    } = useAIAssistant(cases, clients, profile, country);

    return React.createElement('div',{className:"fixed inset-0 z-50 flex flex-col bg-premium-bg fade-in"},
        // ── Ambient background ──
        React.createElement('div',{className:"absolute inset-0 pointer-events-none overflow-hidden"},
            React.createElement('div',{className:"absolute -top-32 -right-32 w-96 h-96 rounded-full orb-pulse",style:{background:'radial-gradient(circle, rgba(212,175,55,0.08) 0%, transparent 70%)'}}),
            React.createElement('div',{className:"absolute -bottom-32 -left-32 w-96 h-96 rounded-full orb-pulse",style:{background:'radial-gradient(circle, rgba(99,102,241,0.07) 0%, transparent 70%)',animationDelay:'1.5s'}})
        ),

        // ── API Key Modal ──
        showKeyInput && React.createElement('div',{className:"absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-6"},
            React.createElement('div',{className:"w-full max-w-sm bg-premium-card border border-premium-gold/20 rounded-3xl p-6 slide-up shadow-2xl"},
                React.createElement('div',{className:"flex items-center gap-3 mb-5"},
                    React.createElement('div',{className:"w-10 h-10 rounded-2xl flex items-center justify-center shrink-0",style:{background:'linear-gradient(135deg,#D4AF37,#E8C84A)'}},
                        React.createElement(I.Lock)
                    ),
                    React.createElement('div',null,
                        React.createElement('h3',{className:"text-sm font-black text-white"},"Groq API Key"),
                        React.createElement('p',{className:"text-[10px] text-emerald-400 font-bold"},"مجاني وسريع جداً ✓")
                    )
                ),
                React.createElement('p',{className:"text-[11px] text-slate-400 mb-4 leading-relaxed"},
                    "احصل على Key المجاني من ",
                    React.createElement('span',{className:"text-premium-gold font-bold"},"console.groq.com"),
                    " ← API Keys ← Create API Key"
                ),
                React.createElement(ApiKeyInput,{onSave:saveKey,onCancel:()=>setShowKeyInput(false),initial:''})
            )
        ),

        // ── Topics Panel ──
        showTopics && React.createElement('div',{className:"absolute inset-0 z-40 flex flex-col",style:{background:'rgba(5,10,21,0.97)',backdropFilter:'blur(20px)'}},
            React.createElement('div',{className:"flex items-center justify-between px-4 pt-4 pb-3 border-b border-white/5 shrink-0"},
                React.createElement('h3',{className:"text-sm font-black text-white"},"📚 الموضوعات المحفوظة"),
                React.createElement('div',{className:"flex gap-2"},
                    React.createElement('button',{
                        onClick:newTopic,
                        className:"px-3 py-1.5 rounded-xl text-[10px] font-black text-premium-bg flex items-center gap-1.5",
                        style:{background:'linear-gradient(135deg,#D4AF37,#E8C84A)'}
                    },
                        React.createElement('svg',{className:"w-3 h-3",fill:"none",viewBox:"0 0 24 24",strokeWidth:"3",stroke:"currentColor"},React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"M12 4.5v15m7.5-7.5h-15"})),
                        "موضوع جديد"
                    ),
                    React.createElement('button',{onClick:()=>setShowTopics(false),className:"w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 active:scale-90"},
                        React.createElement(I.X)
                    )
                )
            ),
            topics.length === 0
                ? React.createElement('div',{className:"flex-1 flex flex-col items-center justify-center gap-3 text-center p-8"},
                    React.createElement('div',{className:"w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center text-2xl"},"📂"),
                    React.createElement('p',{className:"text-sm font-bold text-slate-400"},"لا توجد موضوعات محفوظة"),
                    React.createElement('p',{className:"text-xs text-slate-600"},"ابدأ محادثة جديدة وستُحفظ تلقائياً"),
                    React.createElement('button',{
                        onClick:newTopic,
                        className:"mt-2 px-5 py-2.5 rounded-xl text-xs font-black text-premium-bg",
                        style:{background:'linear-gradient(135deg,#D4AF37,#E8C84A)'}
                    },"ابدأ محادثة جديدة")
                  )
                : React.createElement('div',{className:"flex-1 overflow-y-auto no-scrollbar p-4 space-y-2"},
                    topics.map((t: AITopic) => React.createElement('div',{
                        key:t.id,
                        className:`flex items-center gap-3 p-3 rounded-2xl border cursor-pointer transition-all ${activeTopicId===t.id?'bg-premium-gold/10 border-premium-gold/30':'bg-white/3 border-white/5 hover:border-white/10'}`
                    },
                        React.createElement('div',{
                            className:"flex-1 min-w-0",
                            onClick:()=>{setActiveTopicId(t.id);setShowTopics(false);}
                        },
                            React.createElement('p',{className:`text-xs font-bold truncate ${activeTopicId===t.id?'text-premium-gold':'text-slate-300'}`}, t.title),
                            React.createElement('p',{className:"text-[10px] text-slate-600 mt-0.5"},
                                t.messages.length - 1 + ' رسالة · ' + formatArDate(t.createdAt)
                            )
                        ),
                        React.createElement('button',{
                            onClick:(e: React.MouseEvent) =>{e.stopPropagation();deleteTopic(t.id);},
                            className:"w-7 h-7 rounded-lg bg-rose-500/10 text-rose-400 flex items-center justify-center shrink-0 active:scale-90 hover:bg-rose-500/20 transition-all"
                        },
                            React.createElement('svg',{className:"w-3.5 h-3.5",fill:"none",viewBox:"0 0 24 24",strokeWidth:"2",stroke:"currentColor"},React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"}))
                        )
                    ))
                  )
        ),

        // ── Header ──
        React.createElement('div',{className:"relative shrink-0 px-4 pt-4 pb-3 border-b border-white/5",style:{background:'rgba(13,21,39,0.95)',backdropFilter:'blur(20px)'}},
            React.createElement('div',{className:"flex items-center justify-between"},
                React.createElement('div',{className:"flex items-center gap-3"},
                    React.createElement('div',{className:"relative"},
                        React.createElement('div',{className:"w-10 h-10 rounded-2xl flex items-center justify-center",style:{background:'linear-gradient(135deg, #D4AF37, #E8C84A)'}},
                            React.createElement(I.AI,{cls:"w-5 h-5 text-premium-bg"})
                        ),
                        React.createElement('div',{className:"absolute -bottom-0.5 -left-0.5 w-3 h-3 bg-emerald-400 rounded-full border-2 border-premium-bg"})
                    ),
                    React.createElement('div',null,
                        React.createElement('h2',{className:"text-sm font-black text-white"},"المساعد القانوني الاحترافي"),
                        React.createElement('p',{className:"text-[10px] text-emerald-400 font-bold"},"⚖️ متخصص · مواد قانونية · أسانيد موثقة")
                    )
                ),
                React.createElement('div',{className:"flex items-center gap-2"},
                    // ── Model selector ──
                    React.createElement('select',{
                        value: selectedModel,
                        onChange: (e: React.ChangeEvent<HTMLSelectElement>) => setSelectedModel(e.target.value),
                        title: "اختار نموذج الذكاء الاصطناعي",
                        className: "text-[9px] font-bold bg-white/5 border border-white/10 text-slate-300 rounded-lg px-1.5 py-1 appearance-none cursor-pointer hover:border-premium-gold/30 transition-all",
                        style: {maxWidth:'110px'}
                    },
                        GROQ_MODELS.map((m: GroqModel) => React.createElement('option',{key:m.id, value:m.id, style:{background:'#0d1a2e'}}, m.label))
                    ),
                    React.createElement('button',{
                        onClick:()=>setShowKeyInput(true),
                        title:"إعدادات API Key",
                        className:`w-9 h-9 rounded-xl flex items-center justify-center border transition-all active:scale-90 ${hasKey?'bg-emerald-500/10 border-emerald-500/20 text-emerald-400':'bg-rose-500/10 border-rose-500/20 text-rose-400'}`
                    },
                        hasKey
                            ? React.createElement('svg',{className:"w-3.5 h-3.5",fill:"none",viewBox:"0 0 24 24",strokeWidth:"2",stroke:"currentColor"},React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"m4.5 12.75 6 6 9-13.5"}))
                            : React.createElement(I.Lock)
                    ),
                    React.createElement('button',{
                        onClick:()=>setShowTopics((p: boolean) =>!p),
                        title:"الموضوعات المحفوظة",
                        className:`w-9 h-9 rounded-xl flex items-center justify-center border transition-all active:scale-90 ${showTopics?'bg-premium-gold/20 border-premium-gold/30 text-premium-gold':'bg-white/5 border-white/10 text-slate-400'}`
                    },
                        React.createElement('svg',{className:"w-4 h-4",fill:"none",viewBox:"0 0 24 24",strokeWidth:"2",stroke:"currentColor"},
                            React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z"})
                        )
                    ),
                    React.createElement('button',{onClick:onClose,className:"w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white active:scale-90 transition-all"},
                        React.createElement(I.X)
                    )
                )
            ),
            // Mode tabs
            React.createElement('div',{className:"flex gap-2 mt-3"},
                React.createElement('button',{onClick:()=>setMode('chat'),className:`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-black transition-all ${mode==='chat'?'bg-gradient-to-r from-premium-gold/20 to-amber-300/10 text-premium-gold border border-premium-gold/30':'text-slate-500 hover:text-slate-300 border border-white/5'}`},
                    React.createElement(I.AI,{cls:"w-3.5 h-3.5"}), "استشارة قانونية"
                ),
                React.createElement('button',{onClick:()=>setMode('generate'),className:`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-black transition-all ${mode==='generate'?'bg-gradient-to-r from-purple-500/20 to-purple-400/10 text-purple-300 border border-purple-500/30':'text-slate-500 hover:text-slate-300 border border-white/5'}`},
                    React.createElement(I.Doc), "توليد مستند"
                )
            )
        ),

        // ── تنبيه قانوني ثابت: مش استشارة ملزمة، لازم مراجعة محامٍ مرخّص.
        //    قابل للطي بس مش قابل للإغلاق النهائي — بيفضل شريط رفيع
        //    فوق دايمًا كتذكير مستمر طول الجلسة. ──
        React.createElement('div',{
            className:"shrink-0 px-4 py-1.5 flex items-center gap-2 border-b border-amber-400/10 cursor-pointer select-none",
            style:{background:'rgba(212,175,55,0.06)'},
            onClick:()=>setDisclaimerOpen((p: boolean)=>!p)
        },
            React.createElement('span',{className:"text-[10px]"},"⚠️"),
            disclaimerOpen
                ? React.createElement('p',{className:"flex-1 text-[9.5px] leading-relaxed text-amber-200/90 font-bold"},
                    "أداة استرشادية بالذكاء الاصطناعي ولا تُغني عن استشارة محامٍ مرخّص — راجع أي معلومة أو مستند مع مختص قبل الاعتماد عليه رسميًا."
                  )
                : React.createElement('p',{className:"flex-1 text-[9.5px] text-amber-200/70 font-bold"}, "تنبيه قانوني — اضغط للعرض"),
            React.createElement('span',{className:"text-[9px] text-amber-200/50 shrink-0"}, disclaimerOpen ? "إخفاء ▲" : "▼")
        ),

        // ══ CHAT MODE ══
        mode === 'chat' && React.createElement(React.Fragment, null,
            // Case picker
            cases.length > 0 && React.createElement('div',{className:"shrink-0 px-4 pt-3 pb-2"},
                React.createElement('div',{className:"flex gap-2 overflow-x-auto no-scrollbar pb-1"},
                    React.createElement('button',{
                        onClick:()=>setSelectedCase(null),
                        className:`shrink-0 px-3 py-1.5 rounded-xl text-[10px] font-black transition-all ${!selectedCase?'bg-premium-gold/20 text-premium-gold border border-premium-gold/30':'bg-white/5 text-slate-500 border border-white/5'}`
                    },"عام"),
                    cases.slice(0,8).map((c: MappedCase) =>React.createElement('button',{
                        key:c.id,
                        onClick:()=>setSelectedCase(c),
                        className:`shrink-0 px-3 py-1.5 rounded-xl text-[10px] font-black transition-all whitespace-nowrap max-w-[140px] truncate ${selectedCase?.id===c.id?'bg-premium-gold/20 text-premium-gold border border-premium-gold/30':'bg-white/5 text-slate-500 border border-white/5'}`
                    }, c.title))
                )
            ),

            // Messages
            React.createElement('div',{className:"flex-1 overflow-y-auto no-scrollbar px-4 py-3 space-y-4"},
                messages.map((m: AIMessage, i: number) => React.createElement('div',{
                    key:i,
                    className:"space-y-1.5"
                },
                    React.createElement('div',{
                        className:`flex gap-2.5 msg-in ${m.role==='user'?'flex-row-reverse':''}`
                    },
                        m.role==='assistant'
                            ? React.createElement('div',{className:"shrink-0 w-8 h-8 rounded-xl flex items-center justify-center",style:{background:'linear-gradient(135deg,#D4AF37,#E8C84A)'}},
                                React.createElement(I.AI,{cls:"w-4 h-4 text-premium-bg"})
                              )
                            : React.createElement('div',{className:"shrink-0 w-8 h-8 rounded-xl bg-indigo-500/20 border border-indigo-500/20 flex items-center justify-center text-[11px] font-black text-indigo-300"},
                                (profile?.full_name||'م').charAt(0)
                              ),
                        React.createElement('div',{
                            className:`max-w-[82%] px-4 py-3 rounded-2xl text-xs leading-relaxed font-medium ${m.role==='assistant'
                                ? 'bg-premium-card border border-white/5 text-slate-200 rounded-tr-sm'
                                : 'text-white rounded-tl-sm'
                            }`,
                            style: m.role==='user' ? {background:'linear-gradient(135deg,#4f46e5,#6366f1)'} : {}
                        }, m.text.split('\n').map((line: string,j: number,arr: string[])=>React.createElement(React.Fragment,{key:j},line,j<arr.length-1&&React.createElement('br'))))
                    ),

                    // ── المراجع القانونية المستخدمة ──
                    m.role==='assistant' && m.references && m.references.length > 0 && React.createElement('div',{
                        style:{marginInlineStart:'42px'},
                        className:"max-w-[82%] bg-premium-card/60 border border-amber-400/15 rounded-xl p-3 space-y-2"
                    },
                        React.createElement('p',{className:"text-[10px] font-black text-amber-400 flex items-center gap-1.5"},
                            React.createElement(I.Doc), "المراجع القانونية المستخدمة"
                        ),
                        m.references.map((r: LegalArticle,k: number)=> React.createElement('div',{
                            key:k,
                            className:`pt-1.5 ${k>0 ? 'border-t border-white/5':''}`
                        },
                            React.createElement('p',{className:"text-[10px] font-bold text-slate-300"},
                                `${r.law_title}${r.law_number?` رقم ${r.law_number}`:''}${r.law_year?` لسنة ${r.law_year}`:''} — المادة ${r.article_number}`
                            ),
                            React.createElement('p',{className:"text-[10px] text-slate-500 mt-1 leading-relaxed"},
                                r.article_text && r.article_text.length > 260 ? r.article_text.slice(0,260)+'…' : r.article_text
                            )
                        ))
                    )
                )),
                loading && React.createElement('div',{className:"flex gap-2.5 msg-in"},
                    React.createElement('div',{className:"shrink-0 w-8 h-8 rounded-xl flex items-center justify-center ai-shimmer"},
                        React.createElement(I.AI,{cls:"w-4 h-4 text-premium-bg"})
                    ),
                    React.createElement('div',{className:"bg-premium-card border border-premium-gold/20 px-4 py-3 rounded-2xl rounded-tr-sm flex items-center gap-2"},
                        React.createElement('span',{className:"text-[10px] text-slate-400 font-bold"},"يبحث في القانون"),
                        React.createElement('div',{className:"flex gap-1"},
                            [0,1,2].map((k: number) =>React.createElement('div',{key:k,className:"w-1.5 h-1.5 rounded-full bg-premium-gold typing-dot"}))
                        )
                    )
                ),
                React.createElement('div',{ref:messagesEndRef})
            ),

            // Suggested prompts
            messages.length < 3 && React.createElement('div',{className:"shrink-0 px-4 pb-2"},
                React.createElement('div',{className:"flex gap-2 overflow-x-auto no-scrollbar"},
                    ['اذكر نص المادة القانونية الحاكمة مع مصدرها','ما أحكام النقض/التمييز في هذه المسألة؟','حلل القضية وأعطني التكييف القانوني','ما الدفوع الموضوعية والشكلية المتاحة؟','ما مواعيد التقادم والإجراءات الواجبة؟'].map((s: string) =>
                        React.createElement('button',{key:s,onClick:()=>setInput(s),className:"shrink-0 px-3 py-1.5 bg-white/5 border border-white/8 rounded-xl text-[10px] text-slate-400 font-bold hover:border-premium-gold/30 hover:text-premium-gold transition-all whitespace-nowrap"},s)
                    )
                )
            ),

            // Input bar
            React.createElement('div',{className:"shrink-0 px-4 pb-4 pt-2"},
                React.createElement('div',{className:"flex gap-2 items-end"},
                    React.createElement('div',{className:"flex-1 bg-premium-card border border-white/10 rounded-2xl overflow-hidden flex flex-col",style:{minHeight:'48px'}},
                        React.createElement('textarea',{
                            ref:inputRef,
                            value:input,
                            onChange:(e: React.ChangeEvent<HTMLTextAreaElement>) =>setInput(e.target.value),
                            maxLength:3000,
                            onKeyDown:(e: React.KeyboardEvent<HTMLTextAreaElement>) =>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage();}},
                            placeholder:"اسأل عن أي مسألة قانونية...",
                            rows:1,
                            className:"flex-1 bg-transparent text-white text-xs p-3 resize-none outline-none placeholder-slate-600 leading-relaxed",
                            style:{fontFamily:'Cairo,sans-serif',maxHeight:'120px'},
                            onInput:(e: React.FormEvent<HTMLTextAreaElement>) =>{const t=e.target as HTMLTextAreaElement;t.style.height='auto';t.style.height=Math.min(t.scrollHeight,120)+'px';}
                        }),
                        input.length > 2500 && React.createElement('p',{
                            className:'text-[9px] text-amber-400 text-left px-3 pb-1'
                        }, `${input.length}/3000`)
                    ),
                    React.createElement('button',{
                        onClick:sendMessage,
                        disabled:loading||keyLoading||!input.trim(),
                        className:"w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/20 transition-all active:scale-90 disabled:opacity-40",
                        style:{background:'linear-gradient(135deg,#D4AF37,#E8C84A)'}
                    },(loading||keyLoading)?React.createElement(I.Spin):React.createElement(I.Send))
                )
            )
        ),

        // ══ DOCUMENT GENERATION MODE ══
        mode === 'generate' && React.createElement('div',{className:"flex-1 overflow-y-auto no-scrollbar px-4 py-4 space-y-4"},
            // Country law banner
            React.createElement('div',{className:"flex items-center gap-2.5 p-3 rounded-2xl border border-premium-gold/20",style:{background:'rgba(212,175,55,0.05)'}},
                React.createElement('span',{className:"text-xl"},activeCfg?.flag),
                React.createElement('div',{className:"flex-1"},
                    React.createElement('p',{className:"text-[10px] font-black text-premium-gold"},`المستند وفق قانون ${activeCfg?.name}`),
                    React.createElement('p',{className:"text-[9px] text-slate-500"},activeCfg?.legalSystem)
                )
            ),
            // Document type selector
            React.createElement('div',{className:"grid grid-cols-2 gap-2"},
                Object.entries(DOC_TEMPLATES).map(([k,v]: [string, DocTemplateConfig])=>React.createElement('button',{
                    key:k,
                    onClick:()=>{setDocType(k);setGeneratedDoc('');},
                    className:`p-3 rounded-2xl border text-right transition-all ${docType===k?`bg-gradient-to-br ${colorMap[v.color]} shadow-lg`:'bg-premium-card border-white/5 text-slate-500 hover:border-white/15'}`
                },
                    React.createElement('div',{className:"text-xl mb-1"},v.icon),
                    React.createElement('p',{className:`text-[11px] font-black ${docType===k?'text-white':'text-slate-400'}`},v.label)
                ))
            ),

            // Case selector for doc gen
            cases.length > 0 && React.createElement('div',null,
                React.createElement('label',{className:"block text-[10px] font-black text-slate-400 mb-1.5"},"ربط بقضية (اختياري)"),
                React.createElement('select',{
                    value:selectedCase?.id||'',
                    onChange:(e: React.ChangeEvent<HTMLSelectElement>) =>{
                        const c=cases.find((x: MappedCase) =>x.id===e.target.value);
                        setSelectedCase(c||null);
                        if(c){sf('caseNumber',c.number||'');sf('court',c.court||'');sf('subject',c.title||'');}
                    },
                    className:"w-full p-3 text-xs rounded-xl border border-white/10 bg-premium-bg text-white",
                    style:{fontFamily:'Cairo,sans-serif'}
                },
                    React.createElement('option',{value:''},"— بدون ربط —"),
                    cases.map((c: MappedCase) =>React.createElement('option',{key:c.id,value:c.id},c.title))
                )
            ),

            // Form fields
            React.createElement('div',{className:"bg-premium-card border border-white/5 rounded-2xl p-4 space-y-3"},
                React.createElement('h4',{className:"text-[11px] font-black text-white flex items-center gap-2"},
                    React.createElement('span',{className:"w-1 h-3.5 rounded-full",style:{background:'linear-gradient(#D4AF37,#E8C84A)'}}),
                    "بيانات المستند"
                ),
                docType!=='توكيل_رسمي' && React.createElement('div',{className:"space-y-3"},
                    // الموكل + صفته
                    React.createElement('div',{className:"grid grid-cols-2 gap-2"},
                        React.createElement('div',null,
                            React.createElement('label',{className:"block text-[10px] font-black text-slate-400 mb-1"},"الموكل *"),
                            React.createElement('input',{value:docFields.plaintiff,onChange:(e: React.ChangeEvent<HTMLInputElement>) =>sf('plaintiff',e.target.value),placeholder:"اسم الموكل",className:"w-full p-2.5 text-xs rounded-xl border border-white/10 bg-premium-bg text-white placeholder-slate-600",style:{fontFamily:'Cairo,sans-serif'}})
                        ),
                        React.createElement('div',null,
                            React.createElement('label',{className:"block text-[10px] font-black text-slate-400 mb-1"},"صفته"),
                            React.createElement('input',{value:docFields.plaintiffRole||'',onChange:(e: React.ChangeEvent<HTMLInputElement>) =>sf('plaintiffRole',e.target.value),placeholder:"مدعي / مستأنف...",className:"w-full p-2.5 text-xs rounded-xl border border-white/10 bg-premium-bg text-white placeholder-slate-600",style:{fontFamily:'Cairo,sans-serif'}})
                        )
                    ),
                    // الخصم + صفته
                    React.createElement('div',{className:"grid grid-cols-2 gap-2"},
                        React.createElement('div',null,
                            React.createElement('label',{className:"block text-[10px] font-black text-slate-400 mb-1"},"الخصم *"),
                            React.createElement('input',{value:docFields.defendant,onChange:(e: React.ChangeEvent<HTMLInputElement>) =>sf('defendant',e.target.value),placeholder:"اسم الخصم",className:"w-full p-2.5 text-xs rounded-xl border border-white/10 bg-premium-bg text-white placeholder-slate-600",style:{fontFamily:'Cairo,sans-serif'}})
                        ),
                        React.createElement('div',null,
                            React.createElement('label',{className:"block text-[10px] font-black text-slate-400 mb-1"},"صفته"),
                            React.createElement('input',{value:docFields.defendantRole||'',onChange:(e: React.ChangeEvent<HTMLInputElement>) =>sf('defendantRole',e.target.value),placeholder:"مدعى عليه / مستأنف ضده...",className:"w-full p-2.5 text-xs rounded-xl border border-white/10 bg-premium-bg text-white placeholder-slate-600",style:{fontFamily:'Cairo,sans-serif'}})
                        )
                    )
                ),
                docType==='توكيل_رسمي' && React.createElement('div',null,
                    React.createElement('label',{className:"block text-[10px] font-black text-slate-400 mb-1"},"اسم الموكِّل *"),
                    React.createElement('input',{value:docFields.plaintiff,onChange:(e: React.ChangeEvent<HTMLInputElement>) =>sf('plaintiff',e.target.value),placeholder:"اسم الشخص أو الجهة الموكِّلة",className:"w-full p-2.5 text-xs rounded-xl border border-white/10 bg-premium-bg text-white placeholder-slate-600",style:{fontFamily:'Cairo,sans-serif'}})
                ),
                React.createElement('div',{className:"grid grid-cols-2 gap-2"},
                    React.createElement('div',null,
                        React.createElement('label',{className:"block text-[10px] font-black text-slate-400 mb-1"},"رقم القضية"),
                        React.createElement('input',{value:docFields.caseNumber,onChange:(e: React.ChangeEvent<HTMLInputElement>) =>sf('caseNumber',e.target.value),placeholder:"1447/123456",className:"w-full p-2.5 text-xs rounded-xl border border-white/10 bg-premium-bg text-white placeholder-slate-600",style:{fontFamily:'Cairo,sans-serif'}})
                    ),
                    React.createElement('div',null,
                        React.createElement('label',{className:"block text-[10px] font-black text-slate-400 mb-1"},"المحكمة"),
                        React.createElement('input',{value:docFields.court,onChange:(e: React.ChangeEvent<HTMLInputElement>) =>sf('court',e.target.value),placeholder:"اكتب اسم المحكمة",className:"w-full p-2.5 text-xs rounded-xl border border-white/10 bg-premium-bg text-white placeholder-slate-600",style:{fontFamily:'Cairo,sans-serif'}})
                    )
                ),
                React.createElement('div',null,
                    React.createElement('label',{className:"block text-[10px] font-black text-slate-400 mb-1"},"الموضوع / العنوان *"),
                    React.createElement('input',{value:docFields.subject,onChange:(e: React.ChangeEvent<HTMLInputElement>) =>sf('subject',e.target.value),placeholder:docType==='توكيل_رسمي'?"موضوع التوكيل وصلاحياته":"موضوع القضية أو الدعوى",className:"w-full p-2.5 text-xs rounded-xl border border-white/10 bg-premium-bg text-white placeholder-slate-600",style:{fontFamily:'Cairo,sans-serif'}})
                ),
                docType!=='توكيل_رسمي' && React.createElement(React.Fragment,null,
                    React.createElement('div',null,
                        React.createElement('label',{className:"block text-[10px] font-black text-slate-400 mb-1"},"الوقائع والأسانيد"),
                        React.createElement('textarea',{value:docFields.facts,onChange:(e: React.ChangeEvent<HTMLTextAreaElement>) =>sf('facts',e.target.value),placeholder:"اذكر وقائع القضية والأسانيد القانونية المستند إليها...",rows:3,className:"w-full p-2.5 text-xs rounded-xl border border-white/10 bg-premium-bg text-white placeholder-slate-600 resize-none leading-relaxed",style:{fontFamily:'Cairo,sans-serif'}})
                    ),
                    React.createElement('div',null,
                        React.createElement('label',{className:"block text-[10px] font-black text-slate-400 mb-1"},"الطلبات الختامية"),
                        React.createElement('textarea',{value:docFields.claims,onChange:(e: React.ChangeEvent<HTMLTextAreaElement>) =>sf('claims',e.target.value),placeholder:"أذكر الطلبات والتعويضات المطلوبة...",rows:2,className:"w-full p-2.5 text-xs rounded-xl border border-white/10 bg-premium-bg text-white placeholder-slate-600 resize-none",style:{fontFamily:'Cairo,sans-serif'}})
                    )
                ),
                React.createElement('div',null,
                    React.createElement('label',{className:"block text-[10px] font-black text-slate-400 mb-1"},"اسم المحامي المُوقِّع"),
                    React.createElement('input',{value:docFields.lawyerName,onChange:(e: React.ChangeEvent<HTMLInputElement>) =>sf('lawyerName',e.target.value),placeholder:profile?.full_name||"اسم المحامي",className:"w-full p-2.5 text-xs rounded-xl border border-white/10 bg-premium-bg text-white placeholder-slate-600",style:{fontFamily:'Cairo,sans-serif'}})
                )
            ),

            // Generate button
            React.createElement('button',{
                onClick:generateDocument,
                disabled:generatingDoc||keyLoading||!docFields.plaintiff||!docFields.subject,
                className:"w-full py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50 shadow-lg",
                style:{background:'linear-gradient(135deg,#7c3aed,#a855f7)',color:'white',boxShadow:'0 8px 24px rgba(124,58,237,0.3)'}
            },
                generatingDoc ? React.createElement(React.Fragment,null,React.createElement(I.Spin),"جاري توليد المستند...") :
                React.createElement(React.Fragment,null,React.createElement(I.AI,{cls:"w-5 h-5"}),"توليد المستند بالذكاء الاصطناعي ✨")
            ),

            // Generated document display
            generatedDoc && React.createElement('div',{className:"bg-premium-card border border-purple-500/20 rounded-2xl overflow-hidden slide-up"},
                // Doc header
                React.createElement('div',{className:"flex items-center justify-between px-4 py-3 border-b border-white/5",style:{background:'linear-gradient(135deg,rgba(124,58,237,0.15),rgba(168,85,247,0.05))'}},
                    React.createElement('div',{className:"flex items-center gap-2"},
                        React.createElement('span',{className:"text-lg"}, DOC_TEMPLATES[docType]?.icon),
                        React.createElement('div',null,
                            React.createElement('p',{className:"text-xs font-black text-white"}, DOC_TEMPLATES[docType]?.label + " — مولّدة بالذكاء الاصطناعي"),
                            React.createElement('p',{className:"text-[9px] text-purple-400 font-bold"}, today)
                        )
                    ),
                    React.createElement('div',{className:"flex gap-2"},
                        React.createElement('button',{onClick:copyDoc,className:`w-9 h-9 rounded-xl flex items-center justify-center transition-all active:scale-90 ${copied?'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30':'bg-white/5 text-slate-400 border border-white/10'}`},
                            copied ? React.createElement(I.Check) : React.createElement(I.Copy)
                        ),
                        React.createElement('button',{onClick:printDoc,className:"w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 hover:text-premium-gold active:scale-90 transition-all"},
                            React.createElement(I.Print)
                        ),
                        React.createElement('button',{
                            onClick:downloadPDF,
                            title:"تحميل PDF",
                            className:"w-9 h-9 rounded-xl flex items-center justify-center text-white active:scale-90 transition-all",
                            style:{background:'linear-gradient(135deg,#dc2626,#ef4444)',boxShadow:'0 4px 12px rgba(220,38,38,0.3)'}
                        }, React.createElement('svg',{className:"w-4 h-4",fill:"none",viewBox:"0 0 24 24",strokeWidth:"2",stroke:"currentColor"},
                            React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"})
                        ))
                    )
                ),
                // Doc content
                React.createElement('div',{className:"p-4 max-h-96 overflow-y-auto no-scrollbar"},
                    React.createElement('pre',{className:"doc-preview text-slate-200"}, generatedDoc)
                )
            ),

            React.createElement('div',{className:"h-4"})
        )
    );
}

export default AILegalAssistant;
