import { ObjectId, type Collection, type Filter } from 'mongodb';
import { z } from 'zod';

import { InvalidQueryError } from '../../application/common/errors.js';
import { FeeHistoryUnavailableError } from '../../domain/fees/fee-trend.js';
import type {
  EstimatedTransferCost,
  FeeHistoryPage,
  FeeHistoryQuery,
  FeeSnapshot,
  FeeTrend,
} from '../../domain/fees/models.js';
import type { FeeSnapshotRepository } from '../../domain/fees/ports.js';
import { rational, type Rational } from '../../domain/shared/units.js';
import { MongoPersistenceUnavailableError, type MongoDatabaseProvider } from './mongo-client.js';

/**
 * Camada: infraestrutura MongoDB.
 *
 * Persiste snapshots atuais em coleção time-series e entrega histórico paginado
 * por cursor opaco. Converte BigInt e razões em representação segura para BSON,
 * preservando precisão e impedindo que snapshots last-known virem evidência.
 */
/** Nome fixo da coleção time-series de recomendações de taxa. */
const COLLECTION_NAME = 'fee_snapshots';
/** Retenção de trinta dias aplicada pelo TTL da coleção. */
const RETENTION_SECONDS = 2_592_000;

/** Forma persistida de uma razão, pois BSON não representa BigInt diretamente. */
interface RationalDocument {
  numerator: string;
  denominator: string;
}

/** Documento Mongo que guarda somente um snapshot de recomendação current. */
interface FeeSnapshotDocument {
  _id?: ObjectId;
  timestamp: Date;
  metadata: { network: 'ethereum-mainnet' };
  recommendationState: 'current';
  recommendedMaxFeeWei: string;
  recommendedPriorityFeeWei: string;
  baseFeeWei: string;
  effectiveGasPriceWei: string;
  estimatedTransferCost: Record<string, unknown>;
  trend24h: Record<string, unknown>;
  confidence: FeeSnapshot['confidence'];
  sampleSize: number;
  dataAgeMs: number;
  sourceUpdatedAt: FeeSnapshot['sourceUpdatedAt'];
  status: FeeSnapshot['status'];
}

/** Valida versão e vínculo da paginação para rejeitar cursores adulterados ou cruzados. */
const CursorSchema = z.object({
  v: z.literal(1),
  from: z.string().datetime(),
  to: z.string().datetime(),
  limit: z.number().int().min(1).max(5000),
  afterTimestamp: z.string().datetime(),
  afterId: z.string().regex(/^[a-fA-F0-9]{24}$/),
});

/** Cursor interno decodificado usado como continuação estável da ordenação Mongo. */
type Cursor = z.infer<typeof CursorSchema>;

/** Erro de cursor inválido que a rota converte em erro de consulta recuperável. */
export class InvalidHistoryCursorError extends InvalidQueryError {
  /** Cria detalhes seguros sem expor conteúdo nem formato interno do cursor. */
  constructor() {
    super(
      [{ field: 'cursor', issue: 'The cursor is invalid or does not match the query' }],
      'The fee history cursor is invalid or does not match the query',
    );
    this.name = 'InvalidHistoryCursorError';
  }
}

/** Serializa BigInt em texto para manter a fração exata em documento BSON. */
function serializeRational(value: Rational): RationalDocument {
  return {
    numerator: value.numerator.toString(),
    denominator: value.denominator.toString(),
  };
}

/** Reconstrói e normaliza razão recebida do armazenamento. */
function deserializeRational(value: unknown): Rational {
  const document = value as RationalDocument;
  return rational(BigInt(document.numerator), BigInt(document.denominator));
}

/** Persiste união de custo sem supor presença de cotação USD. */
function serializeTransferCost(value: EstimatedTransferCost): Record<string, unknown> {
  const base = {
    status: value.status,
    transactionType: value.transactionType,
    gasUnits: value.gasUnits.toString(),
    maxCostEth: serializeRational(value.maxCostEth),
  };
  if (value.status === 'unavailable') return base;

  return {
    ...base,
    ethUsd: serializeRational(value.ethUsd),
    maxCostUsd: serializeRational(value.maxCostUsd),
    priceUpdatedAt: value.priceUpdatedAt,
  };
}

/** Recria união de custo mantendo o estado indisponível explicitamente discriminado. */
function deserializeTransferCost(value: Record<string, unknown>): EstimatedTransferCost {
  const base = {
    transactionType: 'native-eth-transfer' as const,
    gasUnits: 21_000n as const,
    maxCostEth: deserializeRational(value.maxCostEth),
  };
  if (value.status === 'unavailable') {
    return { status: 'unavailable', ...base };
  }

  return {
    status: value.status as 'fresh' | 'stale',
    ...base,
    ethUsd: deserializeRational(value.ethUsd),
    maxCostUsd: deserializeRational(value.maxCostUsd),
    priceUpdatedAt: value.priceUpdatedAt as Date,
  };
}

