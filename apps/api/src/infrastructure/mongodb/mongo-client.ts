import { type Db, MongoClient } from 'mongodb';

import { PersistenceUnavailableError } from '../../application/common/errors.js';

/**
 * Camada: infraestrutura MongoDB.
 *
 * Centraliza conexão e disponibilidade do banco. Repositórios consultam esta
 * porta para converter falhas temporárias em degradação, sem administrar sockets
 * ou descobrir URI repetidamente.
 */
/** Erro de MongoDB que preserva a semântica recuperável da aplicação. */
export class MongoPersistenceUnavailableError extends PersistenceUnavailableError {
  /** Mantém nome específico para observabilidade, sem alterar a fronteira pública. */
  constructor() {
    super();
    this.name = 'MongoPersistenceUnavailableError';
  }
}

/** Dados de conexão já validados na configuração do runtime. */
export interface MongoClientManagerOptions {
  uri: string;
  databaseName: string;
  serverSelectionTimeoutMs: number;
}

/** Capacidade mínima consumida por repositórios sem conhecer o cliente concreto. */
export interface MongoDatabaseProvider {
  /** Retorna banco conectado ou lança indisponibilidade tipada. */
  database(): Db;
  /** Informa se operações persistentes podem ser tentadas no instante atual. */
  isAvailable(): boolean;
  /** Invalida conexão após uma falha para evitar novas tentativas cegas. */
  markUnavailable(): void;
}

/** Gerencia uma única conexão MongoDB e suas transições seguras de disponibilidade. */
export class MongoClientManager implements MongoDatabaseProvider {
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private available = false;

  /** Recebe URI, banco e timeout definidos pelo ambiente. */
  constructor(private readonly options: MongoClientManagerOptions) {}

  /**
   * Reconecta do zero e só marca disponível após ping bem-sucedido. Em qualquer
   * falha fecha recursos parciais para que o runtime possa tentar novamente.
   */
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

  /** Retorna o banco ativo ou evita acesso a uma conexão já degradada. */
  database(): Db {
    if (!this.available || this.db === null) {
      throw new MongoPersistenceUnavailableError();
    }
    return this.db;
  }

  /** Expõe disponibilidade atual sem causar I/O adicional. */
  isAvailable(): boolean {
    return this.available;
  }

  /** Limpa referência de banco após erro para impedir reutilização inconsistente. */
  markUnavailable(): void {
    this.available = false;
    this.db = null;
  }

  /** Fecha cliente ativo de modo seguro e restaura estado indisponível. */
  async close(): Promise<void> {
    const client = this.client;
    this.client = null;
    this.markUnavailable();
    if (client !== null) await client.close();
  }
}
