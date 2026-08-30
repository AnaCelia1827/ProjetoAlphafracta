export interface Rational {
  numerator: bigint;
  denominator: bigint;
}

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

export function ceilRational(value: Rational): bigint {
  const normalized = rational(value.numerator, value.denominator);
  if (normalized.numerator >= 0n) {
    return (normalized.numerator + normalized.denominator - 1n) / normalized.denominator;
  }

  return normalized.numerator / normalized.denominator;
}

export function compareRationals(left: Rational, right: Rational): number {
  const delta = left.numerator * right.denominator - right.numerator * left.denominator;
  return delta < 0n ? -1 : delta > 0n ? 1 : 0;
}

export function multiplyRationals(left: Rational, right: Rational): Rational {
  return rational(left.numerator * right.numerator, left.denominator * right.denominator);
}

export function addRationals(left: Rational, right: Rational): Rational {
  return rational(
    left.numerator * right.denominator + right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

export function ceilDivide(numerator: bigint, denominator: bigint): bigint {
  return ceilRational(rational(numerator, denominator));
}
