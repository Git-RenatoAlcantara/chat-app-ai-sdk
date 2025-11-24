import { streamText, Experimental_Agent as Agent } from 'ai';
import { openai } from "@ai-sdk/openai";
import { AgentOrchestrator } from '@/app/server/agent-orchestrator';
import { NextResponse } from 'next/server';
import { experimental_generateSpeech as generateSpeech } from 'ai';
import fs from 'fs/promises';
import path from 'path';
// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

// Cache de sessões para manter estado do orchestrator
const sessionCache = new Map<string, AgentOrchestrator>();

// Limpar sessões antigas a cada 30 minutos
setInterval(() => {
    const now = Date.now();
    for (const [sessionId, orchestrator] of sessionCache.entries()) {
        const summary = orchestrator.getConversationSummary();
        if (summary.lastActivity && now - summary.lastActivity.getTime() > 30 * 60 * 1000) {
            sessionCache.delete(sessionId);
            console.log(`🧹 Sessão ${sessionId} removida por inatividade`);
        }
    }
}, 30 * 60 * 1000);

export async function POST(req: Request) {
    try {
        const { messages, sessionId } = await req.json();
        
        // Usar sessionId fornecido ou gerar um baseado no primeiro input
        const currentSessionId = sessionId || `session-${Date.now()}`;
        
        // Pega a última mensagem do usuário
        const lastMessage = messages[messages.length - 1];
        const userInput = lastMessage?.content || '';
        
        console.log('🎭 Processando mensagem:', userInput);
        console.log('🔑 Session ID:', currentSessionId);

        // Recuperar ou criar orchestrator para esta sessão
        let orchestrator = sessionCache.get(currentSessionId);
        
        if (!orchestrator) {
            console.log('🆕 Criando nova sessão de orchestrator');
            orchestrator = new AgentOrchestrator(`
            1. **COMANDOS DE CHAT (@[texto](id))**:
                - Se uma instrução tiver uma menção no formato **@[texto](id)**, você DEVE incluí-la no final da sua resposta, na mesma linha, EXATAMENTE como está escrita.
                - Exemplo: Se a instrução for "Diga 'Olá' e execute @[Saudacao](id)", sua saída DEVE ser: Olá @[Saudacao](id)
   
            Você é a Ana, do escritório Anelli Advocacia, responsável por orientar nossos clientes sobre o benefício BPC/LOAS. 
            Conduza o atendimento com empatia, leveza e clareza, sempre chamando a pessoa pelo nome e seguindo cada etapa do fluxo corretamente, sem pular passos. 
            
            VOCÊ é responsável por:
            - Detectar quando o usuário fornece o nome
            - Lembrar informações coletadas nas mensagens anteriores
            - Avançar o fluxo sequencialmente sem repetir perguntas
            - Usar o histórico da conversa para contextualizar suas respostas
            
            ***DUVIDAS GERAIS*** 
            Sempre que precisar consultar doenças, regras de renda, endereço do escritório ou tirar dúvidas específicas, utilize a ferramenta: 
            @[Base de Conhecimento](base-conhecimento-001) 😊   
            
            ### Etapa 1: Coleta de Nome
            "Me fala seu nome, por favor? 😊" e execute @[Inicio](inicio-fluxo-001)
            → Após o usuário responder com o nome, vá para Etapa 2 
            
            ### Etapa 2: Verificação de Benefícios  
            "Ótimo, [Nome]! Você já recebe algum benefício atualmente, como aposentadoria, BPC/LOAS ou pensão?" @[Análise](analise-cliente-001)
            → Se sim, confirme antes de alterar status.  
            → Se não, pergunte: "Me conta uma coisa: atualmente você trabalha registrado, tem MEI ou alguma empresa aberta (CNPJ) no seu nome? 😊"  
            → Se sim, confirme antes de alterar status.  
            → Se confirmar 2x, altere para @[Desqualificado](desqualificado-001)  → Se não, vá para Etapa 3.
            ### Etapa 3
            "Qual sua idade?"
            → Se ≥ 65 anos: vá para Etapa 4 e  @[Idoso](idoso-fluxo-001)  
            → Se < 65 anos: @[Análise](analise-cliente-001)  e diga somente "Me conta agora um pouquinho sobre sua saúde: Você tem alguma deficiência ou problema de saúde que dificulte seu trabalho atualmente? Qual seria?" 
            → Prossiga apenas após resposta clara. 
            "Há quanto tempo convive com isso?" 
            → Prossiga com qualquer resposta.
            "Você tem receita ou laudo médico que comprove essa condição de saúde? 😊"
            → Prossiga com qualquer resposta. 
            ### → Se disser diabetes:  
            • Pergunte: "Você utiliza insulina todos os dias?" 
            → Se sim, vá para Etapa 4. 
            → Se não: "Você tem alguma outra complicação de saúde como problema nos rins, perda de visão permanente, neuropatia, amputação ou obesidade? Qual?"
            → Se informar que sim: consulte @[Base de conhecimento](base-conhecimento-001) “Doenças”
            → Se constar a doença ou a doença indicar barreira de longo prazo, vá para Etapa 4.
            → Se não: @[Desqualificado](desqualificado-001) 
        `);
            sessionCache.set(currentSessionId, orchestrator);
        } else {
            console.log('📋 Usando sessão existente');
        }
        
        const response = await orchestrator.processUserInput(userInput, 'text');
        
        console.log('✅ Resposta:', response.response);
        console.log('🔗 Menções:', response.mentions);
        console.log('💬 Histórico:', response.conversationHistory, 'mensagens');
        
        // Gerar áudio da resposta
        let audioUrl = null;
        try {
            // Limpar a resposta removendo menções para o texto do áudio
            const cleanText = response.response.replace(/@\[.*?\]\(.*?\)/g, '').trim();
            
            if (cleanText) {
                const speechResult = await generateSpeech({
                    model: openai.speech('gpt-4o-mini-tts'), // Modelo mais recente e natural
                    voice: 'nova', // Voz feminina mais calorosa e natural para português
                    text: cleanText,
                    speed: 1.00, // Velocidade ligeiramente mais rápida para conversação natural
                    language: 'pt', // Português
                    instructions: 'Fale de forma amigável, empática e acolhedora, como uma consultora experiente conversando naturalmente com um cliente.',
                });

                // Criar diretório public/audio se não existir
                const audioDir = path.join(process.cwd(), 'public', 'audio');
                await fs.mkdir(audioDir, { recursive: true });
                
                // Gerar nome único para o arquivo de áudio
                const audioFileName = `response-${currentSessionId}-${Date.now()}.mp3`;
                const audioFilePath = path.join(audioDir, audioFileName);
                
                // Salvar arquivo de áudio usando uint8Array
                await fs.writeFile(audioFilePath, speechResult.audio.uint8Array);
                
                // URL pública para o áudio
                audioUrl = `/audio/${audioFileName}`;
                console.log('🔊 Áudio gerado:', audioUrl);
            }
        } catch (audioError) {
            console.error('⚠️ Erro ao gerar áudio:', audioError);
            // Continuar mesmo se houver erro no áudio
        }

        // Retornar resposta incluindo sessionId e audioUrl para o frontend
        return new NextResponse(JSON.stringify({
            ...response,
            sessionId: currentSessionId,
            audioUrl
        }), { 
            status: 200, 
            headers: { 'Content-Type': 'application/json' } 
        });
        
    } catch (error) {
        console.error('❌ Erro:', error);
        
        // Fallback em caso de erro
        return new Response('Desculpe, houve um problema. Como posso ajudá-lo?', {
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
            },
        });
    }
}