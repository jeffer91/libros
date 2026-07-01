export async function generateBookDraft() {
  if (!window.appAPI?.book?.generateDraft) {
    throw new Error("No se pudo generar el borrador del libro.");
  }
  return window.appAPI.book.generateDraft();
}
