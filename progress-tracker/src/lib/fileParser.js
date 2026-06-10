import * as XLSX from 'xlsx'
import mammoth from 'mammoth'

/**
 * Parse uploaded file and extract plain text content.
 * Supports: .xlsx, .xls, .csv, .docx, .txt
 */
export async function parseFileContent(file) {
  const name = file.name.toLowerCase()

  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    return parseExcel(file)
  }
  if (name.endsWith('.csv')) {
    return parseText(file)
  }
  if (name.endsWith('.docx')) {
    return parseDocx(file)
  }
  if (name.endsWith('.txt')) {
    return parseText(file)
  }

  throw new Error('不支持的文件格式，请上传 .xlsx / .csv / .docx / .txt')
}

async function parseExcel(file) {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })
  const lines = []

  workbook.SheetNames.forEach(sheetName => {
    const sheet = workbook.Sheets[sheetName]
    const json = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
    lines.push(`--- 工作表：${sheetName} ---`)
    json.forEach(row => {
      const text = row.filter(cell => String(cell).trim()).join(' | ')
      if (text.trim()) lines.push(text)
    })
  })

  return lines.join('\n')
}

async function parseDocx(file) {
  const buffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer: buffer })
  return result.value
}

async function parseText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsText(file)
  })
}
