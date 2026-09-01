import type { Express } from 'express';
import pino from 'pino';

import { GetBlockByIdentifier } from './application/blocks/get-block-by-identifier.js';
import { GetBlockHistory } from './application/blocks/get-block-history.js';
import { GetRecentBlocks } from './application/blocks/get-recent-blocks.js';
import { ObserveBlock } from './application/blocks/observe-block.js';
import { PrimeRecentBlocks } from './application/blocks/prime-recent-blocks.js';
import { UpdateBlockFinality } from './application/blocks/update-block-finality.js';
import { ApplicationError, PersistenceUnavailableError } from './application/common/errors.js';
import {
  CalculateFeeSnapshot,
  FeeSnapshotCache,
} from './application/fees/calculate-fee-snapshot.js';
import { FeeMonitor } from './application/fees/fee-monitor.js';
import { GetCurrentFeeSnapshot } from './application/fees/get-current-fee-snapshot.js';
import { GetFeeHistory } from './application/fees/get-fee-history.js';
import { createApp } from './app.js';
import type { AppConfig } from './config/env.js';
import type { BlockHistoryQuery, FinalityHead } from './domain/blocks/models.js';
import type { EthereumBlockSource, ObservedBlockRepository } from './domain/blocks/ports.js';
import { RecentBlockWindow } from './domain/blocks/recent-block-window.js';
import { FeeHistoryUnavailableError } from './domain/fees/fee-trend.js';
import type {
  EthereumFeeSource,
  FeeSnapshotRepository,
  MempoolSource,
  PriceSource,
} from './domain/fees/ports.js';
import { SystemClock, type Clock } from './domain/shared/clock.js';
import { AlchemyBlockClient } from './infrastructure/alchemy/alchemy-block-client.js';
import { AlchemyFeeClient } from './infrastructure/alchemy/alchemy-fee-client.js';
import { AlchemyMempoolClient } from './infrastructure/alchemy/alchemy-mempool-client.js';
import { CoinbasePriceClient } from './infrastructure/coinbase/coinbase-price-client.js';
import { MongoClientManager } from './infrastructure/mongodb/mongo-client.js';
import { MongoFeeSnapshotRepository } from './infrastructure/mongodb/mongo-fee-snapshot-repository.js';
import { MongoObservedBlockRepository } from './infrastructure/mongodb/mongo-observed-block-repository.js';
import { LiveSseHub } from './interfaces/sse/live-sse-hub.js';

/**
 * Camada: composição e ciclo de vida.
 *
 * Monta adaptadores e casos de uso, inicia fontes externas de maneira tolerante
 * a falhas e coordena shutdown idempotente. A indisponibilidade temporária de
 * MongoDB não impede monitoramento em memória e é tentada novamente com backoff.
 */
/** Espera inicial antes de tentar restabelecer persistência MongoDB. */
const MONGO_RECONNECT_BASE_MS = 5_000;
/** Teto de espera para impedir backoff de MongoDB sem limite. */
const MONGO_RECONNECT_MAX_MS = 60_000;

/** Fonte externa cujo ciclo de vida é controlado pelo runtime. */
interface LifecycleSource {
  /** Abre a fonte depois que casos de uso e listeners estão prontos. */
  start(): void;
  /** Fecha recursos e timers da fonte durante shutdown. */
  stop(): void;
}

/** Fonte de blocos que também entrega novas cabeças por callback. */
interface HeadLifecycleSource {
  /** Inicia fonte e encaminha cada nova cabeça normalizada ao runtime. */
  start(listener: (head: FinalityHead) => void): void;
  /** Interrompe stream de cabeças e libera seu transporte. */
  stop(): void;
}

/** Componente que precisa preparar estruturas persistentes após a conexão. */
interface Initializable {
  /** Inicializa coleções, índices ou estado externo necessário ao componente. */
  initialize(): Promise<void>;
}

/** Subconjunto do gerenciador Mongo necessário à política de reconexão. */
interface MongoLifecycle {
  /** Tenta abrir e validar a conexão persistente. */
  connect(): Promise<void>;
  /** Fecha a conexão uma única vez no desligamento. */
  close(): Promise<void>;
  /** Informa se repositórios podem executar I/O persistente no momento. */
  isAvailable(): boolean;
}

