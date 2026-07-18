import React from 'react';

import { I } from '../../constants';
import type { CaseDocumentRow } from '../../types';

interface PdfViewerModalProps {
    doc: CaseDocumentRow;
    onClose: () => void;
}

function PdfViewerModal({doc, onClose}: PdfViewerModalProps){
    const isPdf = /\.pdf$/i.test((doc.original_name || doc.file_name) as string);
    const isImg = /\.(jpg|jpeg|png|gif|webp)$/i.test((doc.original_name || doc.file_name) as string);

    return React.createElement('div',{
        className:"fixed inset-0 z-[70] bg-black/95 flex flex-col fade-in",
        onClick:(e: React.MouseEvent<HTMLDivElement>) =>{if(e.target===e.currentTarget)onClose();}
    },
        // شريط العنوان
        React.createElement('div',{className:"flex items-center justify-between px-4 py-3 bg-premium-card/80 backdrop-blur-lg border-b border-white/10 shrink-0"},
            React.createElement('div',{className:"flex-1 min-w-0"},
                React.createElement('p',{className:"text-xs font-black text-white truncate"},doc.file_name),
                React.createElement('p',{className:"text-[9px] text-slate-500 mt-0.5"},doc.category)
            ),
            React.createElement('div',{className:"flex items-center gap-2 mr-3"},
                React.createElement('a',{
                    href:doc.file_url, target:'_blank', rel:'noreferrer', download:true,
                    className:"w-9 h-9 rounded-xl bg-premium-gold/10 border border-premium-gold/20 flex items-center justify-center text-premium-gold hover:bg-premium-gold/20 transition-all active:scale-90"
                },React.createElement(I.Download)),
                React.createElement('button',{
                    onClick:onClose,
                    className:"w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-all active:scale-90"
                },React.createElement(I.X))
            )
        ),
        // المحتوى
        React.createElement('div',{className:"flex-1 overflow-hidden"},
            isPdf
                ? React.createElement('iframe',{
                    src: doc.file_url + '#toolbar=0&navpanes=0&scrollbar=0',
                    className:"w-full h-full border-0",
                    title: doc.file_name
                  })
                : isImg
                    ? React.createElement('div',{className:"w-full h-full flex items-center justify-center p-4"},
                        React.createElement('img',{
                            src:doc.file_url,
                            className:"max-w-full max-h-full object-contain rounded-2xl shadow-2xl",
                            alt:doc.file_name
                        })
                      )
                    : React.createElement('div',{className:"flex flex-col items-center justify-center h-full gap-6 text-center px-8"},
                        React.createElement('div',{className:"w-20 h-20 rounded-2xl bg-white/5 flex items-center justify-center text-4xl"},"📄"),
                        React.createElement('p',{className:"text-white font-black text-sm"},doc.file_name),
                        React.createElement('p',{className:"text-slate-400 text-xs"},"لا يمكن معاينة هذا النوع من الملفات هنا"),
                        React.createElement('a',{
                            href:doc.file_url, target:'_blank', rel:'noreferrer',
                            className:"px-6 py-3 bg-gradient-to-tr from-premium-gold to-amber-200 text-premium-bg rounded-xl text-xs font-black flex items-center gap-2 active:scale-95"
                        },"فتح في متصفح جديد ↗")
                      )
        )
    );
}

export default PdfViewerModal;
