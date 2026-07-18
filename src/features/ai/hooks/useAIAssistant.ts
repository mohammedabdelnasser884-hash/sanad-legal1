import React, { useState, useEffect, useRef } from 'react';
import { COUNTRY_CONFIGS } from '../../../constants';
import type { ClientRow, ProfileRow } from '../../../types';
import type { MappedCase } from '../../../hooks/useAppData';
import { GROQ_MODELS, DOC_TEMPLATES, colorMap } from './aiAssistantTypes';
import { useAIApiKey } from './useAIApiKey';
import { useAILegalEngine } from './useAILegalEngine';
import { useAITopics } from './useAITopics';
import { useAIChat } from './useAIChat';
import { useAIDocumentGenerator } from './useAIDocumentGenerator';

export function useAIAssistant(cases: MappedCase[], clients: ClientRow[], profile: ProfileRow | null, country: string) {
    const [mode, setMode] = useState('chat');
    const [selectedModel, setSelectedModel] = useState('llama-3.3-70b-versatile');
    const { hasKey, keyLoading, showKeyInput, setShowKeyInput, saveKey } = useAIApiKey(profile);

    const {
        topics, setTopics, activeTopicId, setActiveTopicId,
        showTopics, setShowTopics, newTopic, deleteTopic,
        messages, setMessages,
    } = useAITopics(profile, country);

    const [selectedCase, setSelectedCase] = useState<MappedCase | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const today = new Date().toLocaleDateString('ar-SA-u-nu-latn', {year:'numeric',month:'long',day:'numeric'});

    const activeCfg = COUNTRY_CONFIGS[country||'SA'];

    const { buildLegalContextBlock, retrieveLegalArticles, callAI } = useAILegalEngine(profile, activeCfg, today, selectedModel);

    const { input, setInput, loading, setLoading, sendMessage } = useAIChat({
        messages, setMessages, hasKey, keyLoading, setShowKeyInput,
        selectedCase, retrieveLegalArticles, buildLegalContextBlock, callAI,
    });

    const {
        docType, setDocType, docFields, sf,
        generatedDoc, setGeneratedDoc, generatingDoc,
        copied, copyDoc, printDoc, downloadPDF, generateDocument,
    } = useAIDocumentGenerator({
        profile, activeCfg, today, selectedCase, hasKey, setShowKeyInput,
        retrieveLegalArticles, buildLegalContextBlock, callAI,
    });

    useEffect(()=>{
        messagesEndRef.current?.scrollIntoView({behavior:'smooth'});
    },[messages, loading]);

  return {
    mode, setMode,
    selectedModel, setSelectedModel, GROQ_MODELS,
    hasKey, keyLoading, showKeyInput, setShowKeyInput, saveKey,
    messages, setMessages, input, setInput, loading, setLoading,
    topics, setTopics, activeTopicId, setActiveTopicId,
    showTopics, setShowTopics, newTopic, deleteTopic,
    selectedCase, setSelectedCase,
    docType, setDocType, docFields, sf,
    generatedDoc, setGeneratedDoc, generatingDoc,
    copied, copyDoc, printDoc, downloadPDF, generateDocument,
    sendMessage, inputRef, messagesEndRef,
    today, activeCfg, DOC_TEMPLATES, colorMap,
  };
}