/** Serializa tendência disponível com razões exatas e preserva estados sem dados. */
function serializeTrend(value: FeeTrend): Record<string, unknown> {
  if (value.status !== 'available') return { ...value };
  return {
    status: value.status,
    windowMinutes: value.windowMinutes,
    percentChange: serializeRational(value.percentChange),
    currentMedianMaxFeeWei: serializeRational(value.currentMedianMaxFeeWei),
    previousMedianMaxFeeWei: serializeRational(value.previousMedianMaxFeeWei),
  };
}

/** Reconstitui o estado de tendência sem transformar ausência em valor numérico. */
function deserializeTrend(value: Record<string, unknown>): FeeTrend {
  if (value.status === 'insufficient-history') {
    return { status: 'insufficient-history', windowMinutes: 5 };
  }
  if (value.status === 'unavailable') {
    return {
      status: 'unavailable',
      windowMinutes: 5,
      reason: 'history-unavailable',
    };
  }
  return {
    status: 'available',
    windowMinutes: 5,
    percentChange: deserializeRational(value.percentChange),
    currentMedianMaxFeeWei: deserializeRational(value.currentMedianMaxFeeWei),
    previousMedianMaxFeeWei: deserializeRational(value.previousMedianMaxFeeWei),
  };
}

/**
 * Converte somente snapshots atuais para persistência. Rejeitar last-known
 * protege o histórico de representar uma nova observação que nunca ocorreu.
 */
function serializeSnapshot(snapshot: FeeSnapshot): FeeSnapshotDocument {
  if (snapshot.recommendationState !== 'current') {
    throw new TypeError('Only current fee snapshots can be serialized');
  }
  return {
    timestamp: snapshot.timestamp,
    metadata: { network: snapshot.network },
    recommendationState: 'current',
    recommendedMaxFeeWei: snapshot.recommendedMaxFeeWei.toString(),
    recommendedPriorityFeeWei: snapshot.recommendedPriorityFeeWei.toString(),
    baseFeeWei: snapshot.baseFeeWei.toString(),
    effectiveGasPriceWei: snapshot.effectiveGasPriceWei.toString(),
    estimatedTransferCost: serializeTransferCost(snapshot.estimatedTransferCost),
    trend24h: serializeTrend(snapshot.trend24h),
    confidence: snapshot.confidence,
    sampleSize: snapshot.sampleSize,
    dataAgeMs: snapshot.dataAgeMs,
    sourceUpdatedAt: snapshot.sourceUpdatedAt,
    status: snapshot.status,
  };
}

/** Recompõe o modelo de domínio de um documento armazenado para leitura e cálculo. */
function deserializeSnapshot(document: FeeSnapshotDocument): FeeSnapshot {
  return {
    timestamp: document.timestamp,
    network: document.metadata.network,
    recommendationState: document.recommendationState,
    recommendedMaxFeeWei: BigInt(document.recommendedMaxFeeWei),
    recommendedPriorityFeeWei: BigInt(document.recommendedPriorityFeeWei),
    baseFeeWei: BigInt(document.baseFeeWei),
    effectiveGasPriceWei: BigInt(document.effectiveGasPriceWei),
    estimatedTransferCost: deserializeTransferCost(document.estimatedTransferCost),
    trend24h: deserializeTrend(document.trend24h),
    confidence: document.confidence,
    sampleSize: document.sampleSize,
    dataAgeMs: document.dataAgeMs,
    sourceUpdatedAt: document.sourceUpdatedAt,
    status: document.status,
  };
}

/** Codifica cursor versionado em texto opaco, sem expor detalhes na API pública. */
function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

