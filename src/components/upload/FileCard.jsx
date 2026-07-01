export default function FileCard({ file }) {
  return (
    <div className="file-card">
      <strong>{file.originalName || file.name}</strong>
      <span>Excel cargado</span>
    </div>
  );
}
