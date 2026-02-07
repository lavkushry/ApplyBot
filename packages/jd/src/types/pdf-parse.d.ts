declare module 'pdf-parse' {
  interface PDFParseResult {
    text: string;
    numpages: number;
    info: Record<string, unknown>;
  }

  function pdfParse(buffer: Buffer): Promise<PDFParseResult>;
  export default pdfParse;
}
