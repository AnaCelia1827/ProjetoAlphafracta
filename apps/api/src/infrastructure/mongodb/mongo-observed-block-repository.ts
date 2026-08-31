import { Long, type Collection } from 'mongodb';

import type { BlockSummary, FinalityChange } from '../../domain/blocks/models.js';
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
