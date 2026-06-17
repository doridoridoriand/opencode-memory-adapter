declare module "@honcho-ai/sdk" {
  export interface MessageInput {
    peerId: string;
    content: string;
    metadata?: Record<string, unknown>;
  }

  export interface Message {
    id: string;
    content: string;
    sessionId: string;
    metadata: Record<string, unknown>;
    createdAt: string;
  }

  export interface Page<T> {
    items: T[];
    toArray(): Promise<T[]>;
  }

  export class Peer {
    message(content: string, options?: { metadata?: Record<string, unknown> }): MessageInput;
  }

  export class Session {
    readonly id: string;
    readonly metadata?: Record<string, unknown>;
    addPeers(peers: Peer | string | Array<Peer | string>): Promise<void>;
    addMessages(messages: MessageInput | MessageInput[]): Promise<Message[]>;
    messages(options?: {
      filters?: Record<string, unknown>;
      page?: number;
      size?: number;
      reverse?: boolean;
    }): Promise<Page<Message>>;
    getMetadata(): Promise<Record<string, unknown>>;
    delete(): Promise<void>;
  }

  export class Honcho {
    constructor(options?: {
      apiKey?: string;
      baseURL?: string;
      workspaceId?: string;
    });
    peer(id: string, options?: { metadata?: Record<string, unknown> }): Promise<Peer>;
    session(id: string, options?: { metadata?: Record<string, unknown> }): Promise<Session>;
    search(query: string, options?: { filters?: Record<string, unknown>; limit?: number }): Promise<Message[]>;
    sessions(options?: {
      filters?: Record<string, unknown>;
      page?: number;
      size?: number;
      reverse?: boolean;
    }): Promise<Page<Session>>;
  }
}
