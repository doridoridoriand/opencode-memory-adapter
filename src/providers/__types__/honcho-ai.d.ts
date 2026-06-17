declare module "@honcho-ai/sdk" {
  interface HonchoConfig {
    apiKey?: string;
    baseURL?: string;
  }
  class Honcho {
    constructor(config: HonchoConfig);
    chats: {
      createChat(params: {
        workspaceId: string;
        messages: { role: string; content: string }[];
        customId?: string;
      }): Promise<{ id: string }>;
      retrieveChats(params: { workspaceId: string; limit?: number }): Promise<any[]>;
      deleteChat(workspaceId: string, chatId: string): Promise<void>;
    };
  }
  export default Honcho;
}
