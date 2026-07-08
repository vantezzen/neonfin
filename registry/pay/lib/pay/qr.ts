export const WALLET_QUERY_PARAM = "__pay_wallet";

export type QrCode = {
  size: number;
  modules: boolean[][];
};

export function createWalletTransferUrl(
  currentUrl: string,
  code: string,
  param = WALLET_QUERY_PARAM,
): string {
  const next = new URL(currentUrl);
  next.searchParams.set(param, code);
  next.hash = "";
  return next.toString();
}

export function readWalletCode(
  value: string,
  param = WALLET_QUERY_PARAM,
): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed).searchParams.get(param) ?? trimmed;
  } catch {
    return trimmed;
  }
}

const QR_DATA_CODEWORDS = [0, 19, 34, 55, 80, 108];
const QR_ECC_CODEWORDS = [0, 7, 10, 15, 20, 26];
const QR_ALIGNMENT = [[], [], [6, 18], [6, 22], [6, 26], [6, 30]];
const QR_FORMAT_L_MASK_0 = 0b111011111000100;

export function createQr(value: string): QrCode | null {
  const bytes = [...new TextEncoder().encode(value)];
  const version = QR_DATA_CODEWORDS.findIndex(
    (capacity, v) => v > 0 && neededBits(bytes.length) <= capacity * 8,
  );
  if (version < 1) return null;

  const data = createDataCodewords(bytes, QR_DATA_CODEWORDS[version]);
  const ecc = reedSolomon(data, QR_ECC_CODEWORDS[version]);
  const size = 17 + version * 4;
  const modules = Array.from({ length: size }, () =>
    Array<boolean | null>(size).fill(null),
  );
  const reserved = Array.from({ length: size }, () =>
    Array<boolean>(size).fill(false),
  );

  function set(x: number, y: number, dark: boolean, reserve = true) {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    modules[y][x] = dark;
    if (reserve) reserved[y][x] = true;
  }

  drawFinder(set, 0, 0);
  drawFinder(set, size - 7, 0);
  drawFinder(set, 0, size - 7);
  for (let i = 8; i < size - 8; i += 1) {
    set(i, 6, i % 2 === 0);
    set(6, i, i % 2 === 0);
  }
  for (const x of QR_ALIGNMENT[version]) {
    for (const y of QR_ALIGNMENT[version]) {
      if (
        (x === 6 && y === 6) ||
        (x === 6 && y === size - 7) ||
        (x === size - 7 && y === 6)
      ) {
        continue;
      }
      drawAlignment(set, x, y);
    }
  }
  set(8, size - 8, true);
  drawFormat(set, size, QR_FORMAT_L_MASK_0);

  const bits = [...data, ...ecc].flatMap((byte) => byteBits(byte));
  let bitIndex = 0;
  let upward = true;
  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right -= 1;
    for (let row = 0; row < size; row += 1) {
      const y = upward ? size - 1 - row : row;
      for (let col = 0; col < 2; col += 1) {
        const x = right - col;
        if (reserved[y][x]) continue;
        const bit = bits[bitIndex] === 1;
        bitIndex += 1;
        set(x, y, bit !== ((x + y) % 2 === 0), false);
      }
    }
    upward = !upward;
  }

  return {
    size,
    modules: modules.map((row) => row.map(Boolean)),
  };
}

function neededBits(byteLength: number): number {
  return 4 + 8 + byteLength * 8 + 4;
}

function createDataCodewords(bytes: number[], capacity: number): number[] {
  const bits = [
    ...numberBits(0b0100, 4),
    ...numberBits(bytes.length, 8),
    ...bytes.flatMap(byteBits),
  ];
  const totalBits = capacity * 8;
  bits.push(...Array(Math.min(4, totalBits - bits.length)).fill(0));
  while (bits.length % 8 !== 0) bits.push(0);

  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    data.push(bits.slice(i, i + 8).reduce((byte, bit) => (byte << 1) | bit, 0));
  }
  for (let i = 0; data.length < capacity; i += 1) {
    data.push(i % 2 === 0 ? 0xec : 0x11);
  }
  return data;
}

function drawFinder(
  set: (x: number, y: number, dark: boolean, reserve?: boolean) => void,
  x: number,
  y: number,
) {
  for (let dy = -1; dy <= 7; dy += 1) {
    for (let dx = -1; dx <= 7; dx += 1) {
      const xx = x + dx;
      const yy = y + dy;
      const inFinder = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6;
      const dark =
        inFinder &&
        (dx === 0 ||
          dx === 6 ||
          dy === 0 ||
          dy === 6 ||
          (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4));
      set(xx, yy, dark);
    }
  }
}

function drawAlignment(
  set: (x: number, y: number, dark: boolean, reserve?: boolean) => void,
  x: number,
  y: number,
) {
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      set(
        x + dx,
        y + dy,
        Math.max(Math.abs(dx), Math.abs(dy)) !== 1,
      );
    }
  }
}

function drawFormat(
  set: (x: number, y: number, dark: boolean, reserve?: boolean) => void,
  size: number,
  format: number,
) {
  const first = [
    [8, 0],
    [8, 1],
    [8, 2],
    [8, 3],
    [8, 4],
    [8, 5],
    [8, 7],
    [8, 8],
    [7, 8],
    [5, 8],
    [4, 8],
    [3, 8],
    [2, 8],
    [1, 8],
    [0, 8],
  ];
  const second = [
    [size - 1, 8],
    [size - 2, 8],
    [size - 3, 8],
    [size - 4, 8],
    [size - 5, 8],
    [size - 6, 8],
    [size - 7, 8],
    [8, size - 8],
    [8, size - 7],
    [8, size - 6],
    [8, size - 5],
    [8, size - 4],
    [8, size - 3],
    [8, size - 2],
    [8, size - 1],
  ];
  [...first, ...second].forEach(([x, y], index) => {
    set(x, y, ((format >> (index % 15)) & 1) === 1);
  });
}

function byteBits(byte: number): number[] {
  return numberBits(byte, 8);
}

function numberBits(value: number, length: number): number[] {
  return Array.from(
    { length },
    (_, index) => (value >> (length - index - 1)) & 1,
  );
}

function reedSolomon(data: number[], degree: number): number[] {
  const generator = rsGenerator(degree);
  const result = Array<number>(degree).fill(0);
  for (const byte of data) {
    const factor = byte ^ result.shift()!;
    result.push(0);
    generator.forEach((coefficient, index) => {
      result[index] ^= gfMul(coefficient, factor);
    });
  }
  return result;
}

function rsGenerator(degree: number): number[] {
  let coefficients = [1];
  for (let i = 0; i < degree; i += 1) {
    coefficients = polyMul(coefficients, [1, gfPow(2, i)]);
  }
  return coefficients.slice(1);
}

function polyMul(a: number[], b: number[]): number[] {
  const result = Array<number>(a.length + b.length - 1).fill(0);
  a.forEach((x, i) => {
    b.forEach((y, j) => {
      result[i + j] ^= gfMul(x, y);
    });
  });
  return result;
}

function gfPow(value: number, power: number): number {
  let result = 1;
  for (let i = 0; i < power; i += 1) result = gfMul(result, value);
  return result;
}

function gfMul(a: number, b: number): number {
  let result = 0;
  let x = a;
  let y = b;
  while (y > 0) {
    if (y & 1) result ^= x;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
    y >>= 1;
  }
  return result;
}
