import * as XLSX from 'xlsx'
import mammoth from 'mammoth'

/**
 * Parse uploaded file and extract plain text content.
 * Supports: .xlsx, .xls, .csv, .docx, .txt
 * For Excel files, preserves column headers for better AI parsing.
 */
export async function parseFileContent(file) {
  const name = file.name.toLowerCase()

  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    return parseExcel(file)
  }
  if (name.endsWith('.csv')) {
    return parseCSV(file)
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
  const allSheets = []

  workbook.SheetNames.forEach(sheetName => {
    const sheet = workbook.Sheets[sheetName]
    const json = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
    
    if (json.length === 0) return
    
    // Find header row (first non-empty row)
    let headerRow = null
    let headerIndex = -1
    for (let i = 0; i < json.length; i++) {
      const row = json[i]
      const nonEmpty = row.filter(c => String(c).trim())
      if (nonEmpty.length >= 3) {
        headerRow = row.map(c => String(c).trim())
        headerIndex = i
        break
      }
    }
    
    if (!headerRow) {
      // Fallback: just join all rows
      const lines = []
      lines.push(`--- 工作表：${sheetName} ---`)
      json.forEach(row => {
        const text = row.filter(cell => String(cell).trim()).join(' | ')
        if (text.trim()) lines.push(text)
      })
      allSheets.push(lines.join('\n'))
      return
    }

    // Output structured format with column labels
    const lines = []
    lines.push(`--- 工作表：${sheetName} ---`)
    lines.push(`列名：${headerRow.join(' | ')}`)
    lines.push('---数据行---')
    
    for (let i = headerIndex + 1; i < json.length; i++) {
      const row = json[i]
      const parts = []
      for (let j = 0; j < headerRow.length; j++) {
        const colName = headerRow[j]
        const value = String(row[j] || '').trim().replace(/\n/g, ' ')
        if (colName && value) {
          parts.push(`${colName}：${value}`)
        } else if (value) {
          parts.push(value)
        }
      }
      if (parts.length > 0) {
        lines.push(parts.join(' | '))
      }
    }
    
    allSheets.push(lines.join('\n'))
  })

  return allSheets.join('\n\n')
}

async function parseCSV(file) {
  const text = await parseText(file)
  const lines = text.split('\n').filter(l => l.trim())
  if (lines.length === 0) return text
  
  // Check if it looks like a CSV with headers
  const header = lines[0]
  if (header.includes(',') || header.includes('\t')) {
    const separator = header.includes('\t') ? '\t' : ','
    const headers = header.split(separator).map(h => h.trim().replace(/"/g, ''))
    const result = [`列名：${headers.join(' | ')}`, '---数据行---']
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(separator).map(v => v.trim().replace(/"/g, ''))
      const parts = []
      for (let j = 0; j < headers.length; j++) {
        if (values[j]) {
          parts.push(`${headers[j]}：${values[j]}`)
        }
      }
      if (parts.length > 0) result.push(parts.join(' | '))
    }
    return result.join('\n')
  }
  
  return text
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
