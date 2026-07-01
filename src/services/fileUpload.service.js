function getExtension(fileName) {
  return fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
}

export function validateExcelFiles(files) {
  const fileArray = Array.from(files || []);
  if (![1, 3].includes(fileArray.length)) {
    return { ok: false, message: "Debes cargar 1 Excel con 3 hojas o 3 Excel separados." };
  }
  const invalid = fileArray.find((file) => {
    const ext = getExtension(file.name || "");
    return ext !== ".xlsx" && ext !== ".xls";
  });
  if (invalid) return { ok: false, message: `El archivo ${invalid.name} no es Excel.` };
  return { ok: true, message: "Archivos válidos." };
}

export async function saveExcelFiles(files) {
  if (!window.appAPI?.files?.saveUploadedExcelFiles) throw new Error("No se pudo acceder al sistema de archivos.");
  const fileArray = Array.from(files || []);
  const validation = validateExcelFiles(fileArray);
  if (!validation.ok) throw new Error(validation.message);
  const payload = await Promise.all(fileArray.map(async (file) => ({ name: file.name, type: file.type, size: file.size, lastModified: file.lastModified, arrayBuffer: await file.arrayBuffer() })));
  return window.appAPI.files.saveUploadedExcelFiles(payload);
}

export async function analyzeUploadedExcelFiles() {
  if (!window.appAPI?.files?.analyzeUploadedExcelFiles) throw new Error("No se pudo procesar la información de los Excel.");
  return window.appAPI.files.analyzeUploadedExcelFiles();
}
