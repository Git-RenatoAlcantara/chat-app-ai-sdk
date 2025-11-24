'use server'

import { readdir, stat } from 'fs/promises';
import { join } from 'path';

export async function listPDFs() {
  try {
    const uploadDir = join(process.cwd(), 'uploads');
    
    try {
      const files = await readdir(uploadDir);
      const pdfFiles = files.filter(file => file.toLowerCase().endsWith('.pdf'));
      
      // Obter informações detalhadas de cada arquivo
      const filesWithDetails = await Promise.all(
        pdfFiles.map(async (file) => {
          const filePath = join(uploadDir, file);
          const stats = await stat(filePath);
          
          // Extrair nome original removendo timestamp
          const originalName = file.replace(/^\d+-/, '');
          
          return {
            fileName: file,
            originalName: originalName,
            size: stats.size,
            uploadedAt: stats.birthtime,
            filePath: filePath
          };
        })
      );
      
      // Ordenar por data de upload (mais recente primeiro)
      filesWithDetails.sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());
      
      return {
        success: true,
        files: filesWithDetails,
        count: filesWithDetails.length
      };
    } catch (error) {
      // Diretório não existe ou está vazio
      return {
        success: true,
        files: [],
        count: 0
      };
    }
  } catch (error) {
    console.error('❌ Erro ao listar PDFs:', error);
    return { success: false, error: 'Erro ao listar arquivos' };
  }
}
