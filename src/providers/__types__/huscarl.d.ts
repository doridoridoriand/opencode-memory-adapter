declare module "@yfedberts/huscarl" {
  interface VikingConfig {
    url?: string;
    apiKey?: string;
  }
  interface Client {
    createDocWithContent(type: string, content: Record<string, unknown>, options?: { tag?: string }): Promise<{ id: string }>;
    search(query: string, limit?: number): Promise<any[]>;
    getDocs(): Promise<any[]>;
    deleteDoc(id: string): Promise<void>;
  }
  function initClient(token?: string, config?: VikingConfig): Client;
  const _default: { initClient: typeof initClient };
  export default _default;
}