/** Adaptadores injetáveis que tornam a composição testável sem rede real. */
export interface RuntimeAdapters {
  clock: Clock;
  mongo: MongoLifecycle | null;
  feeRepository: FeeSnapshotRepository & Initializable;
  blockRepository: ObservedBlockRepository & Initializable;
  ethereumFeeSource: EthereumFeeSource;
  mempoolSource: MempoolSource & LifecycleSource;
  priceSource: PriceSource & LifecycleSource;
  blockSource: EthereumBlockSource & HeadLifecycleSource;
}

/** Logger estrutural reduzido para que testes verifiquem falhas recuperáveis. */
export interface RuntimeLogger {
  /** Registra transição normal de componente e disponibilidade. */
  info(bindings: object, message: string): void;
  /** Registra degradação da qual o runtime continuará se recuperando. */
  warn(bindings: object, message: string): void;
  /** Reserva saída para erro que impede operação ou desligamento. */
  error(bindings: object, message: string): void;
}

/** Resultado composto: aplicação HTTP e controle idempotente de ciclo de vida. */
export interface Runtime {
  app: Express;
  start(): Promise<void>;
  stop(): Promise<void>;
}

/** Fallback de persistência que permite a API operar sem URI MongoDB configurada. */
class UnavailableFeeRepository implements FeeSnapshotRepository, Initializable {
  /** Não prepara estado, pois o fallback representa banco ausente por definição. */
  async initialize(): Promise<void> {}
  /** Rejeita escrita para que o caso de uso marque o snapshot como degradado. */
  async insert(): Promise<void> {
    throw new PersistenceUnavailableError();
  }
  /** Sinaliza que não há histórico persistido para bootstrap. */
  async findLatest(): Promise<null> {
    throw new FeeHistoryUnavailableError();
  }
  /** Sinaliza indisponibilidade de leitura para cálculo de tendência. */
  async findWindow(): Promise<never[]> {
    throw new FeeHistoryUnavailableError();
  }
  /** Sinaliza indisponibilidade de paginação para a rota de histórico. */
  async findPage(): Promise<never> {
    throw new FeeHistoryUnavailableError();
  }
  /** Declara persistência indisponível para seleção de fallback pela aplicação. */
  isAvailable(): boolean {
    return false;
  }
}

/** Fallback de blocos que mantém a janela em memória quando MongoDB não existe. */
export class UnavailableBlockRepository implements ObservedBlockRepository, Initializable {
  /** Não prepara estado porque nenhuma coleção está disponível neste fallback. */
  async initialize(): Promise<void> {}
  /** Rejeita escrita canônica para o caso de uso continuar de forma degradada. */
  async saveCanonical(): Promise<void> {
    throw new PersistenceUnavailableError();
  }
  /** Rejeita marcação de reorg, que permanece apenas na janela em memória. */
  async markNoncanonical(): Promise<void> {
    throw new PersistenceUnavailableError();
  }
  /** Rejeita recuperação inicial persistida de blocos. */
  async findRecent(): Promise<never[]> {
    throw new PersistenceUnavailableError();
  }
  /** Rejeita paginação persistida enquanto MongoDB não está configurado. */
  async findPage(query: BlockHistoryQuery): Promise<never> {
    void query;
    throw new PersistenceUnavailableError();
  }
  /** Rejeita contexto persistido, resultando em classificação unavailable. */
  async findCanonicalBefore(): Promise<never[]> {
    throw new PersistenceUnavailableError();
  }
  /** Rejeita persistência de promoções sem impedir publicação SSE. */
  async updateFinality(): Promise<void> {
    throw new PersistenceUnavailableError();
  }
  /** Declara que a aplicação deve selecionar caminhos sem persistência. */
  isAvailable(): boolean {
    return false;
  }
}

/**
 * Remove credenciais, caminho e parâmetros de uma URL antes de registrá-la em
 * logs. Valor sem esquema reconhecível vira marcador, nunca é retornado intacto.
 */
export function redactConnectionUrl(value: string): string {
  const schemeEnd = value.indexOf('://');
  if (schemeEnd < 1) return '[redacted-url]';
  const scheme = value.slice(0, schemeEnd + 3);
  const remainder = value.slice(schemeEnd + 3);
  const boundary = [remainder.indexOf('/'), remainder.indexOf('?'), remainder.indexOf('#')]
    .filter((index) => index >= 0)
    .reduce((smallest, index) => Math.min(smallest, index), remainder.length);
  const authority = remainder.slice(0, boundary);
  const credentialsEnd = authority.lastIndexOf('@');
  const host = credentialsEnd >= 0 ? authority.slice(credentialsEnd + 1) : authority;
  return host.length === 0 ? '[redacted-url]' : `${scheme}${host}/[redacted]`;
}

