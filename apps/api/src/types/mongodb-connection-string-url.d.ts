/**
 * Camada: compatibilidade de tipos.
 *
 * Declara a pequena superfície do pacote de parsing usada pelo runtime até que
 * ele ofereça tipos próprios, sem introduzir dependência de implementação.
 */
declare module 'mongodb-connection-string-url' {
  /** Constrói um parser de URI MongoDB para validação antecipada de configuração. */
  export class ConnectionString {
    constructor(uri: string);
  }
}
