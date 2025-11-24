import pdf from 'pdf-parse';
import { streamText, Experimental_Agent as Agent } from 'ai';
import { openai } from "@ai-sdk/openai";
import fs from 'fs';
import { RAGApplicationBuilder, SIMPLE_MODELS, TextLoader  } from '@llm-tools/embedjs';
import { OpenAiEmbeddings } from '@llm-tools/embedjs-openai';
import { PdfLoader } from '@llm-tools/embedjs-loader-pdf';
import { LanceDb } from '@llm-tools/embedjs-lancedb';
import { QdrantDb } from '@llm-tools/embedjs-qdrant';
import path from 'path';


// Configuração do modelo
const model = openai('gpt-4.1');


/**
 * 🎯 ORQUESTRADOR PRINCIPAL DE AGENTES
 * Estratégia Híbrida: Router + Pipeline + Event-Driven
 */
class AgentOrchestrator {
  private agents: any;
  private currentConversation: any[];
  private userContext: any;
  private currentFlow: string;
  

  constructor(readonly prompt: string) {
    this.agents = this.initializeAgents();
    this.currentConversation = [];
    this.userContext = {};
    this.currentFlow = 'initial';
  }

  initializeAgents() {
    
    return {
      // 🔍 Agente Classificador (Router)
      classifier: new Agent({
        model: model,
        system: `
        Você é um classificador que determina qual agente deve responder baseado no input do usuário.
        
        Classifique em uma das categorias:
        - "image_text": Usuário enviou uma imagem para extrair texto
        - "mention_extract": Texto contém menções @[texto](id) que precisam ser processadas
        - "general": Conversas gerais não relacionadas aos temas acima
        
        Responda APENAS com a categoria.
        `
      }),

      // 💬 Agente Ana BPC/LOAS (Especialista)
      principal: new Agent({
        model: model,
        system: this.prompt
      }),

      // 🖼️ Agente de Imagem (Especialista)
      image_processor: new Agent({
        model: model,
        system: `Extrai texto de imagens enviadas pelos usuários e responda com o texto extraído.
        `
      }),

      // 🔗 Agente de Menções (Especialista) 
      mention_processor: new Agent({
        model: model,
        system: `
        ÚNICO TRABALHO: Extrair menções no formato @[texto](id) de qualquer texto.
        Responda APENAS com as menções encontradas, uma por linha.
        Se não houver menções, responda "Nenhuma menção encontrada".
        `
      }),

      // 🎭 Agente Supervisor (Manager)
      supervisor: new Agent({
        model: model,
        system: `
        Você coordena a conversa e garante fluxo suave entre agentes.
        Analise respostas dos agentes especializados e determine próximos passos.
        Mantenha contexto da conversa e personalize respostas.
        `
      })
    };
  }