/** Extrai nome de banco da URI sem incluir credenciais, query string ou fragmento. */
function databaseName(uri: string): string {
  const schemeEnd = uri.indexOf('://');
  const remainder = uri.slice(schemeEnd + 3);
  const pathStart = remainder.indexOf('/');
  if (pathStart < 0) return 'alphractal';
  const path = remainder.slice(pathStart + 1).split(/[?#]/, 1)[0];
  return path === undefined || path === '' ? 'alphractal' : decodeURIComponent(path);
}

/** Constrói adaptadores reais apenas na composição, mantendo domínio livre de detalhes. */
function concreteAdapters(config: AppConfig): RuntimeAdapters {
  const clock = new SystemClock();
  let mongo: MongoClientManager | null = null;
  let feeRepository: FeeSnapshotRepository & Initializable;
  let blockRepository: ObservedBlockRepository & Initializable;

  if (config.MONGODB_URI === undefined) {
    feeRepository = new UnavailableFeeRepository();
    blockRepository = new UnavailableBlockRepository();
  } else {
    mongo = new MongoClientManager({
      uri: config.MONGODB_URI,
      databaseName: databaseName(config.MONGODB_URI),
      serverSelectionTimeoutMs: config.PROVIDER_REQUEST_TIMEOUT_MS,
    });
    feeRepository = new MongoFeeSnapshotRepository(mongo);
    blockRepository = new MongoObservedBlockRepository(mongo);
  }

  return {
    clock,
    mongo,
    feeRepository,
    blockRepository,
    ethereumFeeSource: new AlchemyFeeClient({
      httpUrl: config.ALCHEMY_HTTP_URL,
      clock,
      timeoutMs: config.PROVIDER_REQUEST_TIMEOUT_MS,
    }),
    mempoolSource: new AlchemyMempoolClient({ wsUrl: config.ALCHEMY_WS_URL, clock }),
    priceSource: new CoinbasePriceClient({ wsUrl: config.COINBASE_WS_URL, clock }),
    blockSource: new AlchemyBlockClient({
      httpUrl: config.ALCHEMY_HTTP_URL,
      wsUrl: config.ALCHEMY_WS_URL,
      timeoutMs: config.PROVIDER_REQUEST_TIMEOUT_MS,
    }),
  };
}

/** Identifica falhas esperadas que devem gerar aviso e permitir a próxima tentativa. */
function isRecoverable(error: unknown): boolean {
  return (
    error instanceof ApplicationError ||
    error instanceof PersistenceUnavailableError ||
    error instanceof FeeHistoryUnavailableError
  );
}

/**
 * Compõe a API completa e devolve controles de start/stop. Dependências podem
 * ser injetadas por testes; em produção elas são instanciadas com AppConfig.
 */
export function createRuntime(
  config: AppConfig,
  options: { adapters?: RuntimeAdapters; logger?: RuntimeLogger } = {},
): Runtime {
  const adapters = options.adapters ?? concreteAdapters(config);
  const logger = options.logger ?? pino({ enabled: process.env.NODE_ENV !== 'test' });
  const sseHub = new LiveSseHub({ heartbeatMs: config.SSE_HEARTBEAT_MS });
  const cache = new FeeSnapshotCache();
  const recentBlocks = new RecentBlockWindow(20);
  const calculate = new CalculateFeeSnapshot({
    clock: adapters.clock,
    ethereumFeeSource: adapters.ethereumFeeSource,
    mempoolSource: adapters.mempoolSource,
    priceSource: adapters.priceSource,
    repository: adapters.feeRepository,
    cache,
    publisher: sseHub,
  });
  const feeMonitor = new FeeMonitor(calculate);
  const getCurrentFeeSnapshot = new GetCurrentFeeSnapshot(cache, adapters.feeRepository);
  const getFeeHistory = new GetFeeHistory(adapters.feeRepository);
  const observeBlock = new ObserveBlock({
    repository: adapters.blockRepository,
    window: recentBlocks,
    source: adapters.blockSource,
    publisher: sseHub,
    feeMonitor,
  });
  const primeRecentBlocks = new PrimeRecentBlocks({
    repository: adapters.blockRepository,
    window: recentBlocks,
    source: adapters.blockSource,
    observe: observeBlock,
  });
  const updateBlockFinality = new UpdateBlockFinality({
    source: adapters.blockSource,
    repository: adapters.blockRepository,
    window: recentBlocks,
    publisher: sseHub,
  });
  const app = createApp({
    corsOrigins: new Set(config.CORS_ORIGINS),
    getCurrentFeeSnapshot,
    getFeeHistory,
    getRecentBlocks: new GetRecentBlocks(recentBlocks),
    getBlockHistory: new GetBlockHistory(adapters.blockRepository),
    getBlockByIdentifier: new GetBlockByIdentifier({
      repository: adapters.blockRepository,
      source: adapters.blockSource,
    }),
    liveSseHub: sseHub,
  });

  let started = false;
  let stopped = false;
  let feeInterval: ReturnType<typeof setInterval> | null = null;
  let mongoReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let mongoReconnectDelayMs = MONGO_RECONNECT_BASE_MS;
  let mongoConnecting = false;
  let headWork: Promise<void> = Promise.resolve();

  /** Executa monitor e reduz falha recuperável a log, preservando o scheduler. */
  const runFeeMonitor = async () => {
    try {
      await feeMonitor.trigger();
    } catch (error) {
      logger.warn(
        { component: 'fee-monitor', recoverable: isRecoverable(error) },
        'Fee monitor iteration failed',
      );
    }
  };

  /**
   * Tenta conectar, preparar repositórios e restaurar estado. Ao recuperar uma
   * conexão, recompõe janela e snapshot antes de voltar ao fluxo periódico.
   */
  const connectMongo = async (recovering: boolean): Promise<boolean> => {
    if (adapters.mongo === null || mongoConnecting) return false;
    mongoConnecting = true;
    try {
      await adapters.mongo.connect();
      await adapters.feeRepository.initialize();
      await adapters.blockRepository.initialize();
      await getCurrentFeeSnapshot.bootstrap();
      if (recovering) {
        await primeRecentBlocks.execute();
        await runFeeMonitor();
      }
      logger.info({ component: 'mongodb' }, 'MongoDB persistence is available');
      return true;
    } catch {
      logger.warn({ component: 'mongodb' }, 'MongoDB persistence is unavailable; retry scheduled');
      return false;
    } finally {
      mongoConnecting = false;
    }
  };

  /** Agenda tentativas seriais de MongoDB com backoff, canceladas no shutdown. */
  const scheduleMongoReconnect = () => {
    if (adapters.mongo === null || stopped) return;
    mongoReconnectTimer = setTimeout(async () => {
      const connected = adapters.mongo!.isAvailable() || (await connectMongo(true));
      mongoReconnectDelayMs = connected
        ? MONGO_RECONNECT_BASE_MS
        : Math.min(mongoReconnectDelayMs * 2, MONGO_RECONNECT_MAX_MS);
      scheduleMongoReconnect();
    }, mongoReconnectDelayMs);
    mongoReconnectTimer.unref();
  };

  return {
    app,
    /**
     * Inicializa fontes, reidrata estado quando possível e inicia monitores.
     * Chamadas duplicadas ou após stop são ignoradas para evitar recursos duplos.
     */
    async start() {
      if (started || stopped) return;
      started = true;

      await connectMongo(false);
      await getCurrentFeeSnapshot.bootstrap();
      const restored = cache.get();
      if (restored !== null) sseHub.publish({ type: 'fee-snapshot', snapshot: restored });

      adapters.mempoolSource.start();
      adapters.priceSource.start();
      adapters.blockSource.start((head) => {
        headWork = headWork
          .then(async () => {
            await observeBlock.execute(head.hash);
            await updateBlockFinality.execute();
          })
          .catch((error: unknown) => {
            logger.warn(
              { component: 'block-observer', recoverable: isRecoverable(error) },
              'Block observation failed',
            );
          });
      });

      try {
        await primeRecentBlocks.execute();
      } catch (error) {
        logger.warn(
          { component: 'block-bootstrap', recoverable: isRecoverable(error) },
          'Recent block bootstrap was incomplete',
        );
      }
      await runFeeMonitor();
      scheduleMongoReconnect();
      feeInterval = setInterval(() => void runFeeMonitor(), config.FEE_INTERVAL_MS);
      feeInterval.unref();
    },
    /** Fecha timers, streams, SSE e MongoDB exatamente uma vez, aguardando cabeça em curso. */
    async stop() {
      if (stopped) return;
      stopped = true;
      if (feeInterval !== null) clearInterval(feeInterval);
      if (mongoReconnectTimer !== null) clearTimeout(mongoReconnectTimer);
      adapters.blockSource.stop();
      adapters.mempoolSource.stop();
      adapters.priceSource.stop();
      await headWork;
      sseHub.close();
      if (adapters.mongo !== null) await adapters.mongo.close();
    },
  };
}
