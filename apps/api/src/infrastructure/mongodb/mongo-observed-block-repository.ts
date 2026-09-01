import { Long, ObjectId, type Collection, type Filter } from 'mongodb';
import { z } from 'zod';

import { InvalidQueryError } from '../../application/common/errors.js';
import type {
  BlockHistoryPage,
  BlockHistoryQuery,
  BlockSummary,
  FinalityChange,
} from '../../domain/blocks/models.js';
import type { ObservedBlockRepository } from '../../domain/blocks/ports.js';
import { rational, type Rational } from '../../domain/shared/units.js';
import { MongoPersistenceUnavailableError, type MongoDatabaseProvider } from './mongo-client.js';

/**
 * Camada: infraestrutura MongoDB.
 *
 * Guarda observações de bloco e canonicidade com retenção de trinta dias. Os
 * índices preservam uma versão canônica por altura e permitem distinguir reorg
 * de atualização de finality ao reconstruir janelas e contexto histórico.
 */
/** Nome da coleção de observações normalizadas de bloco. */
const COLLECTION_NAME = 'observed_blocks';
/** Retenção de trinta dias aplicada ao índice TTL dos blocos. */
const RETENTION_SECONDS = 2_592_000;

/** Representação BSON de razão, necessária para valores de taxa não arredondados. */
interface RationalDocument {
  numerator: string;
  denominator: string;
}

/** Documento persistido de bloco, incluindo marcador de canonicidade para reorg. */
interface ObservedBlockDocument {
  network: 'ethereum-mainnet';
  number: Long;
  hash: string;
  timestamp: Date;
  finality: BlockSummary['finality'];
  feeLevel: BlockSummary['feeLevel'];
  baseFeeWei: string;
  medianPriorityFeeWei: RationalDocument;
  effectiveGasPriceWei: RationalDocument;
  gasUsed: string;
  gasLimit: string;
  utilization: RationalDocument;
  transactionCount: number;
  provider: 'alchemy';
  canonical: boolean;
}

/** Valida a versão e os limites de um cursor de histórico de blocos. */
const BlockCursorSchema = z.object({
  v: z.literal(1),
  limit: z.number().int().min(1).max(50),
  anchorNumber: z.string().regex(/^(0|[1-9]\d*)$/),
  afterNumber: z.string().regex(/^(0|[1-9]\d*)$/),
  afterId: z.string().regex(/^[a-fA-F0-9]{24}$/),
});

/** Cursor validado que preserva a ordenação por altura e ObjectId. */
type BlockCursor = z.infer<typeof BlockCursorSchema>;

/** Rejeita cursores adulterados ou incompatíveis com a consulta original. */
class InvalidBlockHistoryCursorError extends InvalidQueryError {
  constructor() {
    super(
      [{ field: 'cursor', issue: 'The cursor is invalid or does not match the query' }],
      'The block history cursor is invalid or does not match the query',
    );
    this.name = 'InvalidBlockHistoryCursorError';
  }
}

/** Converte razão BigInt para texto antes de gravar no BSON. */
function serializeRational(value: Rational): RationalDocument {
  return {
    numerator: value.numerator.toString(),
    denominator: value.denominator.toString(),
  };
}

/** Restaura e normaliza razão armazenada para o modelo de domínio. */
function deserializeRational(value: RationalDocument): Rational {
  return rational(BigInt(value.numerator), BigInt(value.denominator));
}

/** Serializa bloco observado como canônico até que um reorg prove o contrário. */
function serializeBlock(block: BlockSummary): ObservedBlockDocument {
  return {
    network: block.network,
    number: Long.fromBigInt(block.number),
    hash: block.hash,
    timestamp: block.timestamp,
    finality: block.finality,
    feeLevel: block.feeLevel,
    baseFeeWei: block.baseFeeWei.toString(),
    medianPriorityFeeWei: serializeRational(block.medianPriorityFeeWei),
    effectiveGasPriceWei: serializeRational(block.effectiveGasPriceWei),
    gasUsed: block.gasUsed.toString(),
    gasLimit: block.gasLimit.toString(),
    utilization: serializeRational(block.utilization),
    transactionCount: block.transactionCount,
    provider: block.provider,
    canonical: true,
  };
}

