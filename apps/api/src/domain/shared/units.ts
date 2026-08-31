/**
 * Camada: domínio compartilhado.
 *
 * Centraliza aritmética racional com BigInt para valores em wei e conversões
 * financeiras. Frações normalizadas mantêm precisão até a serialização HTTP.
 */
/** Representa uma fração reduzida com denominador sempre positivo. */
export interface Rational {
  numerator: bigint;
  denominator: bigint;
}

/** Calcula o máximo divisor comum usado para reduzir uma fração sem perda. */
function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;

  while (b !== 0n) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }

  return a;
}

/** Cria uma fração canônica e rejeita divisões matematicamente inválidas. */
export function rational(numerator: bigint, denominator = 1n): Rational {
  if (denominator === 0n) {
    throw new RangeError('A rational denominator cannot be zero');
  }

  const sign = denominator < 0n ? -1n : 1n;
  const signedNumerator = numerator * sign;
  const positiveDenominator = denominator * sign;
  const divisor = greatestCommonDivisor(signedNumerator, positiveDenominator) || 1n;

  return {
    numerator: signedNumerator / divisor,
    denominator: positiveDenominator / divisor,
  };
}

/** Arredonda uma fração para cima, preservando a regra também para negativos. */
export function ceilRational(value: Rational): bigint {
  const normalized = rational(value.numerator, value.denominator);
  if (normalized.numerator >= 0n) {
    return (normalized.numerator + normalized.denominator - 1n) / normalized.denominator;
  }

  return normalized.numerator / normalized.denominator;
}

/** Compara duas frações por produto cruzado, sem conversão para Number. */
export function compareRationals(left: Rational, right: Rational): number {
  const delta = left.numerator * right.denominator - right.numerator * left.denominator;
  return delta < 0n ? -1 : delta > 0n ? 1 : 0;
}

/** Multiplica duas frações e devolve o resultado já reduzido. */
export function multiplyRationals(left: Rational, right: Rational): Rational {
  return rational(left.numerator * right.numerator, left.denominator * right.denominator);
}

/** Subtrai frações preservando um denominador comum exato. */
export function subtractRationals(left: Rational, right: Rational): Rational {
  return rational(
    left.numerator * right.denominator - right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

/** Divide frações e rejeita explicitamente o divisor racional nulo. */
export function divideRationals(left: Rational, right: Rational): Rational {
  if (right.numerator === 0n) {
    throw new RangeError('Cannot divide by zero');
  }

  return rational(left.numerator * right.denominator, left.denominator * right.numerator);
}

/** Soma frações preservando um denominador comum exato. */
export function addRationals(left: Rational, right: Rational): Rational {
  return rational(
    left.numerator * right.denominator + right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

/** Atalho para divisão inteira arredondada para cima com as mesmas garantias. */
export function ceilDivide(numerator: bigint, denominator: bigint): bigint {
  return ceilRational(rational(numerator, denominator));
}

/**
 * Converte decimal não negativo canônico em fração, ou null quando o texto não
 * representa um número seguro para a fronteira de domínio.
 */
export function decimalStringToRational(value: string): Rational | null {
  const match = /^(0|[1-9]\d*)(?:\.(\d+))?$/.exec(value);
  if (match === null) return null;

  const integer = match[1]!;
  const fraction = match[2] ?? '';
  const denominator = 10n ** BigInt(fraction.length);
  return rational(BigInt(`${integer}${fraction}`), denominator);
}
