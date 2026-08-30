import { type Db, MongoClient } from 'mongodb';

export class MongoPersistenceUnavailableError extends Error {
  constructor() {
    super('MongoDB persistence is unavailable');
    this.name = 'MongoPersistenceUnavailableError';
  }
}

export interface MongoClientManagerOptions {
  uri: string;
  databaseName: string;
  serverSelectionTimeoutMs: number;
}

export interface MongoDatabaseProvider {
  database(): Db;
  isAvailable(): boolean;
  markUnavailable(): void;
}

export class MongoClientManager implements MongoDatabaseProvider {
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private available = false;

  constructor(private readonly options: MongoClientManagerOptions) {}

  async connect(): Promise<void> {
    await this.close();
    const client = new MongoClient(this.options.uri, {
      promoteLongs: false,
      serverSelectionTimeoutMS: this.options.serverSelectionTimeoutMs,
    });

    try {
      await client.connect();
      const database = client.db(this.options.databaseName);
      await database.command({ ping: 1 });
      this.client = client;
      this.db = database;
      this.available = true;
    } catch {
      await client.close().catch(() => undefined);
      this.markUnavailable();
      throw new MongoPersistenceUnavailableError();
    }
  }

  database(): Db {
    if (!this.available || this.db === null) {
      throw new MongoPersistenceUnavailableError();
    }
    return this.db;
  }

  isAvailable(): boolean {
    return this.available;
  }

  markUnavailable(): void {
    this.available = false;
    this.db = null;
  }

  async close(): Promise<void> {
    const client = this.client;
    this.client = null;
    this.markUnavailable();
    if (client !== null) await client.close();
  }
}
