// El paquete @types/pdf-parse solo declara la ruta raíz 'pdf-parse'; aquí se
// usa el módulo interno 'pdf-parse/lib/pdf-parse.js' (ver comentario en
// api/admin/inventory-import/parse/route.ts sobre por qué), que tiene la
// misma firma pero necesita su propia declaración.
declare module 'pdf-parse/lib/pdf-parse.js' {
  import PdfParse = require('pdf-parse')
  export = PdfParse
}
