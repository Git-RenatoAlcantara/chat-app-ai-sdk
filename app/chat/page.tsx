"use client";

import { Conversation, ConversationContent } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { useState, useRef, useEffect } from "react";
import { uploadPDF } from "@/app/actions/upload-pdf";
import { listPDFs } from "@/app/actions/list-pdfs";

type Mention = {messageId?: string; label: string; id: string; fullMatch: string };

interface AIResponse {
    response: string;
    mentions: Omit<Mention, 'messageId'>[];
    category: string;
    sessionId?: string;
}

export default function ChatPage() {
    const [input, setInput] = useState("");
    const [chatMessages, setChatMessages] = useState<Array<{id: string, role: string, content: string}>>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [status, setStatus] = useState<Mention[]>([]);
    const [sessionId, setSessionId] = useState<string>(() => `session-${Date.now()}-${Math.random()}`);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploadedPDFs, setUploadedPDFs] = useState<any[]>([]);
    const [showPDFList, setShowPDFList] = useState(false);

    // Carregar lista de PDFs ao montar o componente
    useEffect(() => {
        loadPDFList();
    }, []);

    const loadPDFList = async () => {
        const result = await listPDFs();
        if (result.success && result.files) {
            setUploadedPDFs(result.files);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;
        
        const userMessage = {
            id: Date.now().toString(),
            role: 'user',
            content: input
        };
        
        setChatMessages(prev => [...prev, userMessage]);
        setIsLoading(true);
        
        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    messages: [{ role: 'user', content: input }],
                    sessionId: sessionId
                })
            });
            
            if (response.ok) {
                const aiResponse: AIResponse = await response.json().then(data => data) as AIResponse;
    
                console.log('Resposta da AI:', aiResponse);

                // Atualizar sessionId se fornecido
                if (aiResponse.sessionId) {
                    setSessionId(aiResponse.sessionId);
                }

                const assistantMessage = {
                    id: (Date.now() + 1).toString(),
                    role: 'assistant',
                    content: aiResponse.response
                };
                
                // Add mentions to status with messageId
                const mentionsWithMessageId = aiResponse.mentions.map(mention => ({
                    ...mention,
                    messageId: assistantMessage.id
                }));
                setStatus(prev => [...prev, ...mentionsWithMessageId]);
                
                setChatMessages(prev => [...prev, assistantMessage]);

            } else {
                throw new Error('Erro na resposta');
            }
            
            setInput("");
        } catch (error) {
            console.error('Erro ao enviar mensagem:', error);
            const errorMessage = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: 'Desculpe, ocorreu um erro. Tente novamente.'
            };
            setChatMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsUploading(true);
        
        const formData = new FormData();
        formData.append('pdf', file);
        try {
            const result = await uploadPDF(formData);
            
            if (result.success) {
                // Recarregar lista de PDFs
                await loadPDFList();
            }
            
        } catch (error) {
            console.error('Erro ao enviar PDF:', error);
        } finally {
            setIsUploading(false);
            // Limpar input para permitir upload do mesmo arquivo novamente
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    return (
        <div className="max-w-4xl mx-auto p-6 relative size-full h-[calc(100vh)]">
            <div className="flex flex-col h-full">
                <Conversation className="flex-1 overflow-hidden">
                    <ConversationContent className="h-full overflow-y-auto pb-4">
                        {chatMessages.map((message) => (
                            <Message key={message.id} from={message.role as any}>
                                <MessageContent>
                                    {message.role === "user" ? (
                                        <div className="text-sm font-medium">
                                            {message.content}
                                        </div>
                                    ) : (
                                            <>
                                            {status.filter(s => s.messageId === message.id).length > 0 && (
                                                <div className="mb-3 bg-linear-to-r from-blue-50 to-indigo-50 border border-blue-200 text-blue-700 rounded-lg px-4 py-2.5 flex items-center gap-2 shadow-sm">
                                                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                                                    <span className="text-xs font-medium  tracking-wide">Agente atribuiu status:</span>
                                                    <div className="flex gap-1 flex-wrap">
                                                        {status.filter(s => s.messageId === message.id).map((s, index) => (
                                                            <span key={index} className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full font-medium">
                                                                {s.label}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                            <MessageResponse>
                                                {message.content}
                                            </MessageResponse>
                                            </>
                                    )}
                                </MessageContent>
                            </Message>
                        ))}
                        
                        {isLoading && (
                            <Message from="assistant">
                                <MessageContent>
                                    <div className="flex items-center gap-2 text-muted-foreground">
                                        <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full"></div>
                                        Ana está digitando...
                                    </div>
                                </MessageContent>
                            </Message>
                        )}
                    </ConversationContent>
                </Conversation>
                
                <div className="border-t pt-4 bg-background">
                    <form onSubmit={handleSubmit} className="flex gap-2 p-4">
                       <div className="flex-1 flex gap-2">
                            <textarea
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder="Digite sua mensagem..."
                                className="flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                rows={1}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSubmit(e);
                                    }
                                }}
                            />
                            
                            {/* Botão de lista de PDFs */}
                            <button
                                type="button"
                                onClick={() => setShowPDFList(!showPDFList)}
                                className="inline-flex items-center justify-center rounded-lg bg-blue-100 hover:bg-blue-200 px-3 py-2 text-sm font-medium text-blue-700 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                                title={`${uploadedPDFs.length} PDF(s) carregados`}
                            >
                                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                {uploadedPDFs.length}
                            </button>
                            
                            {/* Botão de upload de PDF */}
                            <div className="relative">
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".pdf"
                                    onChange={handleFileUpload}
                                    className="hidden"
                                    disabled={isUploading || isLoading}
                                />
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={isUploading || isLoading}
                                    className="inline-flex items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200 px-3 py-2 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
                                    title="Enviar PDF"
                                >
                                    {isUploading ? (
                                        <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full"></div>
                                    ) : (
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                        </svg>
                                    )}
                                </button>
                            </div>
                        </div>
                    </form>
                    
                    {/* Lista de PDFs */}
                    {showPDFList && uploadedPDFs.length > 0 && (
                        <div className="border-t border-border p-4 bg-gray-50">
                            <h3 className="text-sm font-semibold mb-3 text-gray-700">PDFs Carregados ({uploadedPDFs.length})</h3>
                            <div className="space-y-2 max-h-48 overflow-y-auto">
                                {uploadedPDFs.map((pdf, index) => (
                                    <div key={pdf.fileName} className="flex items-center justify-between bg-white p-3 rounded-lg border border-gray-200">
                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                            <svg className="w-5 h-5 shrink-0 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                                                <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                                            </svg>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-gray-900 truncate">{pdf.originalName}</p>
                                                <p className="text-xs text-gray-500">
                                                    {(pdf.size / 1024).toFixed(1)} KB • {new Date(pdf.uploadedAt).toLocaleDateString('pt-BR')}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}