/** Decodifica e valida cursor, rejeitando qualquer valor corrompido como consulta inválida. */
function decodeCursor(encoded: string): Cursor {
  try {
    return CursorSchema.parse(JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')));
  } catch {
    throw new InvalidHistoryCursorError();
  }
}

/** Repositório Mongo de snapshots com falhas traduzidas para semântica da aplicação. */
export class MongoFeeSnapshotRepository implements FeeSnapshotRepository {
  /** Recebe gerenciador que controla conexão e disponibilidade compartilhadas. */
  constructor(private readonly manager: MongoDatabaseProvider) {}

  /** Obtém a coleção somente quando o gerenciador confirma conexão saudável. */
  private collection(): Collection<FeeSnapshotDocument> {
    return this.manager.database().collection<FeeSnapshotDocument>(COLLECTION_NAME);
  }

  /**
   * Cria a coleção time-series uma única vez, com metadado de rede e expiração
   * de trinta dias. Qualquer falha torna o armazenamento degradado para o runtime.
   */
  async initialize(): Promise<void> {
    try {
      const database = this.manager.database();
      const existing = await database
        .listCollections({ name: COLLECTION_NAME }, { nameOnly: true })
        .hasNext();
      if (!existing) {
        await database.createCollection(COLLECTION_NAME, {
          timeseries: {
            timeField: 'timestamp',
            metaField: 'metadata',
            granularity: 'seconds',
          },
          expireAfterSeconds: RETENTION_SECONDS,
        });
      }
    } catch (error) {
      this.fail(error);
    }
  }

  /** Insere apenas observações current e traduz falha de escrita para persistência indisponível. */
  async insert(snapshot: FeeSnapshot): Promise<void> {
    if (snapshot.recommendationState !== 'current') return;
    try {
      await this.collection().insertOne(serializeSnapshot(snapshot));
    } catch (error) {
      this.fail(error);
    }
  }

  /** Recupera última observação para bootstrap do cache, em ordem temporal decrescente. */
  async findLatest(): Promise<FeeSnapshot | null> {
    try {
      const document = await this.collection().findOne(
        { 'metadata.network': 'ethereum-mainnet' },
        { sort: { timestamp: -1 } },
      );
      return document === null ? null : deserializeSnapshot(document);
    } catch (error) {
      this.failHistory(error);
    }
  }

  /** Lê intervalo inclusivo ordenado usado na comparação de tendência. */
  async findWindow(from: Date, to: Date): Promise<FeeSnapshot[]> {
    try {
      const documents = await this.collection()
        .find({
          'metadata.network': 'ethereum-mainnet',
          timestamp: { $gte: from, $lte: to },
        })
        .sort({ timestamp: 1, _id: 1 })
        .toArray();
      return documents.map(deserializeSnapshot);
    } catch (error) {
      this.failHistory(error);
    }
  }

  /**
   * Pagina por timestamp e ObjectId, vinculando cursor a intervalo e limite para
   * evitar que ele seja reutilizado em uma consulta com ordenação incompatível.
   */
  async findPage(query: FeeHistoryQuery): Promise<FeeHistoryPage> {
    try {
      const filter: Filter<FeeSnapshotDocument> = {
        'metadata.network': 'ethereum-mainnet',
        timestamp: { $gte: query.from, $lt: query.to },
      };

      if (query.cursor !== undefined) {
        const cursor = decodeCursor(query.cursor);
        if (
          cursor.from !== query.from.toISOString() ||
          cursor.to !== query.to.toISOString() ||
          cursor.limit !== query.limit
        ) {
          throw new InvalidHistoryCursorError();
        }
        filter.$or = [
          { timestamp: { $gt: new Date(cursor.afterTimestamp) } },
          {
            timestamp: new Date(cursor.afterTimestamp),
            _id: { $gt: new ObjectId(cursor.afterId) },
          },
        ];
      }

      const documents = await this.collection()
        .find(filter)
        .sort({ timestamp: 1, _id: 1 })
        .limit(query.limit + 1)
        .toArray();
      const hasMore = documents.length > query.limit;
      const pageDocuments = documents.slice(0, query.limit);
      const last = pageDocuments.at(-1);

      return {
        data: pageDocuments.map(deserializeSnapshot),
        nextCursor:
          hasMore && last?._id
            ? encodeCursor({
                v: 1,
                from: query.from.toISOString(),
                to: query.to.toISOString(),
                limit: query.limit,
                afterTimestamp: last.timestamp.toISOString(),
                afterId: last._id.toHexString(),
              })
            : null,
      };
    } catch (error) {
      if (error instanceof InvalidHistoryCursorError) throw error;
      this.failHistory(error);
    }
  }

  /** Repassa disponibilidade do gerenciador sem fazer uma consulta ao banco. */
  isAvailable(): boolean {
    return this.manager.isAvailable();
  }

  /** Marca conexão indisponível e preserva erro de escrita já normalizado. */
  private fail(error: unknown): never {
    this.manager.markUnavailable();
    if (error instanceof MongoPersistenceUnavailableError) throw error;
    throw new MongoPersistenceUnavailableError();
  }

  /** Converte falhas de leitura em erro de histórico, mantendo cursor inválido distinto. */
  private failHistory(error: unknown): never {
    this.manager.markUnavailable();
    if (error instanceof InvalidHistoryCursorError) throw error;
    throw new FeeHistoryUnavailableError();
  }
}