/** Recompõe resumo de bloco mantendo precisão de gas, taxas e utilização. */
function deserializeBlock(document: ObservedBlockDocument): BlockSummary {
  return {
    network: document.network,
    number: document.number.toBigInt(),
    hash: document.hash as BlockSummary['hash'],
    timestamp: document.timestamp,
    finality: document.finality,
    feeLevel: document.feeLevel,
    baseFeeWei: BigInt(document.baseFeeWei),
    medianPriorityFeeWei: deserializeRational(document.medianPriorityFeeWei),
    effectiveGasPriceWei: deserializeRational(document.effectiveGasPriceWei),
    gasUsed: BigInt(document.gasUsed),
    gasLimit: BigInt(document.gasLimit),
    utilization: deserializeRational(document.utilization),
    transactionCount: document.transactionCount,
    provider: document.provider,
  };
}

/** Codifica cursor versionado em texto opaco para a fronteira HTTP. */
function encodeBlockCursor(cursor: BlockCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

/** Decodifica e valida cursor sem revelar sua estrutura em falhas de entrada. */
function decodeBlockCursor(encoded: string): BlockCursor {
  try {
    return BlockCursorSchema.parse(JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')));
  } catch {
    throw new InvalidBlockHistoryCursorError();
  }
}

/** Repositório Mongo que implementa a memória persistente de blocos observados. */
export class MongoObservedBlockRepository implements ObservedBlockRepository {
  /** Recebe a conexão controlada pelo runtime, comum a todos os repositórios. */
  constructor(private readonly manager: MongoDatabaseProvider) {}

  /** Acessa a coleção apenas quando MongoDB permanece disponível. */
  private collection(): Collection<ObservedBlockDocument> {
    return this.manager.database().collection<ObservedBlockDocument>(COLLECTION_NAME);
  }

  /**
   * Cria coleção e índices de identidade, canonicidade, janela e TTL. O índice
   * parcial permite uma única versão canônica por altura, mesmo com reorgs retidos.
   */
  async initialize(): Promise<void> {
    try {
      const database = this.manager.database();
      const existing = await database
        .listCollections({ name: COLLECTION_NAME }, { nameOnly: true })
        .hasNext();
      if (!existing) await database.createCollection(COLLECTION_NAME);

      await this.collection().createIndexes([
        {
          key: { network: 1, hash: 1 },
          unique: true,
          name: 'network_hash_unique',
        },
        {
          key: { network: 1, number: -1 },
          unique: true,
          partialFilterExpression: { canonical: true },
          name: 'canonical_network_number_unique',
        },
        {
          key: { network: 1, timestamp: -1 },
          name: 'canonical_window',
        },
        {
          key: { timestamp: 1 },
          expireAfterSeconds: RETENTION_SECONDS,
          name: 'ttl_30_days',
        },
      ]);
    } catch (error) {
      this.fail(error);
    }
  }

  /** Insere ou atualiza a observação canônica por hash, preservando sua identidade. */
  async saveCanonical(block: BlockSummary): Promise<void> {
    try {
      const document = serializeBlock(block);
      await this.collection().updateOne(
        { network: block.network, hash: block.hash },
        { $set: document },
        { upsert: true },
      );
    } catch (error) {
      this.fail(error);
    }
  }

  /**
   * Marca versões concorrentes da mesma altura como não canônicas após reorg,
   * mantendo-as para auditoria sem violar o índice canônico parcial.
   */
  async markNoncanonical(
    network: 'ethereum-mainnet',
    number: bigint,
    exceptHash: BlockSummary['hash'],
  ): Promise<void> {
    try {
      await this.collection().updateMany(
        {
          network,
          number: Long.fromBigInt(number),
          hash: { $ne: exceptHash },
          canonical: true,
        },
        { $set: { canonical: false } },
      );
    } catch (error) {
      this.fail(error);
    }
  }

  /** Recupera janela canônica recente em ordem decrescente de altura. */
  async findRecent(limit: number): Promise<BlockSummary[]> {
    try {
      const documents = await this.collection()
        .find({ network: 'ethereum-mainnet', canonical: true })
        .sort({ number: -1 })
        .limit(limit)
        .toArray();
      return documents.map(deserializeBlock);
    } catch (error) {
      this.fail(error);
    }
  }

  /** Pagina blocos canônicos sem que inserções novas alterem as páginas subsequentes. */
  async findPage(query: BlockHistoryQuery): Promise<BlockHistoryPage> {
    try {
      const filter: Filter<ObservedBlockDocument> = {
        network: 'ethereum-mainnet',
        canonical: true,
      };
      let anchorNumber: bigint | null = null;

      if (query.cursor !== undefined) {
        const cursor = decodeBlockCursor(query.cursor);
        if (cursor.limit !== query.limit) throw new InvalidBlockHistoryCursorError();
        anchorNumber = BigInt(cursor.anchorNumber);
        const afterNumber = Long.fromBigInt(BigInt(cursor.afterNumber));
        filter.number = { $lte: Long.fromBigInt(anchorNumber) };
        filter.$or = [
          { number: { $lt: afterNumber } },
          { number: afterNumber, _id: { $lt: new ObjectId(cursor.afterId) } },
        ];
      }

      const documents = await this.collection()
        .find(filter)
        .sort({ number: -1, _id: -1 })
        .limit(query.limit + 1)
        .toArray();
      const hasMore = documents.length > query.limit;
      const pageDocuments = documents.slice(0, query.limit);
      const first = pageDocuments[0];
      const last = pageDocuments.at(-1);
      const effectiveAnchor = anchorNumber ?? first?.number.toBigInt() ?? null;

      return {
        data: pageDocuments.map(deserializeBlock),
        nextCursor:
          hasMore && effectiveAnchor !== null && last?._id
            ? encodeBlockCursor({
                v: 1,
                limit: query.limit,
                anchorNumber: effectiveAnchor.toString(),
                afterNumber: last.number.toBigInt().toString(),
                afterId: last._id.toHexString(),
              })
            : null,
      };
    } catch (error) {
      if (error instanceof InvalidBlockHistoryCursorError) throw error;
      this.fail(error);
    }
  }

  /** Recupera contexto canônico anterior ao bloco para classificação relativa de taxa. */
  async findCanonicalBefore(timestamp: Date, from: Date): Promise<BlockSummary[]> {
    try {
      const documents = await this.collection()
        .find({
          network: 'ethereum-mainnet',
          canonical: true,
          timestamp: { $gte: from, $lt: timestamp },
        })
        .sort({ timestamp: 1 })
        .toArray();
      return documents.map(deserializeBlock);
    } catch (error) {
      this.fail(error);
    }
  }

  /** Atualiza em lote promoções de finality, ignorando lote vazio para evitar I/O inútil. */
  async updateFinality(changes: FinalityChange[]): Promise<void> {
    if (changes.length === 0) return;
    try {
      await this.collection().bulkWrite(
        changes.map((change) => ({
          updateOne: {
            filter: {
              network: 'ethereum-mainnet',
              number: Long.fromBigInt(change.number),
              hash: change.hash,
              canonical: true,
            },
            update: { $set: { finality: change.finality } },
          },
        })),
      );
    } catch (error) {
      this.fail(error);
    }
  }

  /** Repassa disponibilidade compartilhada para a aplicação escolher o fallback. */
  isAvailable(): boolean {
    return this.manager.isAvailable();
  }

  /** Invalida a conexão após falha e normaliza o erro para persistência recuperável. */
  private fail(error: unknown): never {
    this.manager.markUnavailable();
    if (error instanceof MongoPersistenceUnavailableError) throw error;
    throw new MongoPersistenceUnavailableError();
  }
}
