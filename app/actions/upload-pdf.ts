'use server'

import pdf from 'pdf-parse';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { mkdir } from 'fs/promises';

export async function uploadPDF(formData: FormData) {
  try {
    const file = formData.get('pdf') as File
    
    if (!file) {
      return { success: false, error: 'Nenhum arquivo enviado' }
    }

    if (file.type !== 'application/pdf') {
      return { success: false, error: 'Apenas arquivos PDF são permitidos' }
    }

    // Limite de 10MB
    if (file.size > 10 * 1024 * 1024) {
      return { success: false, error: 'Arquivo muito grande (máximo 10MB)' }
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // Criar diretório uploads se não existir
    const uploadDir = join(process.cwd(), 'uploads');
    try {
      await mkdir(uploadDir, { recursive: true });
    } catch (error) {
      // Diretório já existe
    }

    // Criar nome único para o arquivo
    const fileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const filePath = join(uploadDir, fileName);

    // Salvar arquivo
    await writeFile(filePath, buffer);
    console.log(`💾 PDF salvo em: ${filePath}`);

    // Extrair texto do PDF
    const data = await pdf(buffer);
    console.log(`📄 PDF enviado: ${file.name}`);
    console.log(`🔍 Número de páginas: ${data.numpages}`);
    console.log(`📝 Conteúdo extraído: ${data.text.substring(0, 100)}...`);

    if (!data || data.text.trim().length === 0) {
        return { success: false, error: 'O PDF está vazio ou não pôde ser processado' }
    }

    return {
      success: true,
      fileName: fileName,
      filePath: filePath,
      originalName: file.name,
      size: file.size,
      content: data.text,
      pages: data.numpages
    }
  } catch (error) {
    console.error('❌ Erro no upload:', error)
    return { success: false, error: 'Erro interno do servidor' }
  }
}