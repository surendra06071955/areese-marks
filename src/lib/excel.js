import * as XLSX from 'xlsx';
import { shareFile } from './share';

export const STUDENT_COLUMNS = ['roll', 'name', 'batch_id', 'class', 'stream', 'father', 'phone', 'parent_phone'];

export async function readSheet(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: '' });
}

// Accepts flexible headers (Roll No, Name, Batch, Class, Stream, Father Name, Mobile, Parent Mobile ...)
export function mapStudentRows(rows, batches) {
  const byName = {};
  batches.forEach((b) => { byName[b.batch_id.toLowerCase()] = b.batch_id; byName[b.name.toLowerCase()] = b.batch_id; });
  // Returns undefined when the column is absent, so existing values are kept on re-import.
  const pick = (r, keys) => {
    for (const k of Object.keys(r)) {
      const kk = k.toLowerCase().replace(/[^a-z]/g, '');
      if (keys.includes(kk)) return String(r[k]).trim();
    }
    return undefined;
  };
  return rows.map((r) => {
    const batchRaw = pick(r, ['batchid', 'batch', 'batchname']) || '';
    const o = {
      roll: pick(r, ['roll', 'rollno', 'rollnumber', 'rollnum']),
      name: pick(r, ['name', 'studentname', 'student']),
      batch_id: byName[batchRaw.toLowerCase()] || batchRaw,
      class: pick(r, ['class', 'std', 'standard']),
      stream: pick(r, ['stream', 'course']),
      father: pick(r, ['father', 'fathername', 'fathersname', 'parentname']),
      phone: pick(r, ['phone', 'mobile', 'mobileno', 'studentmobile', 'contact']),
      parent_phone: pick(r, ['parentphone', 'parentmobile', 'fathermobile', 'guardianmobile', 'whatsapp']),
    };
    if (o.stream) o.stream = o.stream.toUpperCase();
    Object.keys(o).forEach((k) => o[k] === undefined && delete o[k]);
    return o;
  }).filter((r) => r.name);
}

export function exportRows(rows, name, sheetName = 'Sheet1') {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const b64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
  return shareFile(b64, name.endsWith('.xlsx') ? name : name + '.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

export function studentTemplate(batches) {
  const rows = [{ roll: '1', name: 'Rahul Sharma', batch_id: batches[0]?.batch_id || 'B01', class: '11', stream: 'JEE', father: 'Suresh Sharma', phone: '9876543210', parent_phone: '9876500000' }];
  return exportRows(rows, 'students_template.xlsx', 'Students');
}
