export interface WhatsAppClient { sendText(to: string, text: string): Promise<string>; sendDocument(to: string, mediaId: string, filename: string): Promise<string>; }
export class MockWhatsAppClient implements WhatsAppClient {
  async sendText(): Promise<string> { throw new Error("Envio mockado: configure as credenciais oficiais da Meta"); }
  async sendDocument(): Promise<string> { throw new Error("Envio mockado: configure as credenciais oficiais da Meta"); }
}