   async processUserInput(userInput: string, inputType: string = 'text', imageData: any = null) {
    try {
      console.log(`\n🎯 Processando input: ${inputType}`);
      
      // ETAPA 1: Classificação (Router Pattern)
      const category = await this.classifyInput(userInput, inputType);
      console.log(`📋 Categoria identificada: ${category}`);

      // ETAPA 2: Processamento Especializado (Pipeline Pattern)
      const specialistResponse = await this.processWithSpecialist(category, userInput, imageData);
      
      // ETAPA 3: Supervisão e Contextualização (Manager Pattern)
      const finalResponse = await this.superviseFinalResponse(specialistResponse, category);

      // ETAPA 4: Processamento de Menções (Event-Driven Pattern)
      const mentions = await this.extractMentions(finalResponse);

      // ETAPA 4.5: Limpar texto removendo menções
      const cleanResponse = this.removeMentionsFromText(finalResponse);

      // ETAPA 5: Atualizar Estado da Conversa (aguardar eventos assíncronos)
      await this.updateConversationState(userInput, cleanResponse, mentions, category);

      // ETAPA 6: Se houve consulta à base de conhecimento, adicionar resposta
      let finalResponseText = cleanResponse;
      if (this.userContext.lastKnowledgeBaseAnswer) {
        finalResponseText = `${this.userContext.lastKnowledgeBaseAnswer}`;
        // Limpar para próxima consulta
        delete this.userContext.lastKnowledgeBaseAnswer;
      }

      return {
        response: finalResponseText,
        mentions: mentions,
        category: category,
        conversationState: this.currentFlow,
        conversationHistory: this.currentConversation.length
      };

    } catch (error) {
      console.error('❌ Erro na orquestração:', error);
      return {
        response: 'Desculpe, ocorreu um erro. Pode tentar novamente?',
        mentions: [],
        category: 'error',
        conversationState: this.currentFlow,
        conversationHistory: this.currentConversation.length
      };
    }
  }
  // 🔍 CLASSIFICAÇÃO DE INPUT (Router)
  async classifyInput(input: string, inputType: string) {
    if(fs.existsSync(input)){
        return 'image_text';
    }
    
      const regex = /@\[([^\]]+)\]\(([^)]+)\)/g;
    if (regex.test(input)) return 'mention_extract';
    
    const classification = await this.agents.classifier.generate({
      messages: [{ role: 'user', content: input }],
      providerOptions: {
        openai: {
          temperature: 0.1,
          max_tokens: 50
        }
      }
    });
    
    return classification.text.trim().toLowerCase();
  }

  // 🎯 PROCESSAMENTO ESPECIALIZADO (Pipeline)
  async processWithSpecialist(category: string, input: string, imageData: any = null) {
    const agentMap: { [key: string]: string } = {
      'image_text': 'image_processor', 
      'mention_extract': 'mention_processor',
      'general': 'principal' // Fallback para Ana
    };

    const agentName = agentMap[category] || 'principal';
    const agent = this.agents[agentName];

    // Construir histórico de conversa para o agente principal
    let messages: Array<{role: string, content: any}> = [];
    if (agentName === 'principal' && this.currentConversation.length > 0) {
      // Adicionar mensagens anteriores como contexto
      messages = this.currentConversation.map(conv => ([
        { role: 'user', content: conv.userInput },
        { role: 'assistant', content: conv.response }
      ])).flat();
    }

    // Adicionar a mensagem atual
    const currentMessage = imageData 
      ? [{ type: 'image', image: imageData }, { type: 'text', text: input }]
      : input;
    
    messages.push({ role: 'user', content: currentMessage });

    console.log(`💬 Enviando ${messages.length} mensagens para ${agentName}`);

    // Configurar opções específicas por agente
    const getProviderOptions = (agentName: string) => {
      const baseOptions = {
        openai: {
          temperature: 0.7,
          max_tokens: 1000,
          top_p: 1,
          frequency_penalty: 0,
          presence_penalty: 0
        }
      };

      switch (agentName) {
        case 'principal':
          return {
            openai: {
              ...baseOptions.openai,
              temperature: 0.8, // Mais criativo para conversas
              max_tokens: 1500,
              store: false,
              user: 'user_123',
            }
          };
        case 'classifier':
          return {
            openai: {
              ...baseOptions.openai,
              temperature: 0.1, // Mais determinístico para classificação
              max_tokens: 50
            }
          };
        case 'mention_processor':
          return {
            openai: {
              ...baseOptions.openai,
              temperature: 0.0, // Totalmente determinístico para extração
              max_tokens: 200
            }
          };
        default:
          return baseOptions;
      }
    };

    const response = await agent.generate({ 
      messages,
      providerOptions: getProviderOptions(agentName)
    });

    return response.text;
  }

  // 👑 SUPERVISÃO (Manager)
  async superviseFinalResponse(specialistResponse: string, category: string) {
    // Para categorias simples, retorna direto
    if (['image_text'].includes(category)) {
      return specialistResponse;
    }

    if (category === 'mention_extract') {
        console.log('✅ Resposta de menções processada com sucesso.');
        return specialistResponse;
    }

    /*
    // Para chat, aplica supervisão
    const supervised = await this.agents.supervisor.generate({
      messages: [
        { role: 'system', content: `Contexto da conversa: ${JSON.stringify(this.userContext)}\\nFluxo atual: ${this.currentFlow}` },
        { role: 'user', content: `Resposta do especialista: ${specialistResponse}\\n\\nMelhore esta resposta mantendo o conteúdo mas personalizando com base no contexto da conversa.` }
      ]
    });
    */

    //return supervised.text;
    return specialistResponse;
  }

  // 🔗 EXTRAÇÃO DE MENÇÕES (Event-Driven)
  async extractMentions(text: string) {
    const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
    const mentions = [];
    let match;

    while ((match = mentionRegex.exec(text)) !== null) {
      mentions.push({
        label: match[1],
        id: match[2],
        fullMatch: match[0]
      });
    }

    console.log(`🔗 Menções extraídas: ${mentions.length}`);
    return mentions;
  }

  // 🧹 REMOÇÃO DE MENÇÕES DO TEXTO
  removeMentionsFromText(text: string): string {
    const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
    const cleanText = text.replace(mentionRegex, '').trim();
    
    // Remove espaços extras e quebras de linha desnecessárias
    return cleanText.replace(/\s+/g, ' ').replace(/\n\s*\n/g, '\n').trim();
  }

  // 💾 ATUALIZAÇÃO DE ESTADO
  async updateConversationState(userInput: string, response: string, mentions: { label: string; id: string; fullMatch: string }[], category: string) {
    this.currentConversation.push({
      timestamp: new Date(),
      userInput,
      response,
      mentions,
      category
    });

    // Trigger eventos baseados em menções (aguardar execução assíncrona)
    for (const mention of mentions) {
      await this.handleMentionEvent(mention, userInput);
    }
  }

  async loadLoacalPDF(filePath: string, question: string): Promise<string | null> {
     console.log('🔍 Verificando arquivos PDF na pasta documents...');

        if (!fs.existsSync(filePath)) {
            console.log('⚠️  Pasta documents não existe. Criando...');
            fs.mkdirSync(filePath, { recursive: true });
        }

        const files = fs.readdirSync(filePath).filter(file => file.toLowerCase().endsWith('.pdf'));
         if (files.length === 0) {
            console.log('📄 Nenhum PDF encontrado na pasta documents.');
            console.log('💡 Coloque arquivos PDF na pasta ./documents/ para testá-los');
            console.log('🔄 Usando PDF de exemplo da internet...');
            
            return null;
        }

        console.log(`📚 Encontrados ${files.length} arquivo(s) PDF:`);
        files.forEach((file, index) => {
            console.log(`   ${index + 1}. ${file}`);
        });


           console.log('🚀 Construindo aplicação RAG...');
        const ragApplication = await new RAGApplicationBuilder()
            .setModel(SIMPLE_MODELS.OPENAI_GPT4_O)
            .setEmbeddingModel(new OpenAiEmbeddings({
              modelName: 'text-embedding-3-small',
            }))
            .setVectorDatabase(new QdrantDb({ apiKey: process.env.QDRANT_API_KEY || '', url: process.env.QDRANT_ENDPOINT || '', clusterName: process.env.QDRANT_CLUSTER_NAME || 'default' }))
            .build();

           // Carregar todos os PDFs encontrados
        for (const file of files) {
            const fullPath = path.join(filePath, file);
            console.log(`📖 Carregando: ${file}...`);
            
            const dataBuffer = fs.readFileSync(fullPath);
            const data = await pdf(dataBuffer);
            console.log(`📝 Conteúdo extraído: ${data.text.substring(0, 100)}...`);

           ragApplication.addLoader(new TextLoader({ text: data.text }))

            
            console.log(`✅ ${file} carregado com sucesso!`);
        }

         // Fazer perguntas sobre os documentos
        console.log('\n❓ Fazendo perguntas sobre os documentos carregados...');
        
        const result = await ragApplication.query(question);
        console.log('💡 Resposta:', result.content);
        console.log('📊 Tokens:', result.tokenUse);
        console.log('📁 Arquivos usados:', result.sources.map((s: any) => path.basename(s.source)));
        
        return result.content;
  }
  // 🎪 HANDLER DE EVENTOS DE MENÇÕES
  async handleMentionEvent(mention: { label: string; id: string; fullMatch: string }, question: string) {
    console.log(`🎪 Processando evento de menção: ${mention.label} (ID: ${mention.id})`);
    
    const eventHandlers: { [key: string]: () => void | Promise<void> } = {
      'Inicio': () => {
        this.currentFlow = 'greeting_sent';
        console.log('🎬 Evento: Fluxo iniciado');
      },
      'Análise': () => {
        this.currentFlow = 'analysis_phase';
        console.log('🔍 Evento: Fase de análise iniciada');
      },
      'Desqualificado': () => {
        this.currentFlow = 'disqualified';
        console.log('❌ Evento: Cliente desqualificado');
      },
      'Base de Conhecimento': async () => {
        this.currentFlow = 'knowledge_base_accessed';
        console.log('📚 Evento: Base de conhecimento acessada');
        const answer = await this.loadLoacalPDF("./uploads", question);
        if (answer) {
          console.log('✅ Resposta da base de conhecimento:', answer);
          // Armazenar resposta no contexto para uso posterior
          this.userContext.lastKnowledgeBaseAnswer = answer;
        }
      }
    };

    const handler = eventHandlers[mention.label];
    if (handler) {
      await handler();
    } else {
      console.log(`⚠️ Handler não encontrado para: ${mention.label}`);
    }
  }

  // 📊 MÉTODOS DE MONITORAMENTO
  getConversationSummary() {
    return {
      totalMessages: this.currentConversation.length,
      currentFlow: this.currentFlow,
      userContext: this.userContext,
      lastActivity: this.currentConversation[this.currentConversation.length - 1]?.timestamp
    };
  }

  // 🧹 GERENCIAMENTO DE HISTÓRICO
  clearConversationHistory() {
    this.currentConversation = [];
    console.log('🧹 Histórico de conversa limpo');
  }

  getConversationHistory() {
    return this.currentConversation;
  }
}


export { AgentOrchestrator };