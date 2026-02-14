#!/usr/bin/env node

/**
 * Script para convertir imágenes JPG/PNG a WebP
 * Uso: node scripts/convert-images-webp.js [directorio]
 *
 * Ejemplo:
 *   node scripts/convert-images-webp.js apps/web/public/images
 */

const sharp = require('sharp')
const fs = require('fs').promises
const path = require('path')

// Configuración
const DEFAULT_QUALITY = 85
const SUPPORTED_FORMATS = /\.(jpg|jpeg|png)$/i

/**
 * Convierte una imagen a formato WebP
 */
async function convertToWebP(inputPath, quality = DEFAULT_QUALITY) {
  try {
    const outputPath = inputPath.replace(SUPPORTED_FORMATS, '.webp')

    // Si ya existe el WebP y es más reciente, skip
    try {
      const inputStats = await fs.stat(inputPath)
      const outputStats = await fs.stat(outputPath)

      if (outputStats.mtime > inputStats.mtime) {
        console.log(`⏭️  Skip (ya existe): ${path.basename(outputPath)}`)
        return
      }
    } catch {
      // El archivo WebP no existe, continuar
    }

    // Convertir a WebP
    await sharp(inputPath)
      .webp({ quality })
      .toFile(outputPath)

    // Calcular ahorro de espacio
    const inputStats = await fs.stat(inputPath)
    const outputStats = await fs.stat(outputPath)
    const savings = ((1 - outputStats.size / inputStats.size) * 100).toFixed(1)
    const inputSizeKB = (inputStats.size / 1024).toFixed(1)
    const outputSizeKB = (outputStats.size / 1024).toFixed(1)

    console.log(
      `✅ ${path.basename(inputPath)} → ${path.basename(outputPath)} ` +
      `(${inputSizeKB}KB → ${outputSizeKB}KB, ${savings}% más pequeño)`
    )
  } catch (error) {
    console.error(`❌ Error convirtiendo ${inputPath}:`, error.message)
  }
}

/**
 * Procesa un directorio recursivamente
 */
async function processDirectory(dirPath) {
  let totalFiles = 0
  let convertedFiles = 0
  let totalSavings = 0

  async function processDir(currentDir) {
    try {
      const entries = await fs.readdir(currentDir, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name)

        if (entry.isDirectory()) {
          await processDir(fullPath)
        } else if (SUPPORTED_FORMATS.test(entry.name)) {
          totalFiles++
          await convertToWebP(fullPath)
          convertedFiles++
        }
      }
    } catch (error) {
      console.error(`❌ Error procesando directorio ${currentDir}:`, error.message)
    }
  }

  await processDir(dirPath)

  return { totalFiles, convertedFiles }
}

/**
 * Función principal
 */
async function main() {
  const targetDir = process.argv[2] || './apps/web/public/images'

  console.log('\n🖼️  Convertidor de Imágenes a WebP\n')
  console.log(`📁 Directorio: ${targetDir}`)
  console.log(`⚙️  Calidad WebP: ${DEFAULT_QUALITY}\n`)

  // Verificar que el directorio existe
  try {
    await fs.access(targetDir)
  } catch {
    console.error(`❌ Error: El directorio "${targetDir}" no existe`)
    process.exit(1)
  }

  const startTime = Date.now()

  // Procesar directorio
  const { totalFiles, convertedFiles } = await processDirectory(targetDir)

  const duration = ((Date.now() - startTime) / 1000).toFixed(2)

  console.log('\n✨ Conversión completada!')
  console.log(`📊 Archivos procesados: ${totalFiles}`)
  console.log(`✅ Archivos convertidos: ${convertedFiles}`)
  console.log(`⏱️  Tiempo: ${duration}s\n`)

  if (convertedFiles === 0 && totalFiles > 0) {
    console.log('ℹ️  Todos los archivos WebP ya existen y están actualizados\n')
  }
}

// Ejecutar
main().catch((error) => {
  console.error('\n❌ Error fatal:', error)
  process.exit(1)
})
